import { B as Buffer } from './lazy-chunk-buffer-es6.es.js';
import './lazy-chunk-events.es.js';
import { l as log } from './lazy-chunk-index.es.js';
import { c as createCommonjsModule } from './lazy-chunk-_commonjsHelpers.es.js';
import './lazy-chunk-sha256.es.js';
import { b as browser$1, s as sha_js, r as ripemd160 } from './lazy-chunk-index.es3.js';

/*
 * Bitcoin BIP32 path helpers
 * (C) 2016 Alex Beregszaszi
 */

const HARDENED = 0x80000000;

var BIPPath = function (path) {
  if (!Array.isArray(path)) {
    throw new Error('Input must be an Array')
  }
  if (path.length === 0) {
    throw new Error('Path must contain at least one level')
  }
  for (var i = 0; i < path.length; i++) {
    if (typeof path[i] !== 'number') {
      throw new Error('Path element is not a number')
    }
  }
  this.path = path;
};

BIPPath.validatePathArray = function (path) {
  try {
    BIPPath.fromPathArray(path);
    return true
  } catch (e) {
    return false
  }
};

BIPPath.validateString = function (text, reqRoot) {
  try {
    BIPPath.fromString(text, reqRoot);
    return true
  } catch (e) {
    return false
  }
};

BIPPath.fromPathArray = function (path) {
  return new BIPPath(path)
};

BIPPath.fromString = function (text, reqRoot) {
  // skip the root
  if (/^m\//i.test(text)) {
    text = text.slice(2);
  } else if (reqRoot) {
    throw new Error('Root element is required')
  }

  var path = text.split('/');
  var ret = new Array(path.length);
  for (var i = 0; i < path.length; i++) {
    var tmp = /(\d+)([hH\']?)/.exec(path[i]);
    if (tmp === null) {
      throw new Error('Invalid input')
    }
    ret[i] = parseInt(tmp[1], 10);

    if (ret[i] >= HARDENED) {
      throw new Error('Invalid child index')
    }

    if (tmp[2] === 'h' || tmp[2] === 'H' || tmp[2] === '\'') {
      ret[i] += HARDENED;
    } else if (tmp[2].length != 0) {
      throw new Error('Invalid modifier')
    }
  }
  return new BIPPath(ret)
};

BIPPath.prototype.toPathArray = function () {
  return this.path
};

BIPPath.prototype.toString = function (noRoot, oldStyle) {
  var ret = new Array(this.path.length);
  for (var i = 0; i < this.path.length; i++) {
    var tmp = this.path[i];
    if (tmp & HARDENED) {
      ret[i] = (tmp & ~HARDENED) + (oldStyle ? 'h' : '\'');
    } else {
      ret[i] = tmp;
    }
  }
  return (noRoot ? '' : 'm/') + ret.join('/')
};

BIPPath.prototype.inspect = function () {
  return 'BIPPath <' + this.toString() + '>'
};

var bip32Path = BIPPath;

// flow
const MAX_SCRIPT_BLOCK = 50;
const DEFAULT_VERSION = 1;
const DEFAULT_LOCKTIME = 0;
const DEFAULT_SEQUENCE = 0xffffffff;
const SIGHASH_ALL = 1;
const OP_DUP = 0x76;
const OP_HASH160 = 0xa9;
const HASH_SIZE = 0x14;
const OP_EQUALVERIFY = 0x88;
const OP_CHECKSIG = 0xac;

async function signMessage(transport, {
  path,
  messageHex
}) {
  const paths = bip32Path.fromString(path).toPathArray();
  const message = Buffer.from(messageHex, "hex");
  let offset = 0;

  while (offset !== message.length) {
    let maxChunkSize = offset === 0 ? MAX_SCRIPT_BLOCK - 1 - paths.length * 4 - 4 : MAX_SCRIPT_BLOCK;
    let chunkSize = offset + maxChunkSize > message.length ? message.length - offset : maxChunkSize;
    const buffer = Buffer.alloc(offset === 0 ? 1 + paths.length * 4 + 2 + chunkSize : chunkSize);

    if (offset === 0) {
      buffer[0] = paths.length;
      paths.forEach((element, index) => {
        buffer.writeUInt32BE(element, 1 + 4 * index);
      });
      buffer.writeUInt16BE(message.length, 1 + 4 * paths.length);
      message.copy(buffer, 1 + 4 * paths.length + 2, offset, offset + chunkSize);
    } else {
      message.copy(buffer, 0, offset, offset + chunkSize);
    }

    await transport.send(0xe0, 0x4e, 0x00, offset === 0 ? 0x01 : 0x80, buffer);
    offset += chunkSize;
  }

  const res = await transport.send(0xe0, 0x4e, 0x80, 0x00, Buffer.from([0x00]));
  const v = res[0] - 0x30;
  let r = res.slice(4, 4 + res[3]);

  if (r[0] === 0) {
    r = r.slice(1);
  }

  r = r.toString("hex");
  offset = 4 + res[3] + 2;
  let s = res.slice(offset, offset + res[offset - 1]);

  if (s[0] === 0) {
    s = s.slice(1);
  }

  s = s.toString("hex");
  return {
    v,
    r,
    s
  };
}

function bip32asBuffer(path) {
  const paths = !path ? [] : bip32Path.fromString(path).toPathArray();
  let buffer = Buffer.alloc(1 + paths.length * 4);
  buffer[0] = paths.length;
  paths.forEach((element, index) => {
    buffer.writeUInt32BE(element, 1 + 4 * index);
  });
  return buffer;
}

/**
 * address format is one of legacy | p2sh | bech32 | cashaddr
 */

const addressFormatMap = {
  legacy: 0,
  p2sh: 1,
  bech32: 2,
  cashaddr: 3
};
async function getWalletPublicKey(transport, options) {
  const {
    path,
    verify,
    format
  } = {
    verify: false,
    format: "legacy",
    ...options
  };

  if (!(format in addressFormatMap)) {
    throw new Error("btc.getWalletPublicKey invalid format=" + format);
  }

  const buffer = bip32asBuffer(path);
  var p1 = verify ? 1 : 0;
  var p2 = addressFormatMap[format];
  const response = await transport.send(0xe0, 0x40, p1, p2, buffer);
  const publicKeyLength = response[0];
  const addressLength = response[1 + publicKeyLength];
  const publicKey = response.slice(1, 1 + publicKeyLength).toString("hex");
  const bitcoinAddress = response.slice(1 + publicKeyLength + 1, 1 + publicKeyLength + 1 + addressLength).toString("ascii");
  const chainCode = response.slice(1 + publicKeyLength + 1 + addressLength, 1 + publicKeyLength + 1 + addressLength + 32).toString("hex");
  return {
    publicKey,
    bitcoinAddress,
    chainCode
  };
}
//# sourceMappingURL=getWalletPublicKey.js.map

function getVarint(data, offset) {
  if (data[offset] < 0xfd) {
    return [data[offset], 1];
  }

  if (data[offset] === 0xfd) {
    return [(data[offset + 2] << 8) + data[offset + 1], 3];
  }

  if (data[offset] === 0xfe) {
    return [(data[offset + 4] << 24) + (data[offset + 3] << 16) + (data[offset + 2] << 8) + data[offset + 1], 5];
  }

  throw new Error("getVarint called with unexpected parameters");
}
function createVarint(value) {
  if (value < 0xfd) {
    const buffer = Buffer.alloc(1);
    buffer[0] = value;
    return buffer;
  }

  if (value <= 0xffff) {
    const buffer = Buffer.alloc(3);
    buffer[0] = 0xfd;
    buffer[1] = value & 0xff;
    buffer[2] = value >> 8 & 0xff;
    return buffer;
  }

  const buffer = Buffer.alloc(5);
  buffer[0] = 0xfe;
  buffer[1] = value & 0xff;
  buffer[2] = value >> 8 & 0xff;
  buffer[3] = value >> 16 & 0xff;
  buffer[4] = value >> 24 & 0xff;
  return buffer;
}

function formatTransactionDebug(transaction) {
  let str = "TX";
  str += " version " + transaction.version.toString("hex");

  if (transaction.locktime) {
    str += " locktime " + transaction.locktime.toString("hex");
  }

  if (transaction.witness) {
    str += " witness " + transaction.witness.toString("hex");
  }

  if (transaction.timestamp) {
    str += " timestamp " + transaction.timestamp.toString("hex");
  }

  if (transaction.nVersionGroupId) {
    str += " nVersionGroupId " + transaction.nVersionGroupId.toString("hex");
  }

  if (transaction.nExpiryHeight) {
    str += " nExpiryHeight " + transaction.nExpiryHeight.toString("hex");
  }

  if (transaction.extraData) {
    str += " extraData " + transaction.extraData.toString("hex");
  }

  transaction.inputs.forEach(({
    prevout,
    script,
    sequence
  }, i) => {
    str += `\ninput ${i}:`;
    str += ` prevout ${prevout.toString("hex")}`;
    str += ` script ${script.toString("hex")}`;
    str += ` sequence ${sequence.toString("hex")}`;
  });
  (transaction.outputs || []).forEach(({
    amount,
    script
  }, i) => {
    str += `\noutput ${i}:`;
    str += ` amount ${amount.toString("hex")}`;
    str += ` script ${script.toString("hex")}`;
  });
  return str;
}

function splitTransaction(transactionHex, isSegwitSupported = false, hasTimestamp = false, hasExtraData = false, additionals = []) {
  const inputs = [];
  const outputs = [];
  var witness = false;
  let offset = 0;
  let timestamp = Buffer.alloc(0);
  let nExpiryHeight = Buffer.alloc(0);
  let nVersionGroupId = Buffer.alloc(0);
  let extraData = Buffer.alloc(0);
  const isDecred = additionals.includes("decred");
  const transaction = Buffer.from(transactionHex, "hex");
  const version = transaction.slice(offset, offset + 4);
  const overwinter = version.equals(Buffer.from([0x03, 0x00, 0x00, 0x80])) || version.equals(Buffer.from([0x04, 0x00, 0x00, 0x80]));
  offset += 4;

  if (!hasTimestamp && isSegwitSupported && transaction[offset] === 0 && transaction[offset + 1] !== 0) {
    offset += 2;
    witness = true;
  }

  if (hasTimestamp) {
    timestamp = transaction.slice(offset, 4 + offset);
    offset += 4;
  }

  if (overwinter) {
    nVersionGroupId = transaction.slice(offset, 4 + offset);
    offset += 4;
  }

  let varint = getVarint(transaction, offset);
  const numberInputs = varint[0];
  offset += varint[1];

  for (let i = 0; i < numberInputs; i++) {
    const prevout = transaction.slice(offset, offset + 36);
    offset += 36;
    let script = Buffer.alloc(0);
    let tree = Buffer.alloc(0); //No script for decred, it has a witness

    if (!isDecred) {
      varint = getVarint(transaction, offset);
      offset += varint[1];
      script = transaction.slice(offset, offset + varint[0]);
      offset += varint[0];
    } else {
      //Tree field
      tree = transaction.slice(offset, offset + 1);
      offset += 1;
    }

    const sequence = transaction.slice(offset, offset + 4);
    offset += 4;
    inputs.push({
      prevout,
      script,
      sequence,
      tree
    });
  }

  varint = getVarint(transaction, offset);
  const numberOutputs = varint[0];
  offset += varint[1];

  for (let i = 0; i < numberOutputs; i++) {
    const amount = transaction.slice(offset, offset + 8);
    offset += 8;

    if (isDecred) {
      //Script version
      offset += 2;
    }

    varint = getVarint(transaction, offset);
    offset += varint[1];
    const script = transaction.slice(offset, offset + varint[0]);
    offset += varint[0];
    outputs.push({
      amount,
      script
    });
  }

  let witnessScript, locktime;

  if (witness) {
    witnessScript = transaction.slice(offset, -4);
    locktime = transaction.slice(transaction.length - 4);
  } else {
    locktime = transaction.slice(offset, offset + 4);
  }

  offset += 4;

  if (overwinter || isDecred) {
    nExpiryHeight = transaction.slice(offset, offset + 4);
    offset += 4;
  }

  if (hasExtraData) {
    extraData = transaction.slice(offset);
  } //Get witnesses for Decred


  if (isDecred) {
    varint = getVarint(transaction, offset);
    offset += varint[1];

    if (varint[0] !== numberInputs) {
      throw new Error("splitTransaction: incoherent number of witnesses");
    }

    for (let i = 0; i < numberInputs; i++) {
      //amount
      offset += 8; //block height

      offset += 4; //block index

      offset += 4; //Script size

      varint = getVarint(transaction, offset);
      offset += varint[1];
      const script = transaction.slice(offset, offset + varint[0]);
      offset += varint[0];
      inputs[i].script = script;
    }
  }

  const t = {
    version,
    inputs,
    outputs,
    locktime,
    witness: witnessScript,
    timestamp,
    nVersionGroupId,
    nExpiryHeight,
    extraData
  };
  log("btc", `splitTransaction ${transactionHex}:\n${formatTransactionDebug(t)}`);
  return t;
}

/**
 * Use invariant() to assert state which your program assumes to be true.
 *
 * Provide sprintf-style format (only %s is supported) and arguments
 * to provide information about what broke and what you were
 * expecting.
 *
 * The invariant message will be stripped in production, but the invariant
 * will remain to ensure logic does not differ in production.
 */

var invariant = function(condition, format, a, b, c, d, e, f) {
  if (browser$1.env.NODE_ENV !== 'production') {
    if (format === undefined) {
      throw new Error('invariant requires an error message argument');
    }
  }

  if (!condition) {
    var error;
    if (format === undefined) {
      error = new Error(
        'Minified exception occurred; use the non-minified dev environment ' +
        'for the full error message and additional helpful warnings.'
      );
    } else {
      var args = [a, b, c, d, e, f];
      var argIndex = 0;
      error = new Error(
        format.replace(/%s/g, function() { return args[argIndex++]; })
      );
      error.name = 'Invariant Violation';
    }

    error.framesToPop = 1; // we don't care about invariant's own frame
    throw error;
  }
};

var browser = invariant;

async function getTrustedInputRaw(transport, transactionData, indexLookup) {
  let data;
  let firstRound = false;

  if (typeof indexLookup === "number") {
    firstRound = true;
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32BE(indexLookup, 0);
    data = Buffer.concat([prefix, transactionData], transactionData.length + 4);
  } else {
    data = transactionData;
  }

  const trustedInput = await transport.send(0xe0, 0x42, firstRound ? 0x00 : 0x80, 0x00, data);
  const res = trustedInput.slice(0, trustedInput.length - 2).toString("hex");
  return res;
}
async function getTrustedInput(transport, indexLookup, transaction, additionals = []) {
  const {
    version,
    inputs,
    outputs,
    locktime,
    nExpiryHeight,
    extraData
  } = transaction;

  if (!outputs || !locktime) {
    throw new Error("getTrustedInput: locktime & outputs is expected");
  }

  const isDecred = additionals.includes("decred");
  const isXST = additionals.includes("stealthcoin");

  const processScriptBlocks = async (script, sequence) => {
    const seq = sequence || Buffer.alloc(0);
    const scriptBlocks = [];
    let offset = 0;

    while (offset !== script.length) {
      let blockSize = script.length - offset > MAX_SCRIPT_BLOCK ? MAX_SCRIPT_BLOCK : script.length - offset;

      if (offset + blockSize !== script.length) {
        scriptBlocks.push(script.slice(offset, offset + blockSize));
      } else {
        scriptBlocks.push(Buffer.concat([script.slice(offset, offset + blockSize), seq]));
      }

      offset += blockSize;
    } // Handle case when no script length: we still want to pass the sequence
    // relatable: https://github.com/LedgerHQ/ledger-live-desktop/issues/1386


    if (script.length === 0) {
      scriptBlocks.push(seq);
    }

    let res;

    for (let scriptBlock of scriptBlocks) {
      res = await getTrustedInputRaw(transport, scriptBlock);
    }

    return res;
  };

  const processWholeScriptBlock = block => getTrustedInputRaw(transport, block);

  await getTrustedInputRaw(transport, Buffer.concat([transaction.version, transaction.timestamp || Buffer.alloc(0), transaction.nVersionGroupId || Buffer.alloc(0), createVarint(inputs.length)]), indexLookup);

  for (let input of inputs) {
    const isXSTV2 = isXST && Buffer.compare(version, Buffer.from([0x02, 0x00, 0x00, 0x00])) === 0;
    const treeField = isDecred ? input.tree || Buffer.from([0x00]) : Buffer.alloc(0);
    const data = Buffer.concat([input.prevout, treeField, isXSTV2 ? Buffer.from([0x00]) : createVarint(input.script.length)]);
    await getTrustedInputRaw(transport, data); // iteration (eachSeries) ended
    // TODO notify progress
    // deferred.notify("input");
    // Reference: https://github.com/StealthSend/Stealth/commit/5be35d6c2c500b32ed82e5d6913d66d18a4b0a7f#diff-e8db9b851adc2422aadfffca88f14c91R566

    await (isDecred ? processWholeScriptBlock(Buffer.concat([input.script, input.sequence])) : isXSTV2 ? processWholeScriptBlock(input.sequence) : processScriptBlocks(input.script, input.sequence));
  }

  await getTrustedInputRaw(transport, createVarint(outputs.length));

  for (let output of outputs) {
    const data = Buffer.concat([output.amount, isDecred ? Buffer.from([0x00, 0x00]) : Buffer.alloc(0), //Version script
    createVarint(output.script.length), output.script]);
    await getTrustedInputRaw(transport, data);
  }

  const endData = [];

  if (nExpiryHeight && nExpiryHeight.length > 0) {
    endData.push(nExpiryHeight);
  }

  if (extraData && extraData.length > 0) {
    endData.push(extraData);
  }

  let extraPart;

  if (endData.length) {
    const data = Buffer.concat(endData);
    extraPart = isDecred ? data : Buffer.concat([createVarint(data.length), data]);
  }

  const res = await processScriptBlocks(Buffer.concat([locktime, extraPart || Buffer.alloc(0)]));
  browser(res, "missing result in processScriptBlocks");
  return res;
}

/**
  @example
const tx1 = btc.splitTransaction("01000000014ea60aeac5252c14291d428915bd7ccd1bfc4af009f4d4dc57ae597ed0420b71010000008a47304402201f36a12c240dbf9e566bc04321050b1984cd6eaf6caee8f02bb0bfec08e3354b022012ee2aeadcbbfd1e92959f57c15c1c6debb757b798451b104665aa3010569b49014104090b15bde569386734abf2a2b99f9ca6a50656627e77de663ca7325702769986cf26cc9dd7fdea0af432c8e2becc867c932e1b9dd742f2a108997c2252e2bdebffffffff0281b72e00000000001976a91472a5d75c8d2d0565b656a5232703b167d50d5a2b88aca0860100000000001976a9144533f5fb9b4817f713c48f0bfe96b9f50c476c9b88ac00000000");
const outputScript = btc.serializeTransactionOutputs(tx1).toString('hex');
  */

function serializeTransactionOutputs({
  outputs
}) {
  let outputBuffer = Buffer.alloc(0);

  if (typeof outputs !== "undefined") {
    outputBuffer = Buffer.concat([outputBuffer, createVarint(outputs.length)]);
    outputs.forEach(output => {
      outputBuffer = Buffer.concat([outputBuffer, output.amount, createVarint(output.script.length), output.script]);
    });
  }

  return outputBuffer;
}
function serializeTransaction(transaction, skipWitness, timestamp, additionals = []) {
  const isDecred = additionals.includes("decred");
  const isBech32 = additionals.includes("bech32");
  let inputBuffer = Buffer.alloc(0);
  let useWitness = typeof transaction["witness"] != "undefined" && !skipWitness;
  transaction.inputs.forEach(input => {
    inputBuffer = isDecred || isBech32 ? Buffer.concat([inputBuffer, input.prevout, Buffer.from([0x00]), //tree
    input.sequence]) : Buffer.concat([inputBuffer, input.prevout, createVarint(input.script.length), input.script, input.sequence]);
  });
  let outputBuffer = serializeTransactionOutputs(transaction);

  if (typeof transaction.outputs !== "undefined" && typeof transaction.locktime !== "undefined") {
    outputBuffer = Buffer.concat([outputBuffer, useWitness && transaction.witness || Buffer.alloc(0), transaction.locktime, transaction.nExpiryHeight || Buffer.alloc(0), transaction.extraData || Buffer.alloc(0)]);
  }

  return Buffer.concat([transaction.version, timestamp ? timestamp : Buffer.alloc(0), transaction.nVersionGroupId || Buffer.alloc(0), useWitness ? Buffer.from("0001", "hex") : Buffer.alloc(0), createVarint(transaction.inputs.length), inputBuffer, outputBuffer]);
}

function getTrustedInputBIP143(transport, indexLookup, transaction, additionals = []) {
  if (!transaction) {
    throw new Error("getTrustedInputBIP143: missing tx");
  }

  const isDecred = additionals.includes("decred");

  if (isDecred) {
    throw new Error("Decred does not implement BIP143");
  }

  let hash = sha_js("sha256").update(sha_js("sha256").update(serializeTransaction(transaction, true)).digest()).digest();
  const data = Buffer.alloc(4);
  data.writeUInt32LE(indexLookup, 0);
  const {
    outputs,
    locktime
  } = transaction;

  if (!outputs || !locktime) {
    throw new Error("getTrustedInputBIP143: locktime & outputs is expected");
  }

  if (!outputs[indexLookup]) {
    throw new Error("getTrustedInputBIP143: wrong index");
  }

  hash = Buffer.concat([hash, data, outputs[indexLookup].amount]);
  return hash.toString("hex");
}

function hashPublicKey(buffer) {
  return new ripemd160().update(sha_js("sha256").update(buffer).digest()).digest();
}

function startUntrustedHashTransactionInputRaw(transport, newTransaction, firstRound, transactionData, bip143 = false, overwinter = false, additionals = []) {
  const p2 = additionals.includes("cashaddr") ? 0x03 : bip143 ? additionals.includes("sapling") ? 0x05 : overwinter ? 0x04 : 0x02 : 0x00;
  return transport.send(0xe0, 0x44, firstRound ? 0x00 : 0x80, newTransaction ? p2 : 0x80, transactionData);
}
async function startUntrustedHashTransactionInput(transport, newTransaction, transaction, inputs, bip143 = false, overwinter = false, additionals = [], useTrustedInputForSegwit = false) {
  let data = Buffer.concat([transaction.version, transaction.timestamp || Buffer.alloc(0), transaction.nVersionGroupId || Buffer.alloc(0), createVarint(transaction.inputs.length)]);
  await startUntrustedHashTransactionInputRaw(transport, newTransaction, true, data, bip143, overwinter, additionals);
  let i = 0;
  const isDecred = additionals.includes("decred");

  for (let input of transaction.inputs) {
    let prefix;
    let inputValue = inputs[i].value;

    if (bip143) {
      if (useTrustedInputForSegwit && inputs[i].trustedInput) {
        prefix = Buffer.from([0x01, inputValue.length]);
      } else {
        prefix = Buffer.from([0x02]);
      }
    } else {
      if (inputs[i].trustedInput) {
        prefix = Buffer.from([0x01, inputs[i].value.length]);
      } else {
        prefix = Buffer.from([0x00]);
      }
    }

    data = Buffer.concat([prefix, inputValue, isDecred ? Buffer.from([0x00]) : Buffer.alloc(0), createVarint(input.script.length)]);
    await startUntrustedHashTransactionInputRaw(transport, newTransaction, false, data, bip143, overwinter, additionals);
    let scriptBlocks = [];
    let offset = 0;

    if (input.script.length === 0) {
      scriptBlocks.push(input.sequence);
    } else {
      while (offset !== input.script.length) {
        let blockSize = input.script.length - offset > MAX_SCRIPT_BLOCK ? MAX_SCRIPT_BLOCK : input.script.length - offset;

        if (offset + blockSize !== input.script.length) {
          scriptBlocks.push(input.script.slice(offset, offset + blockSize));
        } else {
          scriptBlocks.push(Buffer.concat([input.script.slice(offset, offset + blockSize), input.sequence]));
        }

        offset += blockSize;
      }
    }

    for (let scriptBlock of scriptBlocks) {
      await startUntrustedHashTransactionInputRaw(transport, newTransaction, false, scriptBlock, bip143, overwinter, additionals);
    }

    i++;
  }
}

function compressPublicKey(publicKey) {
  const prefix = (publicKey[64] & 1) !== 0 ? 0x03 : 0x02;
  const prefixBuffer = Buffer.alloc(1);
  prefixBuffer[0] = prefix;
  return Buffer.concat([prefixBuffer, publicKey.slice(1, 1 + 32)]);
}

function signTransaction(transport, path, lockTime, sigHashType, expiryHeight, additionals = []) {
  const isDecred = additionals.includes("decred");
  const pathsBuffer = bip32asBuffer(path);
  const lockTimeBuffer = Buffer.alloc(4);
  lockTimeBuffer.writeUInt32BE(lockTime, 0);
  let buffer = isDecred ? Buffer.concat([pathsBuffer, lockTimeBuffer, expiryHeight || Buffer.from([0x00, 0x00, 0x00, 0x00]), Buffer.from([sigHashType])]) : Buffer.concat([pathsBuffer, Buffer.from([0x00]), lockTimeBuffer, Buffer.from([sigHashType])]);

  if (expiryHeight && !isDecred) {
    buffer = Buffer.concat([buffer, expiryHeight]);
  }

  return transport.send(0xe0, 0x48, 0x00, 0x00, buffer).then(result => {
    if (result.length > 0) {
      result[0] = 0x30;
      return result.slice(0, result.length - 2);
    }

    return result;
  });
}

function provideOutputFullChangePath(transport, path) {
  let buffer = bip32asBuffer(path);
  return transport.send(0xe0, 0x4a, 0xff, 0x00, buffer);
}
async function hashOutputFull(transport, outputScript, additionals = []) {
  let offset = 0;
  let p1 = 0x80;
  const isDecred = additionals.includes("decred"); ///WARNING: Decred works only with one call (without chunking)
  //TODO: test without this for Decred

  if (isDecred) {
    return transport.send(0xe0, 0x4a, p1, 0x00, outputScript);
  }

  while (offset < outputScript.length) {
    let blockSize = offset + MAX_SCRIPT_BLOCK >= outputScript.length ? outputScript.length - offset : MAX_SCRIPT_BLOCK;
    let p1 = offset + blockSize === outputScript.length ? 0x80 : 0x00;
    let data = outputScript.slice(offset, offset + blockSize);
    await transport.send(0xe0, 0x4a, p1, 0x00, data);
    offset += blockSize;
  }
}
//# sourceMappingURL=finalizeInput.js.map

const getAppAndVersion = async (transport) => {
  const r = await transport.send(0xb0, 0x01, 0x00, 0x00);
  let i = 0;
  const format = r[i++];
  browser(format === 1, "getAppAndVersion: format not supported");
  const nameLength = r[i++];
  const name = r.slice(i, i += nameLength).toString("ascii");
  const versionLength = r[i++];
  const version = r.slice(i, i += versionLength).toString("ascii");
  const flagLength = r[i++];
  const flags = r.slice(i, i += flagLength);
  return {
    name,
    version,
    flags
  };
};

// Note: this is the semver.org version of the spec that it implements
// Not necessarily the package version of this code.
const SEMVER_SPEC_VERSION = '2.0.0';

const MAX_LENGTH = 256;
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER ||
  /* istanbul ignore next */ 9007199254740991;

// Max safe segment length for coercion.
const MAX_SAFE_COMPONENT_LENGTH = 16;

var constants = {
  SEMVER_SPEC_VERSION,
  MAX_LENGTH,
  MAX_SAFE_INTEGER,
  MAX_SAFE_COMPONENT_LENGTH
};

const debug = (
  typeof browser$1 === 'object' &&
  browser$1.env &&
  browser$1.env.NODE_DEBUG &&
  /\bsemver\b/i.test(browser$1.env.NODE_DEBUG)
) ? (...args) => console.error('SEMVER', ...args)
  : () => {};

var debug_1 = debug;

var re_1 = createCommonjsModule(function (module, exports) {
const { MAX_SAFE_COMPONENT_LENGTH } = constants;

exports = module.exports = {};

// The actual regexps go on exports.re
const re = exports.re = [];
const src = exports.src = [];
const t = exports.t = {};
let R = 0;

const createToken = (name, value, isGlobal) => {
  const index = R++;
  debug_1(index, value);
  t[name] = index;
  src[index] = value;
  re[index] = new RegExp(value, isGlobal ? 'g' : undefined);
};

// The following Regular Expressions can be used for tokenizing,
// validating, and parsing SemVer version strings.

// ## Numeric Identifier
// A single `0`, or a non-zero digit followed by zero or more digits.

createToken('NUMERICIDENTIFIER', '0|[1-9]\\d*');
createToken('NUMERICIDENTIFIERLOOSE', '[0-9]+');

// ## Non-numeric Identifier
// Zero or more digits, followed by a letter or hyphen, and then zero or
// more letters, digits, or hyphens.

createToken('NONNUMERICIDENTIFIER', '\\d*[a-zA-Z-][a-zA-Z0-9-]*');

// ## Main Version
// Three dot-separated numeric identifiers.

createToken('MAINVERSION', `(${src[t.NUMERICIDENTIFIER]})\\.` +
                   `(${src[t.NUMERICIDENTIFIER]})\\.` +
                   `(${src[t.NUMERICIDENTIFIER]})`);

createToken('MAINVERSIONLOOSE', `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.` +
                        `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.` +
                        `(${src[t.NUMERICIDENTIFIERLOOSE]})`);

// ## Pre-release Version Identifier
// A numeric identifier, or a non-numeric identifier.

createToken('PRERELEASEIDENTIFIER', `(?:${src[t.NUMERICIDENTIFIER]
}|${src[t.NONNUMERICIDENTIFIER]})`);

createToken('PRERELEASEIDENTIFIERLOOSE', `(?:${src[t.NUMERICIDENTIFIERLOOSE]
}|${src[t.NONNUMERICIDENTIFIER]})`);

// ## Pre-release Version
// Hyphen, followed by one or more dot-separated pre-release version
// identifiers.

createToken('PRERELEASE', `(?:-(${src[t.PRERELEASEIDENTIFIER]
}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);

createToken('PRERELEASELOOSE', `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]
}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);

// ## Build Metadata Identifier
// Any combination of digits, letters, or hyphens.

createToken('BUILDIDENTIFIER', '[0-9A-Za-z-]+');

// ## Build Metadata
// Plus sign, followed by one or more period-separated build metadata
// identifiers.

createToken('BUILD', `(?:\\+(${src[t.BUILDIDENTIFIER]
}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);

// ## Full Version String
// A main version, followed optionally by a pre-release version and
// build metadata.

// Note that the only major, minor, patch, and pre-release sections of
// the version string are capturing groups.  The build metadata is not a
// capturing group, because it should not ever be used in version
// comparison.

createToken('FULLPLAIN', `v?${src[t.MAINVERSION]
}${src[t.PRERELEASE]}?${
  src[t.BUILD]}?`);

createToken('FULL', `^${src[t.FULLPLAIN]}$`);

// like full, but allows v1.2.3 and =1.2.3, which people do sometimes.
// also, 1.0.0alpha1 (prerelease without the hyphen) which is pretty
// common in the npm registry.
createToken('LOOSEPLAIN', `[v=\\s]*${src[t.MAINVERSIONLOOSE]
}${src[t.PRERELEASELOOSE]}?${
  src[t.BUILD]}?`);

createToken('LOOSE', `^${src[t.LOOSEPLAIN]}$`);

createToken('GTLT', '((?:<|>)?=?)');

// Something like "2.*" or "1.2.x".
// Note that "x.x" is a valid xRange identifer, meaning "any version"
// Only the first item is strictly required.
createToken('XRANGEIDENTIFIERLOOSE', `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
createToken('XRANGEIDENTIFIER', `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);

createToken('XRANGEPLAIN', `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})` +
                   `(?:\\.(${src[t.XRANGEIDENTIFIER]})` +
                   `(?:\\.(${src[t.XRANGEIDENTIFIER]})` +
                   `(?:${src[t.PRERELEASE]})?${
                     src[t.BUILD]}?` +
                   `)?)?`);

createToken('XRANGEPLAINLOOSE', `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})` +
                        `(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})` +
                        `(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})` +
                        `(?:${src[t.PRERELEASELOOSE]})?${
                          src[t.BUILD]}?` +
                        `)?)?`);

createToken('XRANGE', `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
createToken('XRANGELOOSE', `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);

// Coercion.
// Extract anything that could conceivably be a part of a valid semver
createToken('COERCE', `${'(^|[^\\d])' +
              '(\\d{1,'}${MAX_SAFE_COMPONENT_LENGTH}})` +
              `(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?` +
              `(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?` +
              `(?:$|[^\\d])`);
createToken('COERCERTL', src[t.COERCE], true);

// Tilde ranges.
// Meaning is "reasonably at or greater than"
createToken('LONETILDE', '(?:~>?)');

createToken('TILDETRIM', `(\\s*)${src[t.LONETILDE]}\\s+`, true);
exports.tildeTrimReplace = '$1~';

createToken('TILDE', `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
createToken('TILDELOOSE', `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);

// Caret ranges.
// Meaning is "at least and backwards compatible with"
createToken('LONECARET', '(?:\\^)');

createToken('CARETTRIM', `(\\s*)${src[t.LONECARET]}\\s+`, true);
exports.caretTrimReplace = '$1^';

createToken('CARET', `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
createToken('CARETLOOSE', `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);

// A simple gt/lt/eq thing, or just "" to indicate "any version"
createToken('COMPARATORLOOSE', `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
createToken('COMPARATOR', `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);

// An expression to strip any whitespace between the gtlt and the thing
// it modifies, so that `> 1.2.3` ==> `>1.2.3`
createToken('COMPARATORTRIM', `(\\s*)${src[t.GTLT]
}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
exports.comparatorTrimReplace = '$1$2$3';

// Something like `1.2.3 - 1.2.4`
// Note that these all use the loose form, because they'll be
// checked against either the strict or loose comparator form
// later.
createToken('HYPHENRANGE', `^\\s*(${src[t.XRANGEPLAIN]})` +
                   `\\s+-\\s+` +
                   `(${src[t.XRANGEPLAIN]})` +
                   `\\s*$`);

createToken('HYPHENRANGELOOSE', `^\\s*(${src[t.XRANGEPLAINLOOSE]})` +
                        `\\s+-\\s+` +
                        `(${src[t.XRANGEPLAINLOOSE]})` +
                        `\\s*$`);

// Star ranges basically just allow anything at all.
createToken('STAR', '(<|>)?=?\\s*\\*');
// >=0.0.0 is like a star
createToken('GTE0', '^\\s*>=\\s*0\.0\.0\\s*$');
createToken('GTE0PRE', '^\\s*>=\\s*0\.0\.0-0\\s*$');
});
var re_2 = re_1.re;
var re_3 = re_1.src;
var re_4 = re_1.t;
var re_5 = re_1.tildeTrimReplace;
var re_6 = re_1.caretTrimReplace;
var re_7 = re_1.comparatorTrimReplace;

// parse out just the options we care about so we always get a consistent
// obj with keys in a consistent order.
const opts = ['includePrerelease', 'loose', 'rtl'];
const parseOptions = options =>
  !options ? {}
  : typeof options !== 'object' ? { loose: true }
  : opts.filter(k => options[k]).reduce((options, k) => {
    options[k] = true;
    return options
  }, {});
var parseOptions_1 = parseOptions;

const numeric = /^[0-9]+$/;
const compareIdentifiers = (a, b) => {
  const anum = numeric.test(a);
  const bnum = numeric.test(b);

  if (anum && bnum) {
    a = +a;
    b = +b;
  }

  return a === b ? 0
    : (anum && !bnum) ? -1
    : (bnum && !anum) ? 1
    : a < b ? -1
    : 1
};

const rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);

var identifiers = {
  compareIdentifiers,
  rcompareIdentifiers
};

const { MAX_LENGTH: MAX_LENGTH$1, MAX_SAFE_INTEGER: MAX_SAFE_INTEGER$1 } = constants;
const { re, t } = re_1;


const { compareIdentifiers: compareIdentifiers$1 } = identifiers;
class SemVer {
  constructor (version, options) {
    options = parseOptions_1(options);

    if (version instanceof SemVer) {
      if (version.loose === !!options.loose &&
          version.includePrerelease === !!options.includePrerelease) {
        return version
      } else {
        version = version.version;
      }
    } else if (typeof version !== 'string') {
      throw new TypeError(`Invalid Version: ${version}`)
    }

    if (version.length > MAX_LENGTH$1) {
      throw new TypeError(
        `version is longer than ${MAX_LENGTH$1} characters`
      )
    }

    debug_1('SemVer', version, options);
    this.options = options;
    this.loose = !!options.loose;
    // this isn't actually relevant for versions, but keep it so that we
    // don't run into trouble passing this.options around.
    this.includePrerelease = !!options.includePrerelease;

    const m = version.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);

    if (!m) {
      throw new TypeError(`Invalid Version: ${version}`)
    }

    this.raw = version;

    // these are actually numbers
    this.major = +m[1];
    this.minor = +m[2];
    this.patch = +m[3];

    if (this.major > MAX_SAFE_INTEGER$1 || this.major < 0) {
      throw new TypeError('Invalid major version')
    }

    if (this.minor > MAX_SAFE_INTEGER$1 || this.minor < 0) {
      throw new TypeError('Invalid minor version')
    }

    if (this.patch > MAX_SAFE_INTEGER$1 || this.patch < 0) {
      throw new TypeError('Invalid patch version')
    }

    // numberify any prerelease numeric ids
    if (!m[4]) {
      this.prerelease = [];
    } else {
      this.prerelease = m[4].split('.').map((id) => {
        if (/^[0-9]+$/.test(id)) {
          const num = +id;
          if (num >= 0 && num < MAX_SAFE_INTEGER$1) {
            return num
          }
        }
        return id
      });
    }

    this.build = m[5] ? m[5].split('.') : [];
    this.format();
  }

  format () {
    this.version = `${this.major}.${this.minor}.${this.patch}`;
    if (this.prerelease.length) {
      this.version += `-${this.prerelease.join('.')}`;
    }
    return this.version
  }

  toString () {
    return this.version
  }

  compare (other) {
    debug_1('SemVer.compare', this.version, this.options, other);
    if (!(other instanceof SemVer)) {
      if (typeof other === 'string' && other === this.version) {
        return 0
      }
      other = new SemVer(other, this.options);
    }

    if (other.version === this.version) {
      return 0
    }

    return this.compareMain(other) || this.comparePre(other)
  }

  compareMain (other) {
    if (!(other instanceof SemVer)) {
      other = new SemVer(other, this.options);
    }

    return (
      compareIdentifiers$1(this.major, other.major) ||
      compareIdentifiers$1(this.minor, other.minor) ||
      compareIdentifiers$1(this.patch, other.patch)
    )
  }

  comparePre (other) {
    if (!(other instanceof SemVer)) {
      other = new SemVer(other, this.options);
    }

    // NOT having a prerelease is > having one
    if (this.prerelease.length && !other.prerelease.length) {
      return -1
    } else if (!this.prerelease.length && other.prerelease.length) {
      return 1
    } else if (!this.prerelease.length && !other.prerelease.length) {
      return 0
    }

    let i = 0;
    do {
      const a = this.prerelease[i];
      const b = other.prerelease[i];
      debug_1('prerelease compare', i, a, b);
      if (a === undefined && b === undefined) {
        return 0
      } else if (b === undefined) {
        return 1
      } else if (a === undefined) {
        return -1
      } else if (a === b) {
        continue
      } else {
        return compareIdentifiers$1(a, b)
      }
    } while (++i)
  }

  compareBuild (other) {
    if (!(other instanceof SemVer)) {
      other = new SemVer(other, this.options);
    }

    let i = 0;
    do {
      const a = this.build[i];
      const b = other.build[i];
      debug_1('prerelease compare', i, a, b);
      if (a === undefined && b === undefined) {
        return 0
      } else if (b === undefined) {
        return 1
      } else if (a === undefined) {
        return -1
      } else if (a === b) {
        continue
      } else {
        return compareIdentifiers$1(a, b)
      }
    } while (++i)
  }

  // preminor will bump the version up to the next minor release, and immediately
  // down to pre-release. premajor and prepatch work the same way.
  inc (release, identifier) {
    switch (release) {
      case 'premajor':
        this.prerelease.length = 0;
        this.patch = 0;
        this.minor = 0;
        this.major++;
        this.inc('pre', identifier);
        break
      case 'preminor':
        this.prerelease.length = 0;
        this.patch = 0;
        this.minor++;
        this.inc('pre', identifier);
        break
      case 'prepatch':
        // If this is already a prerelease, it will bump to the next version
        // drop any prereleases that might already exist, since they are not
        // relevant at this point.
        this.prerelease.length = 0;
        this.inc('patch', identifier);
        this.inc('pre', identifier);
        break
      // If the input is a non-prerelease version, this acts the same as
      // prepatch.
      case 'prerelease':
        if (this.prerelease.length === 0) {
          this.inc('patch', identifier);
        }
        this.inc('pre', identifier);
        break

      case 'major':
        // If this is a pre-major version, bump up to the same major version.
        // Otherwise increment major.
        // 1.0.0-5 bumps to 1.0.0
        // 1.1.0 bumps to 2.0.0
        if (
          this.minor !== 0 ||
          this.patch !== 0 ||
          this.prerelease.length === 0
        ) {
          this.major++;
        }
        this.minor = 0;
        this.patch = 0;
        this.prerelease = [];
        break
      case 'minor':
        // If this is a pre-minor version, bump up to the same minor version.
        // Otherwise increment minor.
        // 1.2.0-5 bumps to 1.2.0
        // 1.2.1 bumps to 1.3.0
        if (this.patch !== 0 || this.prerelease.length === 0) {
          this.minor++;
        }
        this.patch = 0;
        this.prerelease = [];
        break
      case 'patch':
        // If this is not a pre-release version, it will increment the patch.
        // If it is a pre-release it will bump up to the same patch version.
        // 1.2.0-5 patches to 1.2.0
        // 1.2.0 patches to 1.2.1
        if (this.prerelease.length === 0) {
          this.patch++;
        }
        this.prerelease = [];
        break
      // This probably shouldn't be used publicly.
      // 1.0.0 'pre' would become 1.0.0-0 which is the wrong direction.
      case 'pre':
        if (this.prerelease.length === 0) {
          this.prerelease = [0];
        } else {
          let i = this.prerelease.length;
          while (--i >= 0) {
            if (typeof this.prerelease[i] === 'number') {
              this.prerelease[i]++;
              i = -2;
            }
          }
          if (i === -1) {
            // didn't increment anything
            this.prerelease.push(0);
          }
        }
        if (identifier) {
          // 1.2.0-beta.1 bumps to 1.2.0-beta.2,
          // 1.2.0-beta.fooblz or 1.2.0-beta bumps to 1.2.0-beta.0
          if (this.prerelease[0] === identifier) {
            if (isNaN(this.prerelease[1])) {
              this.prerelease = [identifier, 0];
            }
          } else {
            this.prerelease = [identifier, 0];
          }
        }
        break

      default:
        throw new Error(`invalid increment argument: ${release}`)
    }
    this.format();
    this.raw = this.version;
    return this
  }
}

var semver = SemVer;

const {MAX_LENGTH: MAX_LENGTH$2} = constants;
const { re: re$1, t: t$1 } = re_1;



const parse = (version, options) => {
  options = parseOptions_1(options);

  if (version instanceof semver) {
    return version
  }

  if (typeof version !== 'string') {
    return null
  }

  if (version.length > MAX_LENGTH$2) {
    return null
  }

  const r = options.loose ? re$1[t$1.LOOSE] : re$1[t$1.FULL];
  if (!r.test(version)) {
    return null
  }

  try {
    return new semver(version, options)
  } catch (er) {
    return null
  }
};

var parse_1 = parse;

const valid = (version, options) => {
  const v = parse_1(version, options);
  return v ? v.version : null
};
var valid_1 = valid;

const clean = (version, options) => {
  const s = parse_1(version.trim().replace(/^[=v]+/, ''), options);
  return s ? s.version : null
};
var clean_1 = clean;

const inc = (version, release, options, identifier) => {
  if (typeof (options) === 'string') {
    identifier = options;
    options = undefined;
  }

  try {
    return new semver(version, options).inc(release, identifier).version
  } catch (er) {
    return null
  }
};
var inc_1 = inc;

const compare = (a, b, loose) =>
  new semver(a, loose).compare(new semver(b, loose));

var compare_1 = compare;

const eq = (a, b, loose) => compare_1(a, b, loose) === 0;
var eq_1 = eq;

const diff = (version1, version2) => {
  if (eq_1(version1, version2)) {
    return null
  } else {
    const v1 = parse_1(version1);
    const v2 = parse_1(version2);
    const hasPre = v1.prerelease.length || v2.prerelease.length;
    const prefix = hasPre ? 'pre' : '';
    const defaultResult = hasPre ? 'prerelease' : '';
    for (const key in v1) {
      if (key === 'major' || key === 'minor' || key === 'patch') {
        if (v1[key] !== v2[key]) {
          return prefix + key
        }
      }
    }
    return defaultResult // may be undefined
  }
};
var diff_1 = diff;

const major = (a, loose) => new semver(a, loose).major;
var major_1 = major;

const minor = (a, loose) => new semver(a, loose).minor;
var minor_1 = minor;

const patch = (a, loose) => new semver(a, loose).patch;
var patch_1 = patch;

const prerelease = (version, options) => {
  const parsed = parse_1(version, options);
  return (parsed && parsed.prerelease.length) ? parsed.prerelease : null
};
var prerelease_1 = prerelease;

const rcompare = (a, b, loose) => compare_1(b, a, loose);
var rcompare_1 = rcompare;

const compareLoose = (a, b) => compare_1(a, b, true);
var compareLoose_1 = compareLoose;

const compareBuild = (a, b, loose) => {
  const versionA = new semver(a, loose);
  const versionB = new semver(b, loose);
  return versionA.compare(versionB) || versionA.compareBuild(versionB)
};
var compareBuild_1 = compareBuild;

const sort = (list, loose) => list.sort((a, b) => compareBuild_1(a, b, loose));
var sort_1 = sort;

const rsort = (list, loose) => list.sort((a, b) => compareBuild_1(b, a, loose));
var rsort_1 = rsort;

const gt = (a, b, loose) => compare_1(a, b, loose) > 0;
var gt_1 = gt;

const lt = (a, b, loose) => compare_1(a, b, loose) < 0;
var lt_1 = lt;

const neq = (a, b, loose) => compare_1(a, b, loose) !== 0;
var neq_1 = neq;

const gte = (a, b, loose) => compare_1(a, b, loose) >= 0;
var gte_1 = gte;

const lte = (a, b, loose) => compare_1(a, b, loose) <= 0;
var lte_1 = lte;

const cmp = (a, op, b, loose) => {
  switch (op) {
    case '===':
      if (typeof a === 'object')
        a = a.version;
      if (typeof b === 'object')
        b = b.version;
      return a === b

    case '!==':
      if (typeof a === 'object')
        a = a.version;
      if (typeof b === 'object')
        b = b.version;
      return a !== b

    case '':
    case '=':
    case '==':
      return eq_1(a, b, loose)

    case '!=':
      return neq_1(a, b, loose)

    case '>':
      return gt_1(a, b, loose)

    case '>=':
      return gte_1(a, b, loose)

    case '<':
      return lt_1(a, b, loose)

    case '<=':
      return lte_1(a, b, loose)

    default:
      throw new TypeError(`Invalid operator: ${op}`)
  }
};
var cmp_1 = cmp;

const {re: re$2, t: t$2} = re_1;

const coerce = (version, options) => {
  if (version instanceof semver) {
    return version
  }

  if (typeof version === 'number') {
    version = String(version);
  }

  if (typeof version !== 'string') {
    return null
  }

  options = options || {};

  let match = null;
  if (!options.rtl) {
    match = version.match(re$2[t$2.COERCE]);
  } else {
    // Find the right-most coercible string that does not share
    // a terminus with a more left-ward coercible string.
    // Eg, '1.2.3.4' wants to coerce '2.3.4', not '3.4' or '4'
    //
    // Walk through the string checking with a /g regexp
    // Manually set the index so as to pick up overlapping matches.
    // Stop when we get a match that ends at the string end, since no
    // coercible string can be more right-ward without the same terminus.
    let next;
    while ((next = re$2[t$2.COERCERTL].exec(version)) &&
        (!match || match.index + match[0].length !== version.length)
    ) {
      if (!match ||
            next.index + next[0].length !== match.index + match[0].length) {
        match = next;
      }
      re$2[t$2.COERCERTL].lastIndex = next.index + next[1].length + next[2].length;
    }
    // leave it in a clean state
    re$2[t$2.COERCERTL].lastIndex = -1;
  }

  if (match === null)
    return null

  return parse_1(`${match[2]}.${match[3] || '0'}.${match[4] || '0'}`, options)
};
var coerce_1 = coerce;

var iterator = function (Yallist) {
  Yallist.prototype[Symbol.iterator] = function* () {
    for (let walker = this.head; walker; walker = walker.next) {
      yield walker.value;
    }
  };
};

var yallist = Yallist;

Yallist.Node = Node;
Yallist.create = Yallist;

function Yallist (list) {
  var self = this;
  if (!(self instanceof Yallist)) {
    self = new Yallist();
  }

  self.tail = null;
  self.head = null;
  self.length = 0;

  if (list && typeof list.forEach === 'function') {
    list.forEach(function (item) {
      self.push(item);
    });
  } else if (arguments.length > 0) {
    for (var i = 0, l = arguments.length; i < l; i++) {
      self.push(arguments[i]);
    }
  }

  return self
}

Yallist.prototype.removeNode = function (node) {
  if (node.list !== this) {
    throw new Error('removing node which does not belong to this list')
  }

  var next = node.next;
  var prev = node.prev;

  if (next) {
    next.prev = prev;
  }

  if (prev) {
    prev.next = next;
  }

  if (node === this.head) {
    this.head = next;
  }
  if (node === this.tail) {
    this.tail = prev;
  }

  node.list.length--;
  node.next = null;
  node.prev = null;
  node.list = null;

  return next
};

Yallist.prototype.unshiftNode = function (node) {
  if (node === this.head) {
    return
  }

  if (node.list) {
    node.list.removeNode(node);
  }

  var head = this.head;
  node.list = this;
  node.next = head;
  if (head) {
    head.prev = node;
  }

  this.head = node;
  if (!this.tail) {
    this.tail = node;
  }
  this.length++;
};

Yallist.prototype.pushNode = function (node) {
  if (node === this.tail) {
    return
  }

  if (node.list) {
    node.list.removeNode(node);
  }

  var tail = this.tail;
  node.list = this;
  node.prev = tail;
  if (tail) {
    tail.next = node;
  }

  this.tail = node;
  if (!this.head) {
    this.head = node;
  }
  this.length++;
};

Yallist.prototype.push = function () {
  for (var i = 0, l = arguments.length; i < l; i++) {
    push(this, arguments[i]);
  }
  return this.length
};

Yallist.prototype.unshift = function () {
  for (var i = 0, l = arguments.length; i < l; i++) {
    unshift(this, arguments[i]);
  }
  return this.length
};

Yallist.prototype.pop = function () {
  if (!this.tail) {
    return undefined
  }

  var res = this.tail.value;
  this.tail = this.tail.prev;
  if (this.tail) {
    this.tail.next = null;
  } else {
    this.head = null;
  }
  this.length--;
  return res
};

Yallist.prototype.shift = function () {
  if (!this.head) {
    return undefined
  }

  var res = this.head.value;
  this.head = this.head.next;
  if (this.head) {
    this.head.prev = null;
  } else {
    this.tail = null;
  }
  this.length--;
  return res
};

Yallist.prototype.forEach = function (fn, thisp) {
  thisp = thisp || this;
  for (var walker = this.head, i = 0; walker !== null; i++) {
    fn.call(thisp, walker.value, i, this);
    walker = walker.next;
  }
};

Yallist.prototype.forEachReverse = function (fn, thisp) {
  thisp = thisp || this;
  for (var walker = this.tail, i = this.length - 1; walker !== null; i--) {
    fn.call(thisp, walker.value, i, this);
    walker = walker.prev;
  }
};

Yallist.prototype.get = function (n) {
  for (var i = 0, walker = this.head; walker !== null && i < n; i++) {
    // abort out of the list early if we hit a cycle
    walker = walker.next;
  }
  if (i === n && walker !== null) {
    return walker.value
  }
};

Yallist.prototype.getReverse = function (n) {
  for (var i = 0, walker = this.tail; walker !== null && i < n; i++) {
    // abort out of the list early if we hit a cycle
    walker = walker.prev;
  }
  if (i === n && walker !== null) {
    return walker.value
  }
};

Yallist.prototype.map = function (fn, thisp) {
  thisp = thisp || this;
  var res = new Yallist();
  for (var walker = this.head; walker !== null;) {
    res.push(fn.call(thisp, walker.value, this));
    walker = walker.next;
  }
  return res
};

Yallist.prototype.mapReverse = function (fn, thisp) {
  thisp = thisp || this;
  var res = new Yallist();
  for (var walker = this.tail; walker !== null;) {
    res.push(fn.call(thisp, walker.value, this));
    walker = walker.prev;
  }
  return res
};

Yallist.prototype.reduce = function (fn, initial) {
  var acc;
  var walker = this.head;
  if (arguments.length > 1) {
    acc = initial;
  } else if (this.head) {
    walker = this.head.next;
    acc = this.head.value;
  } else {
    throw new TypeError('Reduce of empty list with no initial value')
  }

  for (var i = 0; walker !== null; i++) {
    acc = fn(acc, walker.value, i);
    walker = walker.next;
  }

  return acc
};

Yallist.prototype.reduceReverse = function (fn, initial) {
  var acc;
  var walker = this.tail;
  if (arguments.length > 1) {
    acc = initial;
  } else if (this.tail) {
    walker = this.tail.prev;
    acc = this.tail.value;
  } else {
    throw new TypeError('Reduce of empty list with no initial value')
  }

  for (var i = this.length - 1; walker !== null; i--) {
    acc = fn(acc, walker.value, i);
    walker = walker.prev;
  }

  return acc
};

Yallist.prototype.toArray = function () {
  var arr = new Array(this.length);
  for (var i = 0, walker = this.head; walker !== null; i++) {
    arr[i] = walker.value;
    walker = walker.next;
  }
  return arr
};

Yallist.prototype.toArrayReverse = function () {
  var arr = new Array(this.length);
  for (var i = 0, walker = this.tail; walker !== null; i++) {
    arr[i] = walker.value;
    walker = walker.prev;
  }
  return arr
};

Yallist.prototype.slice = function (from, to) {
  to = to || this.length;
  if (to < 0) {
    to += this.length;
  }
  from = from || 0;
  if (from < 0) {
    from += this.length;
  }
  var ret = new Yallist();
  if (to < from || to < 0) {
    return ret
  }
  if (from < 0) {
    from = 0;
  }
  if (to > this.length) {
    to = this.length;
  }
  for (var i = 0, walker = this.head; walker !== null && i < from; i++) {
    walker = walker.next;
  }
  for (; walker !== null && i < to; i++, walker = walker.next) {
    ret.push(walker.value);
  }
  return ret
};

Yallist.prototype.sliceReverse = function (from, to) {
  to = to || this.length;
  if (to < 0) {
    to += this.length;
  }
  from = from || 0;
  if (from < 0) {
    from += this.length;
  }
  var ret = new Yallist();
  if (to < from || to < 0) {
    return ret
  }
  if (from < 0) {
    from = 0;
  }
  if (to > this.length) {
    to = this.length;
  }
  for (var i = this.length, walker = this.tail; walker !== null && i > to; i--) {
    walker = walker.prev;
  }
  for (; walker !== null && i > from; i--, walker = walker.prev) {
    ret.push(walker.value);
  }
  return ret
};

Yallist.prototype.splice = function (start, deleteCount, ...nodes) {
  if (start > this.length) {
    start = this.length - 1;
  }
  if (start < 0) {
    start = this.length + start;
  }

  for (var i = 0, walker = this.head; walker !== null && i < start; i++) {
    walker = walker.next;
  }

  var ret = [];
  for (var i = 0; walker && i < deleteCount; i++) {
    ret.push(walker.value);
    walker = this.removeNode(walker);
  }
  if (walker === null) {
    walker = this.tail;
  }

  if (walker !== this.head && walker !== this.tail) {
    walker = walker.prev;
  }

  for (var i = 0; i < nodes.length; i++) {
    walker = insert(this, walker, nodes[i]);
  }
  return ret;
};

Yallist.prototype.reverse = function () {
  var head = this.head;
  var tail = this.tail;
  for (var walker = head; walker !== null; walker = walker.prev) {
    var p = walker.prev;
    walker.prev = walker.next;
    walker.next = p;
  }
  this.head = tail;
  this.tail = head;
  return this
};

function insert (self, node, value) {
  var inserted = node === self.head ?
    new Node(value, null, node, self) :
    new Node(value, node, node.next, self);

  if (inserted.next === null) {
    self.tail = inserted;
  }
  if (inserted.prev === null) {
    self.head = inserted;
  }

  self.length++;

  return inserted
}

function push (self, item) {
  self.tail = new Node(item, self.tail, null, self);
  if (!self.head) {
    self.head = self.tail;
  }
  self.length++;
}

function unshift (self, item) {
  self.head = new Node(item, null, self.head, self);
  if (!self.tail) {
    self.tail = self.head;
  }
  self.length++;
}

function Node (value, prev, next, list) {
  if (!(this instanceof Node)) {
    return new Node(value, prev, next, list)
  }

  this.list = list;
  this.value = value;

  if (prev) {
    prev.next = this;
    this.prev = prev;
  } else {
    this.prev = null;
  }

  if (next) {
    next.prev = this;
    this.next = next;
  } else {
    this.next = null;
  }
}

try {
  // add if support for Symbol.iterator is present
  iterator(Yallist);
} catch (er) {}

// A linked list to keep track of recently-used-ness


const MAX = Symbol('max');
const LENGTH = Symbol('length');
const LENGTH_CALCULATOR = Symbol('lengthCalculator');
const ALLOW_STALE = Symbol('allowStale');
const MAX_AGE = Symbol('maxAge');
const DISPOSE = Symbol('dispose');
const NO_DISPOSE_ON_SET = Symbol('noDisposeOnSet');
const LRU_LIST = Symbol('lruList');
const CACHE = Symbol('cache');
const UPDATE_AGE_ON_GET = Symbol('updateAgeOnGet');

const naiveLength = () => 1;

// lruList is a yallist where the head is the youngest
// item, and the tail is the oldest.  the list contains the Hit
// objects as the entries.
// Each Hit object has a reference to its Yallist.Node.  This
// never changes.
//
// cache is a Map (or PseudoMap) that matches the keys to
// the Yallist.Node object.
class LRUCache {
  constructor (options) {
    if (typeof options === 'number')
      options = { max: options };

    if (!options)
      options = {};

    if (options.max && (typeof options.max !== 'number' || options.max < 0))
      throw new TypeError('max must be a non-negative number')
    // Kind of weird to have a default max of Infinity, but oh well.
    const max = this[MAX] = options.max || Infinity;

    const lc = options.length || naiveLength;
    this[LENGTH_CALCULATOR] = (typeof lc !== 'function') ? naiveLength : lc;
    this[ALLOW_STALE] = options.stale || false;
    if (options.maxAge && typeof options.maxAge !== 'number')
      throw new TypeError('maxAge must be a number')
    this[MAX_AGE] = options.maxAge || 0;
    this[DISPOSE] = options.dispose;
    this[NO_DISPOSE_ON_SET] = options.noDisposeOnSet || false;
    this[UPDATE_AGE_ON_GET] = options.updateAgeOnGet || false;
    this.reset();
  }

  // resize the cache when the max changes.
  set max (mL) {
    if (typeof mL !== 'number' || mL < 0)
      throw new TypeError('max must be a non-negative number')

    this[MAX] = mL || Infinity;
    trim(this);
  }
  get max () {
    return this[MAX]
  }

  set allowStale (allowStale) {
    this[ALLOW_STALE] = !!allowStale;
  }
  get allowStale () {
    return this[ALLOW_STALE]
  }

  set maxAge (mA) {
    if (typeof mA !== 'number')
      throw new TypeError('maxAge must be a non-negative number')

    this[MAX_AGE] = mA;
    trim(this);
  }
  get maxAge () {
    return this[MAX_AGE]
  }

  // resize the cache when the lengthCalculator changes.
  set lengthCalculator (lC) {
    if (typeof lC !== 'function')
      lC = naiveLength;

    if (lC !== this[LENGTH_CALCULATOR]) {
      this[LENGTH_CALCULATOR] = lC;
      this[LENGTH] = 0;
      this[LRU_LIST].forEach(hit => {
        hit.length = this[LENGTH_CALCULATOR](hit.value, hit.key);
        this[LENGTH] += hit.length;
      });
    }
    trim(this);
  }
  get lengthCalculator () { return this[LENGTH_CALCULATOR] }

  get length () { return this[LENGTH] }
  get itemCount () { return this[LRU_LIST].length }

  rforEach (fn, thisp) {
    thisp = thisp || this;
    for (let walker = this[LRU_LIST].tail; walker !== null;) {
      const prev = walker.prev;
      forEachStep(this, fn, walker, thisp);
      walker = prev;
    }
  }

  forEach (fn, thisp) {
    thisp = thisp || this;
    for (let walker = this[LRU_LIST].head; walker !== null;) {
      const next = walker.next;
      forEachStep(this, fn, walker, thisp);
      walker = next;
    }
  }

  keys () {
    return this[LRU_LIST].toArray().map(k => k.key)
  }

  values () {
    return this[LRU_LIST].toArray().map(k => k.value)
  }

  reset () {
    if (this[DISPOSE] &&
        this[LRU_LIST] &&
        this[LRU_LIST].length) {
      this[LRU_LIST].forEach(hit => this[DISPOSE](hit.key, hit.value));
    }

    this[CACHE] = new Map(); // hash of items by key
    this[LRU_LIST] = new yallist(); // list of items in order of use recency
    this[LENGTH] = 0; // length of items in the list
  }

  dump () {
    return this[LRU_LIST].map(hit =>
      isStale(this, hit) ? false : {
        k: hit.key,
        v: hit.value,
        e: hit.now + (hit.maxAge || 0)
      }).toArray().filter(h => h)
  }

  dumpLru () {
    return this[LRU_LIST]
  }

  set (key, value, maxAge) {
    maxAge = maxAge || this[MAX_AGE];

    if (maxAge && typeof maxAge !== 'number')
      throw new TypeError('maxAge must be a number')

    const now = maxAge ? Date.now() : 0;
    const len = this[LENGTH_CALCULATOR](value, key);

    if (this[CACHE].has(key)) {
      if (len > this[MAX]) {
        del(this, this[CACHE].get(key));
        return false
      }

      const node = this[CACHE].get(key);
      const item = node.value;

      // dispose of the old one before overwriting
      // split out into 2 ifs for better coverage tracking
      if (this[DISPOSE]) {
        if (!this[NO_DISPOSE_ON_SET])
          this[DISPOSE](key, item.value);
      }

      item.now = now;
      item.maxAge = maxAge;
      item.value = value;
      this[LENGTH] += len - item.length;
      item.length = len;
      this.get(key);
      trim(this);
      return true
    }

    const hit = new Entry(key, value, len, now, maxAge);

    // oversized objects fall out of cache automatically.
    if (hit.length > this[MAX]) {
      if (this[DISPOSE])
        this[DISPOSE](key, value);

      return false
    }

    this[LENGTH] += hit.length;
    this[LRU_LIST].unshift(hit);
    this[CACHE].set(key, this[LRU_LIST].head);
    trim(this);
    return true
  }

  has (key) {
    if (!this[CACHE].has(key)) return false
    const hit = this[CACHE].get(key).value;
    return !isStale(this, hit)
  }

  get (key) {
    return get(this, key, true)
  }

  peek (key) {
    return get(this, key, false)
  }

  pop () {
    const node = this[LRU_LIST].tail;
    if (!node)
      return null

    del(this, node);
    return node.value
  }

  del (key) {
    del(this, this[CACHE].get(key));
  }

  load (arr) {
    // reset the cache
    this.reset();

    const now = Date.now();
    // A previous serialized cache has the most recent items first
    for (let l = arr.length - 1; l >= 0; l--) {
      const hit = arr[l];
      const expiresAt = hit.e || 0;
      if (expiresAt === 0)
        // the item was created without expiration in a non aged cache
        this.set(hit.k, hit.v);
      else {
        const maxAge = expiresAt - now;
        // dont add already expired items
        if (maxAge > 0) {
          this.set(hit.k, hit.v, maxAge);
        }
      }
    }
  }

  prune () {
    this[CACHE].forEach((value, key) => get(this, key, false));
  }
}

const get = (self, key, doUse) => {
  const node = self[CACHE].get(key);
  if (node) {
    const hit = node.value;
    if (isStale(self, hit)) {
      del(self, node);
      if (!self[ALLOW_STALE])
        return undefined
    } else {
      if (doUse) {
        if (self[UPDATE_AGE_ON_GET])
          node.value.now = Date.now();
        self[LRU_LIST].unshiftNode(node);
      }
    }
    return hit.value
  }
};

const isStale = (self, hit) => {
  if (!hit || (!hit.maxAge && !self[MAX_AGE]))
    return false

  const diff = Date.now() - hit.now;
  return hit.maxAge ? diff > hit.maxAge
    : self[MAX_AGE] && (diff > self[MAX_AGE])
};

const trim = self => {
  if (self[LENGTH] > self[MAX]) {
    for (let walker = self[LRU_LIST].tail;
      self[LENGTH] > self[MAX] && walker !== null;) {
      // We know that we're about to delete this one, and also
      // what the next least recently used key will be, so just
      // go ahead and set it now.
      const prev = walker.prev;
      del(self, walker);
      walker = prev;
    }
  }
};

const del = (self, node) => {
  if (node) {
    const hit = node.value;
    if (self[DISPOSE])
      self[DISPOSE](hit.key, hit.value);

    self[LENGTH] -= hit.length;
    self[CACHE].delete(hit.key);
    self[LRU_LIST].removeNode(node);
  }
};

class Entry {
  constructor (key, value, length, now, maxAge) {
    this.key = key;
    this.value = value;
    this.length = length;
    this.now = now;
    this.maxAge = maxAge || 0;
  }
}

const forEachStep = (self, fn, node, thisp) => {
  let hit = node.value;
  if (isStale(self, hit)) {
    del(self, node);
    if (!self[ALLOW_STALE])
      hit = undefined;
  }
  if (hit)
    fn.call(thisp, hit.value, hit.key, self);
};

var lruCache = LRUCache;

// hoisted class for cyclic dependency
class Range {
  constructor (range, options) {
    options = parseOptions_1(options);

    if (range instanceof Range) {
      if (
        range.loose === !!options.loose &&
        range.includePrerelease === !!options.includePrerelease
      ) {
        return range
      } else {
        return new Range(range.raw, options)
      }
    }

    if (range instanceof comparator) {
      // just put it in the set and return
      this.raw = range.value;
      this.set = [[range]];
      this.format();
      return this
    }

    this.options = options;
    this.loose = !!options.loose;
    this.includePrerelease = !!options.includePrerelease;

    // First, split based on boolean or ||
    this.raw = range;
    this.set = range
      .split(/\s*\|\|\s*/)
      // map the range to a 2d array of comparators
      .map(range => this.parseRange(range.trim()))
      // throw out any comparator lists that are empty
      // this generally means that it was not a valid range, which is allowed
      // in loose mode, but will still throw if the WHOLE range is invalid.
      .filter(c => c.length);

    if (!this.set.length) {
      throw new TypeError(`Invalid SemVer Range: ${range}`)
    }

    // if we have any that are not the null set, throw out null sets.
    if (this.set.length > 1) {
      // keep the first one, in case they're all null sets
      const first = this.set[0];
      this.set = this.set.filter(c => !isNullSet(c[0]));
      if (this.set.length === 0)
        this.set = [first];
      else if (this.set.length > 1) {
        // if we have any that are *, then the range is just *
        for (const c of this.set) {
          if (c.length === 1 && isAny(c[0])) {
            this.set = [c];
            break
          }
        }
      }
    }

    this.format();
  }

  format () {
    this.range = this.set
      .map((comps) => {
        return comps.join(' ').trim()
      })
      .join('||')
      .trim();
    return this.range
  }

  toString () {
    return this.range
  }

  parseRange (range) {
    range = range.trim();

    // memoize range parsing for performance.
    // this is a very hot path, and fully deterministic.
    const memoOpts = Object.keys(this.options).join(',');
    const memoKey = `parseRange:${memoOpts}:${range}`;
    const cached = cache.get(memoKey);
    if (cached)
      return cached

    const loose = this.options.loose;
    // `1.2.3 - 1.2.4` => `>=1.2.3 <=1.2.4`
    const hr = loose ? re$3[t$3.HYPHENRANGELOOSE] : re$3[t$3.HYPHENRANGE];
    range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
    debug_1('hyphen replace', range);
    // `> 1.2.3 < 1.2.5` => `>1.2.3 <1.2.5`
    range = range.replace(re$3[t$3.COMPARATORTRIM], comparatorTrimReplace);
    debug_1('comparator trim', range, re$3[t$3.COMPARATORTRIM]);

    // `~ 1.2.3` => `~1.2.3`
    range = range.replace(re$3[t$3.TILDETRIM], tildeTrimReplace);

    // `^ 1.2.3` => `^1.2.3`
    range = range.replace(re$3[t$3.CARETTRIM], caretTrimReplace);

    // normalize spaces
    range = range.split(/\s+/).join(' ');

    // At this point, the range is completely trimmed and
    // ready to be split into comparators.

    const compRe = loose ? re$3[t$3.COMPARATORLOOSE] : re$3[t$3.COMPARATOR];
    const rangeList = range
      .split(' ')
      .map(comp => parseComparator(comp, this.options))
      .join(' ')
      .split(/\s+/)
      // >=0.0.0 is equivalent to *
      .map(comp => replaceGTE0(comp, this.options))
      // in loose mode, throw out any that are not valid comparators
      .filter(this.options.loose ? comp => !!comp.match(compRe) : () => true)
      .map(comp => new comparator(comp, this.options));

    // if any comparators are the null set, then replace with JUST null set
    // if more than one comparator, remove any * comparators
    // also, don't include the same comparator more than once
    const l = rangeList.length;
    const rangeMap = new Map();
    for (const comp of rangeList) {
      if (isNullSet(comp))
        return [comp]
      rangeMap.set(comp.value, comp);
    }
    if (rangeMap.size > 1 && rangeMap.has(''))
      rangeMap.delete('');

    const result = [...rangeMap.values()];
    cache.set(memoKey, result);
    return result
  }

  intersects (range, options) {
    if (!(range instanceof Range)) {
      throw new TypeError('a Range is required')
    }

    return this.set.some((thisComparators) => {
      return (
        isSatisfiable(thisComparators, options) &&
        range.set.some((rangeComparators) => {
          return (
            isSatisfiable(rangeComparators, options) &&
            thisComparators.every((thisComparator) => {
              return rangeComparators.every((rangeComparator) => {
                return thisComparator.intersects(rangeComparator, options)
              })
            })
          )
        })
      )
    })
  }

  // if ANY of the sets match ALL of its comparators, then pass
  test (version) {
    if (!version) {
      return false
    }

    if (typeof version === 'string') {
      try {
        version = new semver(version, this.options);
      } catch (er) {
        return false
      }
    }

    for (let i = 0; i < this.set.length; i++) {
      if (testSet(this.set[i], version, this.options)) {
        return true
      }
    }
    return false
  }
}
var range = Range;


const cache = new lruCache({ max: 1000 });





const {
  re: re$3,
  t: t$3,
  comparatorTrimReplace,
  tildeTrimReplace,
  caretTrimReplace
} = re_1;

const isNullSet = c => c.value === '<0.0.0-0';
const isAny = c => c.value === '';

// take a set of comparators and determine whether there
// exists a version which can satisfy it
const isSatisfiable = (comparators, options) => {
  let result = true;
  const remainingComparators = comparators.slice();
  let testComparator = remainingComparators.pop();

  while (result && remainingComparators.length) {
    result = remainingComparators.every((otherComparator) => {
      return testComparator.intersects(otherComparator, options)
    });

    testComparator = remainingComparators.pop();
  }

  return result
};

// comprised of xranges, tildes, stars, and gtlt's at this point.
// already replaced the hyphen ranges
// turn into a set of JUST comparators.
const parseComparator = (comp, options) => {
  debug_1('comp', comp, options);
  comp = replaceCarets(comp, options);
  debug_1('caret', comp);
  comp = replaceTildes(comp, options);
  debug_1('tildes', comp);
  comp = replaceXRanges(comp, options);
  debug_1('xrange', comp);
  comp = replaceStars(comp, options);
  debug_1('stars', comp);
  return comp
};

const isX = id => !id || id.toLowerCase() === 'x' || id === '*';

// ~, ~> --> * (any, kinda silly)
// ~2, ~2.x, ~2.x.x, ~>2, ~>2.x ~>2.x.x --> >=2.0.0 <3.0.0-0
// ~2.0, ~2.0.x, ~>2.0, ~>2.0.x --> >=2.0.0 <2.1.0-0
// ~1.2, ~1.2.x, ~>1.2, ~>1.2.x --> >=1.2.0 <1.3.0-0
// ~1.2.3, ~>1.2.3 --> >=1.2.3 <1.3.0-0
// ~1.2.0, ~>1.2.0 --> >=1.2.0 <1.3.0-0
const replaceTildes = (comp, options) =>
  comp.trim().split(/\s+/).map((comp) => {
    return replaceTilde(comp, options)
  }).join(' ');

const replaceTilde = (comp, options) => {
  const r = options.loose ? re$3[t$3.TILDELOOSE] : re$3[t$3.TILDE];
  return comp.replace(r, (_, M, m, p, pr) => {
    debug_1('tilde', comp, _, M, m, p, pr);
    let ret;

    if (isX(M)) {
      ret = '';
    } else if (isX(m)) {
      ret = `>=${M}.0.0 <${+M + 1}.0.0-0`;
    } else if (isX(p)) {
      // ~1.2 == >=1.2.0 <1.3.0-0
      ret = `>=${M}.${m}.0 <${M}.${+m + 1}.0-0`;
    } else if (pr) {
      debug_1('replaceTilde pr', pr);
      ret = `>=${M}.${m}.${p}-${pr
      } <${M}.${+m + 1}.0-0`;
    } else {
      // ~1.2.3 == >=1.2.3 <1.3.0-0
      ret = `>=${M}.${m}.${p
      } <${M}.${+m + 1}.0-0`;
    }

    debug_1('tilde return', ret);
    return ret
  })
};

// ^ --> * (any, kinda silly)
// ^2, ^2.x, ^2.x.x --> >=2.0.0 <3.0.0-0
// ^2.0, ^2.0.x --> >=2.0.0 <3.0.0-0
// ^1.2, ^1.2.x --> >=1.2.0 <2.0.0-0
// ^1.2.3 --> >=1.2.3 <2.0.0-0
// ^1.2.0 --> >=1.2.0 <2.0.0-0
const replaceCarets = (comp, options) =>
  comp.trim().split(/\s+/).map((comp) => {
    return replaceCaret(comp, options)
  }).join(' ');

const replaceCaret = (comp, options) => {
  debug_1('caret', comp, options);
  const r = options.loose ? re$3[t$3.CARETLOOSE] : re$3[t$3.CARET];
  const z = options.includePrerelease ? '-0' : '';
  return comp.replace(r, (_, M, m, p, pr) => {
    debug_1('caret', comp, _, M, m, p, pr);
    let ret;

    if (isX(M)) {
      ret = '';
    } else if (isX(m)) {
      ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
    } else if (isX(p)) {
      if (M === '0') {
        ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
      } else {
        ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
      }
    } else if (pr) {
      debug_1('replaceCaret pr', pr);
      if (M === '0') {
        if (m === '0') {
          ret = `>=${M}.${m}.${p}-${pr
          } <${M}.${m}.${+p + 1}-0`;
        } else {
          ret = `>=${M}.${m}.${p}-${pr
          } <${M}.${+m + 1}.0-0`;
        }
      } else {
        ret = `>=${M}.${m}.${p}-${pr
        } <${+M + 1}.0.0-0`;
      }
    } else {
      debug_1('no pr');
      if (M === '0') {
        if (m === '0') {
          ret = `>=${M}.${m}.${p
          }${z} <${M}.${m}.${+p + 1}-0`;
        } else {
          ret = `>=${M}.${m}.${p
          }${z} <${M}.${+m + 1}.0-0`;
        }
      } else {
        ret = `>=${M}.${m}.${p
        } <${+M + 1}.0.0-0`;
      }
    }

    debug_1('caret return', ret);
    return ret
  })
};

const replaceXRanges = (comp, options) => {
  debug_1('replaceXRanges', comp, options);
  return comp.split(/\s+/).map((comp) => {
    return replaceXRange(comp, options)
  }).join(' ')
};

const replaceXRange = (comp, options) => {
  comp = comp.trim();
  const r = options.loose ? re$3[t$3.XRANGELOOSE] : re$3[t$3.XRANGE];
  return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
    debug_1('xRange', comp, ret, gtlt, M, m, p, pr);
    const xM = isX(M);
    const xm = xM || isX(m);
    const xp = xm || isX(p);
    const anyX = xp;

    if (gtlt === '=' && anyX) {
      gtlt = '';
    }

    // if we're including prereleases in the match, then we need
    // to fix this to -0, the lowest possible prerelease value
    pr = options.includePrerelease ? '-0' : '';

    if (xM) {
      if (gtlt === '>' || gtlt === '<') {
        // nothing is allowed
        ret = '<0.0.0-0';
      } else {
        // nothing is forbidden
        ret = '*';
      }
    } else if (gtlt && anyX) {
      // we know patch is an x, because we have any x at all.
      // replace X with 0
      if (xm) {
        m = 0;
      }
      p = 0;

      if (gtlt === '>') {
        // >1 => >=2.0.0
        // >1.2 => >=1.3.0
        gtlt = '>=';
        if (xm) {
          M = +M + 1;
          m = 0;
          p = 0;
        } else {
          m = +m + 1;
          p = 0;
        }
      } else if (gtlt === '<=') {
        // <=0.7.x is actually <0.8.0, since any 0.7.x should
        // pass.  Similarly, <=7.x is actually <8.0.0, etc.
        gtlt = '<';
        if (xm) {
          M = +M + 1;
        } else {
          m = +m + 1;
        }
      }

      if (gtlt === '<')
        pr = '-0';

      ret = `${gtlt + M}.${m}.${p}${pr}`;
    } else if (xm) {
      ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
    } else if (xp) {
      ret = `>=${M}.${m}.0${pr
      } <${M}.${+m + 1}.0-0`;
    }

    debug_1('xRange return', ret);

    return ret
  })
};

// Because * is AND-ed with everything else in the comparator,
// and '' means "any version", just remove the *s entirely.
const replaceStars = (comp, options) => {
  debug_1('replaceStars', comp, options);
  // Looseness is ignored here.  star is always as loose as it gets!
  return comp.trim().replace(re$3[t$3.STAR], '')
};

const replaceGTE0 = (comp, options) => {
  debug_1('replaceGTE0', comp, options);
  return comp.trim()
    .replace(re$3[options.includePrerelease ? t$3.GTE0PRE : t$3.GTE0], '')
};

// This function is passed to string.replace(re[t.HYPHENRANGE])
// M, m, patch, prerelease, build
// 1.2 - 3.4.5 => >=1.2.0 <=3.4.5
// 1.2.3 - 3.4 => >=1.2.0 <3.5.0-0 Any 3.4.x will do
// 1.2 - 3.4 => >=1.2.0 <3.5.0-0
const hyphenReplace = incPr => ($0,
  from, fM, fm, fp, fpr, fb,
  to, tM, tm, tp, tpr, tb) => {
  if (isX(fM)) {
    from = '';
  } else if (isX(fm)) {
    from = `>=${fM}.0.0${incPr ? '-0' : ''}`;
  } else if (isX(fp)) {
    from = `>=${fM}.${fm}.0${incPr ? '-0' : ''}`;
  } else if (fpr) {
    from = `>=${from}`;
  } else {
    from = `>=${from}${incPr ? '-0' : ''}`;
  }

  if (isX(tM)) {
    to = '';
  } else if (isX(tm)) {
    to = `<${+tM + 1}.0.0-0`;
  } else if (isX(tp)) {
    to = `<${tM}.${+tm + 1}.0-0`;
  } else if (tpr) {
    to = `<=${tM}.${tm}.${tp}-${tpr}`;
  } else if (incPr) {
    to = `<${tM}.${tm}.${+tp + 1}-0`;
  } else {
    to = `<=${to}`;
  }

  return (`${from} ${to}`).trim()
};

const testSet = (set, version, options) => {
  for (let i = 0; i < set.length; i++) {
    if (!set[i].test(version)) {
      return false
    }
  }

  if (version.prerelease.length && !options.includePrerelease) {
    // Find the set of versions that are allowed to have prereleases
    // For example, ^1.2.3-pr.1 desugars to >=1.2.3-pr.1 <2.0.0
    // That should allow `1.2.3-pr.2` to pass.
    // However, `1.2.4-alpha.notready` should NOT be allowed,
    // even though it's within the range set by the comparators.
    for (let i = 0; i < set.length; i++) {
      debug_1(set[i].semver);
      if (set[i].semver === comparator.ANY) {
        continue
      }

      if (set[i].semver.prerelease.length > 0) {
        const allowed = set[i].semver;
        if (allowed.major === version.major &&
            allowed.minor === version.minor &&
            allowed.patch === version.patch) {
          return true
        }
      }
    }

    // Version has a -pre, but it's not one of the ones we like.
    return false
  }

  return true
};

const ANY = Symbol('SemVer ANY');
// hoisted class for cyclic dependency
class Comparator {
  static get ANY () {
    return ANY
  }
  constructor (comp, options) {
    options = parseOptions_1(options);

    if (comp instanceof Comparator) {
      if (comp.loose === !!options.loose) {
        return comp
      } else {
        comp = comp.value;
      }
    }

    debug_1('comparator', comp, options);
    this.options = options;
    this.loose = !!options.loose;
    this.parse(comp);

    if (this.semver === ANY) {
      this.value = '';
    } else {
      this.value = this.operator + this.semver.version;
    }

    debug_1('comp', this);
  }

  parse (comp) {
    const r = this.options.loose ? re$4[t$4.COMPARATORLOOSE] : re$4[t$4.COMPARATOR];
    const m = comp.match(r);

    if (!m) {
      throw new TypeError(`Invalid comparator: ${comp}`)
    }

    this.operator = m[1] !== undefined ? m[1] : '';
    if (this.operator === '=') {
      this.operator = '';
    }

    // if it literally is just '>' or '' then allow anything.
    if (!m[2]) {
      this.semver = ANY;
    } else {
      this.semver = new semver(m[2], this.options.loose);
    }
  }

  toString () {
    return this.value
  }

  test (version) {
    debug_1('Comparator.test', version, this.options.loose);

    if (this.semver === ANY || version === ANY) {
      return true
    }

    if (typeof version === 'string') {
      try {
        version = new semver(version, this.options);
      } catch (er) {
        return false
      }
    }

    return cmp_1(version, this.operator, this.semver, this.options)
  }

  intersects (comp, options) {
    if (!(comp instanceof Comparator)) {
      throw new TypeError('a Comparator is required')
    }

    if (!options || typeof options !== 'object') {
      options = {
        loose: !!options,
        includePrerelease: false
      };
    }

    if (this.operator === '') {
      if (this.value === '') {
        return true
      }
      return new range(comp.value, options).test(this.value)
    } else if (comp.operator === '') {
      if (comp.value === '') {
        return true
      }
      return new range(this.value, options).test(comp.semver)
    }

    const sameDirectionIncreasing =
      (this.operator === '>=' || this.operator === '>') &&
      (comp.operator === '>=' || comp.operator === '>');
    const sameDirectionDecreasing =
      (this.operator === '<=' || this.operator === '<') &&
      (comp.operator === '<=' || comp.operator === '<');
    const sameSemVer = this.semver.version === comp.semver.version;
    const differentDirectionsInclusive =
      (this.operator === '>=' || this.operator === '<=') &&
      (comp.operator === '>=' || comp.operator === '<=');
    const oppositeDirectionsLessThan =
      cmp_1(this.semver, '<', comp.semver, options) &&
      (this.operator === '>=' || this.operator === '>') &&
        (comp.operator === '<=' || comp.operator === '<');
    const oppositeDirectionsGreaterThan =
      cmp_1(this.semver, '>', comp.semver, options) &&
      (this.operator === '<=' || this.operator === '<') &&
        (comp.operator === '>=' || comp.operator === '>');

    return (
      sameDirectionIncreasing ||
      sameDirectionDecreasing ||
      (sameSemVer && differentDirectionsInclusive) ||
      oppositeDirectionsLessThan ||
      oppositeDirectionsGreaterThan
    )
  }
}

var comparator = Comparator;


const {re: re$4, t: t$4} = re_1;

const satisfies = (version, range$1, options) => {
  try {
    range$1 = new range(range$1, options);
  } catch (er) {
    return false
  }
  return range$1.test(version)
};
var satisfies_1 = satisfies;

// Mostly just for testing and legacy API reasons
const toComparators = (range$1, options) =>
  new range(range$1, options).set
    .map(comp => comp.map(c => c.value).join(' ').trim().split(' '));

var toComparators_1 = toComparators;

const maxSatisfying = (versions, range$1, options) => {
  let max = null;
  let maxSV = null;
  let rangeObj = null;
  try {
    rangeObj = new range(range$1, options);
  } catch (er) {
    return null
  }
  versions.forEach((v) => {
    if (rangeObj.test(v)) {
      // satisfies(v, range, options)
      if (!max || maxSV.compare(v) === -1) {
        // compare(max, v, true)
        max = v;
        maxSV = new semver(max, options);
      }
    }
  });
  return max
};
var maxSatisfying_1 = maxSatisfying;

const minSatisfying = (versions, range$1, options) => {
  let min = null;
  let minSV = null;
  let rangeObj = null;
  try {
    rangeObj = new range(range$1, options);
  } catch (er) {
    return null
  }
  versions.forEach((v) => {
    if (rangeObj.test(v)) {
      // satisfies(v, range, options)
      if (!min || minSV.compare(v) === 1) {
        // compare(min, v, true)
        min = v;
        minSV = new semver(min, options);
      }
    }
  });
  return min
};
var minSatisfying_1 = minSatisfying;

const minVersion = (range$1, loose) => {
  range$1 = new range(range$1, loose);

  let minver = new semver('0.0.0');
  if (range$1.test(minver)) {
    return minver
  }

  minver = new semver('0.0.0-0');
  if (range$1.test(minver)) {
    return minver
  }

  minver = null;
  for (let i = 0; i < range$1.set.length; ++i) {
    const comparators = range$1.set[i];

    let setMin = null;
    comparators.forEach((comparator) => {
      // Clone to avoid manipulating the comparator's semver object.
      const compver = new semver(comparator.semver.version);
      switch (comparator.operator) {
        case '>':
          if (compver.prerelease.length === 0) {
            compver.patch++;
          } else {
            compver.prerelease.push(0);
          }
          compver.raw = compver.format();
          /* fallthrough */
        case '':
        case '>=':
          if (!setMin || gt_1(compver, setMin)) {
            setMin = compver;
          }
          break
        case '<':
        case '<=':
          /* Ignore maximum versions */
          break
        /* istanbul ignore next */
        default:
          throw new Error(`Unexpected operation: ${comparator.operator}`)
      }
    });
    if (setMin && (!minver || gt_1(minver, setMin)))
      minver = setMin;
  }

  if (minver && range$1.test(minver)) {
    return minver
  }

  return null
};
var minVersion_1 = minVersion;

const validRange = (range$1, options) => {
  try {
    // Return '*' instead of '' so that truthiness works.
    // This will throw if it's invalid anyway
    return new range(range$1, options).range || '*'
  } catch (er) {
    return null
  }
};
var valid$1 = validRange;

const {ANY: ANY$1} = comparator;







const outside = (version, range$1, hilo, options) => {
  version = new semver(version, options);
  range$1 = new range(range$1, options);

  let gtfn, ltefn, ltfn, comp, ecomp;
  switch (hilo) {
    case '>':
      gtfn = gt_1;
      ltefn = lte_1;
      ltfn = lt_1;
      comp = '>';
      ecomp = '>=';
      break
    case '<':
      gtfn = lt_1;
      ltefn = gte_1;
      ltfn = gt_1;
      comp = '<';
      ecomp = '<=';
      break
    default:
      throw new TypeError('Must provide a hilo val of "<" or ">"')
  }

  // If it satisfies the range it is not outside
  if (satisfies_1(version, range$1, options)) {
    return false
  }

  // From now on, variable terms are as if we're in "gtr" mode.
  // but note that everything is flipped for the "ltr" function.

  for (let i = 0; i < range$1.set.length; ++i) {
    const comparators = range$1.set[i];

    let high = null;
    let low = null;

    comparators.forEach((comparator$1) => {
      if (comparator$1.semver === ANY$1) {
        comparator$1 = new comparator('>=0.0.0');
      }
      high = high || comparator$1;
      low = low || comparator$1;
      if (gtfn(comparator$1.semver, high.semver, options)) {
        high = comparator$1;
      } else if (ltfn(comparator$1.semver, low.semver, options)) {
        low = comparator$1;
      }
    });

    // If the edge version comparator has a operator then our version
    // isn't outside it
    if (high.operator === comp || high.operator === ecomp) {
      return false
    }

    // If the lowest version comparator has an operator and our version
    // is less than it then it isn't higher than the range
    if ((!low.operator || low.operator === comp) &&
        ltefn(version, low.semver)) {
      return false
    } else if (low.operator === ecomp && ltfn(version, low.semver)) {
      return false
    }
  }
  return true
};

var outside_1 = outside;

// Determine if version is greater than all the versions possible in the range.

const gtr = (version, range, options) => outside_1(version, range, '>', options);
var gtr_1 = gtr;

// Determine if version is less than all the versions possible in the range
const ltr = (version, range, options) => outside_1(version, range, '<', options);
var ltr_1 = ltr;

const intersects = (r1, r2, options) => {
  r1 = new range(r1, options);
  r2 = new range(r2, options);
  return r1.intersects(r2)
};
var intersects_1 = intersects;

// given a set of versions and a range, create a "simplified" range
// that includes the same versions that the original range does
// If the original range is shorter than the simplified one, return that.


var simplify = (versions, range, options) => {
  const set = [];
  let min = null;
  let prev = null;
  const v = versions.sort((a, b) => compare_1(a, b, options));
  for (const version of v) {
    const included = satisfies_1(version, range, options);
    if (included) {
      prev = version;
      if (!min)
        min = version;
    } else {
      if (prev) {
        set.push([min, prev]);
      }
      prev = null;
      min = null;
    }
  }
  if (min)
    set.push([min, null]);

  const ranges = [];
  for (const [min, max] of set) {
    if (min === max)
      ranges.push(min);
    else if (!max && min === v[0])
      ranges.push('*');
    else if (!max)
      ranges.push(`>=${min}`);
    else if (min === v[0])
      ranges.push(`<=${max}`);
    else
      ranges.push(`${min} - ${max}`);
  }
  const simplified = ranges.join(' || ');
  const original = typeof range.raw === 'string' ? range.raw : String(range);
  return simplified.length < original.length ? simplified : range
};

const { ANY: ANY$2 } = comparator;



// Complex range `r1 || r2 || ...` is a subset of `R1 || R2 || ...` iff:
// - Every simple range `r1, r2, ...` is a subset of some `R1, R2, ...`
//
// Simple range `c1 c2 ...` is a subset of simple range `C1 C2 ...` iff:
// - If c is only the ANY comparator
//   - If C is only the ANY comparator, return true
//   - Else return false
// - Let EQ be the set of = comparators in c
// - If EQ is more than one, return true (null set)
// - Let GT be the highest > or >= comparator in c
// - Let LT be the lowest < or <= comparator in c
// - If GT and LT, and GT.semver > LT.semver, return true (null set)
// - If EQ
//   - If GT, and EQ does not satisfy GT, return true (null set)
//   - If LT, and EQ does not satisfy LT, return true (null set)
//   - If EQ satisfies every C, return true
//   - Else return false
// - If GT
//   - If GT.semver is lower than any > or >= comp in C, return false
//   - If GT is >=, and GT.semver does not satisfy every C, return false
// - If LT
//   - If LT.semver is greater than any < or <= comp in C, return false
//   - If LT is <=, and LT.semver does not satisfy every C, return false
// - If any C is a = range, and GT or LT are set, return false
// - Else return true

const subset = (sub, dom, options) => {
  if (sub === dom)
    return true

  sub = new range(sub, options);
  dom = new range(dom, options);
  let sawNonNull = false;

  OUTER: for (const simpleSub of sub.set) {
    for (const simpleDom of dom.set) {
      const isSub = simpleSubset(simpleSub, simpleDom, options);
      sawNonNull = sawNonNull || isSub !== null;
      if (isSub)
        continue OUTER
    }
    // the null set is a subset of everything, but null simple ranges in
    // a complex range should be ignored.  so if we saw a non-null range,
    // then we know this isn't a subset, but if EVERY simple range was null,
    // then it is a subset.
    if (sawNonNull)
      return false
  }
  return true
};

const simpleSubset = (sub, dom, options) => {
  if (sub === dom)
    return true

  if (sub.length === 1 && sub[0].semver === ANY$2)
    return dom.length === 1 && dom[0].semver === ANY$2

  const eqSet = new Set();
  let gt, lt;
  for (const c of sub) {
    if (c.operator === '>' || c.operator === '>=')
      gt = higherGT(gt, c, options);
    else if (c.operator === '<' || c.operator === '<=')
      lt = lowerLT(lt, c, options);
    else
      eqSet.add(c.semver);
  }

  if (eqSet.size > 1)
    return null

  let gtltComp;
  if (gt && lt) {
    gtltComp = compare_1(gt.semver, lt.semver, options);
    if (gtltComp > 0)
      return null
    else if (gtltComp === 0 && (gt.operator !== '>=' || lt.operator !== '<='))
      return null
  }

  // will iterate one or zero times
  for (const eq of eqSet) {
    if (gt && !satisfies_1(eq, String(gt), options))
      return null

    if (lt && !satisfies_1(eq, String(lt), options))
      return null

    for (const c of dom) {
      if (!satisfies_1(eq, String(c), options))
        return false
    }

    return true
  }

  let higher, lower;
  let hasDomLT, hasDomGT;
  for (const c of dom) {
    hasDomGT = hasDomGT || c.operator === '>' || c.operator === '>=';
    hasDomLT = hasDomLT || c.operator === '<' || c.operator === '<=';
    if (gt) {
      if (c.operator === '>' || c.operator === '>=') {
        higher = higherGT(gt, c, options);
        if (higher === c && higher !== gt)
          return false
      } else if (gt.operator === '>=' && !satisfies_1(gt.semver, String(c), options))
        return false
    }
    if (lt) {
      if (c.operator === '<' || c.operator === '<=') {
        lower = lowerLT(lt, c, options);
        if (lower === c && lower !== lt)
          return false
      } else if (lt.operator === '<=' && !satisfies_1(lt.semver, String(c), options))
        return false
    }
    if (!c.operator && (lt || gt) && gtltComp !== 0)
      return false
  }

  // if there was a < or >, and nothing in the dom, then must be false
  // UNLESS it was limited by another range in the other direction.
  // Eg, >1.0.0 <1.0.1 is still a subset of <2.0.0
  if (gt && hasDomLT && !lt && gtltComp !== 0)
    return false

  if (lt && hasDomGT && !gt && gtltComp !== 0)
    return false

  return true
};

// >=1.2.3 is lower than >1.2.3
const higherGT = (a, b, options) => {
  if (!a)
    return b
  const comp = compare_1(a.semver, b.semver, options);
  return comp > 0 ? a
    : comp < 0 ? b
    : b.operator === '>' && a.operator === '>=' ? b
    : a
};

// <=1.2.3 is higher than <1.2.3
const lowerLT = (a, b, options) => {
  if (!a)
    return b
  const comp = compare_1(a.semver, b.semver, options);
  return comp < 0 ? a
    : comp > 0 ? b
    : b.operator === '<' && a.operator === '<=' ? b
    : a
};

var subset_1 = subset;

// just pre-load all the stuff that index.js lazily exports

var semver$1 = {
  re: re_1.re,
  src: re_1.src,
  tokens: re_1.t,
  SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
  SemVer: semver,
  compareIdentifiers: identifiers.compareIdentifiers,
  rcompareIdentifiers: identifiers.rcompareIdentifiers,
  parse: parse_1,
  valid: valid_1,
  clean: clean_1,
  inc: inc_1,
  diff: diff_1,
  major: major_1,
  minor: minor_1,
  patch: patch_1,
  prerelease: prerelease_1,
  compare: compare_1,
  rcompare: rcompare_1,
  compareLoose: compareLoose_1,
  compareBuild: compareBuild_1,
  sort: sort_1,
  rsort: rsort_1,
  gt: gt_1,
  lt: lt_1,
  eq: eq_1,
  neq: neq_1,
  gte: gte_1,
  lte: lte_1,
  cmp: cmp_1,
  coerce: coerce_1,
  Comparator: comparator,
  Range: range,
  satisfies: satisfies_1,
  toComparators: toComparators_1,
  maxSatisfying: maxSatisfying_1,
  minSatisfying: minSatisfying_1,
  minVersion: minVersion_1,
  validRange: valid$1,
  outside: outside_1,
  gtr: gtr_1,
  ltr: ltr_1,
  intersects: intersects_1,
  simplifyRange: simplify,
  subset: subset_1,
};

function shouldUseTrustedInputForSegwit({
  version,
  name
}) {
  if (name === "Decred") return false;
  if (name === "Exchange") return true;
  return semver$1.gte(version, "1.4.0");
}

const defaultsSignTransaction = {
  lockTime: DEFAULT_LOCKTIME,
  sigHashType: SIGHASH_ALL,
  segwit: false,
  additionals: [],
  onDeviceStreaming: _e => {},
  onDeviceSignatureGranted: () => {},
  onDeviceSignatureRequested: () => {}
};
/**
 *
 */

async function createTransaction(transport, arg) {
  let {
    inputs,
    associatedKeysets,
    changePath,
    outputScriptHex,
    lockTime,
    sigHashType,
    segwit,
    initialTimestamp,
    additionals,
    expiryHeight,
    useTrustedInputForSegwit,
    onDeviceStreaming,
    onDeviceSignatureGranted,
    onDeviceSignatureRequested
  } = { ...defaultsSignTransaction,
    ...arg
  };

  if (useTrustedInputForSegwit === undefined) {
    try {
      const a = await getAppAndVersion(transport);
      useTrustedInputForSegwit = shouldUseTrustedInputForSegwit(a);
    } catch (e) {
      if (e.statusCode === 0x6d00) {
        useTrustedInputForSegwit = false;
      } else {
        throw e;
      }
    }
  } // loop: 0 or 1 (before and after)
  // i: index of the input being streamed
  // i goes on 0...n, inluding n. in order for the progress value to go to 1
  // we normalize the 2 loops to make a global percentage


  const notify = (loop, i) => {
    const {
      length
    } = inputs;
    if (length < 3) return; // there is not enough significant event to worth notifying (aka just use a spinner)

    const index = length * loop + i;
    const total = 2 * length;
    const progress = index / total;
    onDeviceStreaming({
      progress,
      total,
      index
    });
  };

  const isDecred = additionals.includes("decred");
  const isXST = additionals.includes("stealthcoin");
  let startTime = Date.now();
  const sapling = additionals.includes("sapling");
  const bech32 = segwit && additionals.includes("bech32");
  let useBip143 = segwit || !!additionals && (additionals.includes("abc") || additionals.includes("gold") || additionals.includes("bip143")) || !!expiryHeight && !isDecred; // Inputs are provided as arrays of [transaction, output_index, optional redeem script, optional sequence]
  // associatedKeysets are provided as arrays of [path]

  const nullScript = Buffer.alloc(0);
  const nullPrevout = Buffer.alloc(0);
  const defaultVersion = Buffer.alloc(4);
  !!expiryHeight && !isDecred ? defaultVersion.writeUInt32LE(sapling ? 0x80000004 : 0x80000003, 0) : isXST ? defaultVersion.writeUInt32LE(2, 0) : defaultVersion.writeUInt32LE(1, 0); // Default version to 2 for XST not to have timestamp

  const trustedInputs = [];
  const regularOutputs = [];
  const signatures = [];
  const publicKeys = [];
  let firstRun = true;
  const targetTransaction = {
    inputs: [],
    version: defaultVersion,
    timestamp: Buffer.alloc(0)
  };
  const getTrustedInputCall = useBip143 && !useTrustedInputForSegwit ? getTrustedInputBIP143 : getTrustedInput;
  const outputScript = Buffer.from(outputScriptHex, "hex");
  notify(0, 0); // first pass on inputs to get trusted inputs

  for (let input of inputs) {
    {
      const trustedInput = await getTrustedInputCall(transport, input[1], input[0], additionals);
      log("hw", "got trustedInput=" + trustedInput);
      let sequence = Buffer.alloc(4);
      sequence.writeUInt32LE(input.length >= 4 && typeof input[3] === "number" ? input[3] : DEFAULT_SEQUENCE, 0);
      trustedInputs.push({
        trustedInput: true,
        value: Buffer.from(trustedInput, "hex"),
        sequence
      });
    }

    const {
      outputs
    } = input[0];
    const index = input[1];

    if (outputs && index <= outputs.length - 1) {
      regularOutputs.push(outputs[index]);
    }

    if (expiryHeight && !isDecred) {
      targetTransaction.nVersionGroupId = Buffer.from(sapling ? [0x85, 0x20, 0x2f, 0x89] : [0x70, 0x82, 0xc4, 0x03]);
      targetTransaction.nExpiryHeight = expiryHeight; // For sapling : valueBalance (8), nShieldedSpend (1), nShieldedOutput (1), nJoinSplit (1)
      // Overwinter : use nJoinSplit (1)

      targetTransaction.extraData = Buffer.from(sapling ? [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00] : [0x00]);
    } else if (isDecred) {
      targetTransaction.nExpiryHeight = expiryHeight;
    }
  }

  targetTransaction.inputs = inputs.map(input => {
    let sequence = Buffer.alloc(4);
    sequence.writeUInt32LE(input.length >= 4 && typeof input[3] === "number" ? input[3] : DEFAULT_SEQUENCE, 0);
    return {
      script: nullScript,
      prevout: nullPrevout,
      sequence
    };
  });

  {
    // Collect public keys
    const result = [];

    for (let i = 0; i < inputs.length; i++) {
      const r = await getWalletPublicKey(transport, {
        path: associatedKeysets[i]
      });
      notify(0, i + 1);
      result.push(r);
    }

    for (let i = 0; i < result.length; i++) {
      publicKeys.push(compressPublicKey(Buffer.from(result[i].publicKey, "hex")));
    }
  }

  if (initialTimestamp !== undefined) {
    targetTransaction.timestamp = Buffer.alloc(4);
    targetTransaction.timestamp.writeUInt32LE(Math.floor(initialTimestamp + (Date.now() - startTime) / 1000), 0);
  }

  onDeviceSignatureRequested();

  if (useBip143) {
    // Do the first run with all inputs
    await startUntrustedHashTransactionInput(transport, true, targetTransaction, trustedInputs, true, !!expiryHeight, additionals, useTrustedInputForSegwit);

    if ( changePath) {
      await provideOutputFullChangePath(transport, changePath);
    }

    await hashOutputFull(transport, outputScript);
  }

  if (!!expiryHeight && !isDecred) {
    await signTransaction(transport, "", lockTime, SIGHASH_ALL, expiryHeight);
  } // Do the second run with the individual transaction


  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    let script = inputs[i].length >= 3 && typeof input[2] === "string" ? Buffer.from(input[2], "hex") : !segwit ? regularOutputs[i].script : Buffer.concat([Buffer.from([OP_DUP, OP_HASH160, HASH_SIZE]), hashPublicKey(publicKeys[i]), Buffer.from([OP_EQUALVERIFY, OP_CHECKSIG])]);
    let pseudoTX = Object.assign({}, targetTransaction);
    let pseudoTrustedInputs = useBip143 ? [trustedInputs[i]] : trustedInputs;

    if (useBip143) {
      pseudoTX.inputs = [{ ...pseudoTX.inputs[i],
        script
      }];
    } else {
      pseudoTX.inputs[i].script = script;
    }

    await startUntrustedHashTransactionInput(transport, !useBip143 && firstRun, pseudoTX, pseudoTrustedInputs, useBip143, !!expiryHeight && !isDecred, additionals, useTrustedInputForSegwit);

    if (!useBip143) {
      if ( changePath) {
        await provideOutputFullChangePath(transport, changePath);
      }

      await hashOutputFull(transport, outputScript, additionals);
    }

    if (firstRun) {
      onDeviceSignatureGranted();
      notify(1, 0);
    }

    const signature = await signTransaction(transport, associatedKeysets[i], lockTime, sigHashType, expiryHeight, additionals);
    notify(1, i + 1);
    signatures.push(signature);
    targetTransaction.inputs[i].script = nullScript;

    if (firstRun) {
      firstRun = false;
    }
  } // Populate the final input scripts


  for (let i = 0; i < inputs.length; i++) {
    if (segwit) {
      targetTransaction.witness = Buffer.alloc(0);

      if (!bech32) {
        targetTransaction.inputs[i].script = Buffer.concat([Buffer.from("160014", "hex"), hashPublicKey(publicKeys[i])]);
      }
    } else {
      const signatureSize = Buffer.alloc(1);
      const keySize = Buffer.alloc(1);
      signatureSize[0] = signatures[i].length;
      keySize[0] = publicKeys[i].length;
      targetTransaction.inputs[i].script = Buffer.concat([signatureSize, signatures[i], keySize, publicKeys[i]]);
    }

    let offset = useBip143 && !useTrustedInputForSegwit ? 0 : 4;
    targetTransaction.inputs[i].prevout = trustedInputs[i].value.slice(offset, offset + 0x24);
  }

  const lockTimeBuffer = Buffer.alloc(4);
  lockTimeBuffer.writeUInt32LE(lockTime, 0);
  var result = Buffer.concat([serializeTransaction(targetTransaction, false, targetTransaction.timestamp, additionals), outputScript]);

  if (segwit && !isDecred) {
    var witness = Buffer.alloc(0);

    for (var i = 0; i < inputs.length; i++) {
      var tmpScriptData = Buffer.concat([Buffer.from("02", "hex"), Buffer.from([signatures[i].length]), signatures[i], Buffer.from([publicKeys[i].length]), publicKeys[i]]);
      witness = Buffer.concat([witness, tmpScriptData]);
    }

    result = Buffer.concat([result, witness]);
  } // FIXME: In ZEC or KMD sapling lockTime is serialized before expiryHeight.
  // expiryHeight is used only in overwinter/sapling so I moved lockTimeBuffer here
  // and it should not break other coins because expiryHeight is false for them.
  // Don't know about Decred though.


  result = Buffer.concat([result, lockTimeBuffer]);

  if (expiryHeight) {
    result = Buffer.concat([result, targetTransaction.nExpiryHeight || Buffer.alloc(0), targetTransaction.extraData || Buffer.alloc(0)]);
  }

  if (isDecred) {
    let decredWitness = Buffer.from([targetTransaction.inputs.length]);
    inputs.forEach((input, inputIndex) => {
      decredWitness = Buffer.concat([decredWitness, Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), Buffer.from([0x00, 0x00, 0x00, 0x00]), //Block height
      Buffer.from([0xff, 0xff, 0xff, 0xff]), //Block index
      Buffer.from([targetTransaction.inputs[inputIndex].script.length]), targetTransaction.inputs[inputIndex].script]);
    });
    result = Buffer.concat([result, decredWitness]);
  }

  return result.toString("hex");
}

const defaultArg = {
  lockTime: DEFAULT_LOCKTIME,
  sigHashType: SIGHASH_ALL,
  segwit: false,
  transactionVersion: DEFAULT_VERSION
};
/**
 *
 */

async function signP2SHTransaction(transport, arg) {
  const {
    inputs,
    associatedKeysets,
    outputScriptHex,
    lockTime,
    sigHashType,
    segwit,
    transactionVersion
  } = { ...defaultArg,
    ...arg
  }; // Inputs are provided as arrays of [transaction, output_index, redeem script, optional sequence]
  // associatedKeysets are provided as arrays of [path]

  const nullScript = Buffer.alloc(0);
  const nullPrevout = Buffer.alloc(0);
  const defaultVersion = Buffer.alloc(4);
  defaultVersion.writeUInt32LE(transactionVersion, 0);
  const trustedInputs = [];
  const regularOutputs = [];
  const signatures = [];
  let firstRun = true;
  let targetTransaction = {
    inputs: [],
    version: defaultVersion
  };
  const getTrustedInputCall = segwit ? getTrustedInputBIP143 : getTrustedInput;
  const outputScript = Buffer.from(outputScriptHex, "hex");

  for (let input of inputs) {
    {
      const trustedInput = await getTrustedInputCall(transport, input[1], input[0]);
      let sequence = Buffer.alloc(4);
      sequence.writeUInt32LE(input.length >= 4 && typeof input[3] === "number" ? input[3] : DEFAULT_SEQUENCE, 0);
      trustedInputs.push({
        trustedInput: false,
        value: segwit ? Buffer.from(trustedInput, "hex") : Buffer.from(trustedInput, "hex").slice(4, 4 + 0x24),
        sequence
      });
    }

    const {
      outputs
    } = input[0];
    const index = input[1];

    if (outputs && index <= outputs.length - 1) {
      regularOutputs.push(outputs[index]);
    }
  } // Pre-build the target transaction


  for (let i = 0; i < inputs.length; i++) {
    let sequence = Buffer.alloc(4);
    sequence.writeUInt32LE(inputs[i].length >= 4 && typeof inputs[i][3] === "number" ? inputs[i][3] : DEFAULT_SEQUENCE, 0);
    targetTransaction.inputs.push({
      script: nullScript,
      prevout: nullPrevout,
      sequence
    });
  }

  if (segwit) {
    await startUntrustedHashTransactionInput(transport, true, targetTransaction, trustedInputs, true);
    await hashOutputFull(transport, outputScript);
  }

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    let script = inputs[i].length >= 3 && typeof input[2] === "string" ? Buffer.from(input[2], "hex") : regularOutputs[i].script;
    let pseudoTX = Object.assign({}, targetTransaction);
    let pseudoTrustedInputs = segwit ? [trustedInputs[i]] : trustedInputs;

    if (segwit) {
      pseudoTX.inputs = [{ ...pseudoTX.inputs[i],
        script
      }];
    } else {
      pseudoTX.inputs[i].script = script;
    }

    await startUntrustedHashTransactionInput(transport, !segwit && firstRun, pseudoTX, pseudoTrustedInputs, segwit);

    if (!segwit) {
      await hashOutputFull(transport, outputScript);
    }

    const signature = await signTransaction(transport, associatedKeysets[i], lockTime, sigHashType);
    signatures.push(segwit ? signature.toString("hex") : signature.slice(0, signature.length - 1).toString("hex"));
    targetTransaction.inputs[i].script = nullScript;

    if (firstRun) {
      firstRun = false;
    }
  }

  return signatures;
}

/**
 * Bitcoin API.
 *
 * @example
 * import Btc from "@ledgerhq/hw-app-btc";
 * const btc = new Btc(transport)
 */
class Btc {
  constructor(transport, scrambleKey = "BTC") {
    this.transport = void 0;
    this.transport = transport;
    transport.decorateAppAPIMethods(this, ["getWalletPublicKey", "signP2SHTransaction", "signMessageNew", "createPaymentTransactionNew", "getTrustedInput", "getTrustedInputBIP143"], scrambleKey);
  }
  /**
   * @param path a BIP 32 path
   * @param options an object with optional these fields:
   *
   * - verify (boolean) will ask user to confirm the address on the device
   *
   * - format ("legacy" | "p2sh" | "bech32" | "cashaddr") to use different bitcoin address formatter.
   *
   * NB The normal usage is to use:
   *
   * - legacy format with 44' paths
   *
   * - p2sh format with 49' paths
   *
   * - bech32 format with 173' paths
   *
   * - cashaddr in case of Bitcoin Cash
   *
   * @example
   * btc.getWalletPublicKey("44'/0'/0'/0/0").then(o => o.bitcoinAddress)
   * btc.getWalletPublicKey("49'/0'/0'/0/0", { format: "p2sh" }).then(o => o.bitcoinAddress)
   */


  getWalletPublicKey(path, opts) {
    let options;

    if (arguments.length > 2 || typeof opts === "boolean") {
      console.warn("btc.getWalletPublicKey deprecated signature used. Please switch to getWalletPublicKey(path, { format, verify })");
      options = {
        verify: !!opts,
        format: arguments[2] ? "p2sh" : "legacy"
      };
    } else {
      options = opts || {};
    }

    return getWalletPublicKey(this.transport, { ...options,
      path
    });
  }
  /**
   * You can sign a message according to the Bitcoin Signature format and retrieve v, r, s given the message and the BIP 32 path of the account to sign.
   * @example
   btc.signMessageNew_async("44'/60'/0'/0'/0", Buffer.from("test").toString("hex")).then(function(result) {
     var v = result['v'] + 27 + 4;
     var signature = Buffer.from(v.toString(16) + result['r'] + result['s'], 'hex').toString('base64');
     console.log("Signature : " + signature);
   }).catch(function(ex) {console.log(ex);});
   */


  signMessageNew(path, messageHex) {
    return signMessage(this.transport, {
      path,
      messageHex
    });
  }
  /**
   * To sign a transaction involving standard (P2PKH) inputs, call createTransaction with the following parameters
   * @param inputs is an array of [ transaction, output_index, optional redeem script, optional sequence ] where
   *
   * * transaction is the previously computed transaction object for this UTXO
   * * output_index is the output in the transaction used as input for this UTXO (counting from 0)
   * * redeem script is the optional redeem script to use when consuming a Segregated Witness input
   * * sequence is the sequence number to use for this input (when using RBF), or non present
   * @param associatedKeysets is an array of BIP 32 paths pointing to the path to the private key used for each UTXO
   * @param changePath is an optional BIP 32 path pointing to the path to the public key used to compute the change address
   * @param outputScriptHex is the hexadecimal serialized outputs of the transaction to sign
   * @param lockTime is the optional lockTime of the transaction to sign, or default (0)
   * @param sigHashType is the hash type of the transaction to sign, or default (all)
   * @param segwit is an optional boolean indicating wether to use segwit or not
   * @param initialTimestamp is an optional timestamp of the function call to use for coins that necessitate timestamps only, (not the one that the tx will include)
   * @param additionals list of additionnal options
   *
   * - "bech32" for spending native segwit outputs
   * - "abc" for bch
   * - "gold" for btg
   * - "bipxxx" for using BIPxxx
   * - "sapling" to indicate a zec transaction is supporting sapling (to be set over block 419200)
   * @param expiryHeight is an optional Buffer for zec overwinter / sapling Txs
   * @param useTrustedInputForSegwit trust inputs for segwit transactions
   * @return the signed transaction ready to be broadcast
   * @example
  btc.createTransaction({
   inputs: [ [tx1, 1] ],
   associatedKeysets: ["0'/0/0"],
   outputScriptHex: "01905f0100000000001976a91472a5d75c8d2d0565b656a5232703b167d50d5a2b88ac"
  }).then(res => ...);
   */


  createPaymentTransactionNew(arg) {
    if (arguments.length > 1) {
      console.warn("@ledgerhq/hw-app-btc: createPaymentTransactionNew multi argument signature is deprecated. please switch to named parameters.");
      arg = fromDeprecateArguments(arguments, ["inputs", "associatedKeysets", "changePath", "outputScriptHex", "lockTime", "sigHashType", "segwit", "initialTimestamp", "additionals", "expiryHeight", "useTrustedInputForSegwit"]);
    }

    return createTransaction(this.transport, arg);
  }
  /**
   * To obtain the signature of multisignature (P2SH) inputs, call signP2SHTransaction_async with the folowing parameters
   * @param inputs is an array of [ transaction, output_index, redeem script, optional sequence ] where
   * * transaction is the previously computed transaction object for this UTXO
   * * output_index is the output in the transaction used as input for this UTXO (counting from 0)
   * * redeem script is the mandatory redeem script associated to the current P2SH input
   * * sequence is the sequence number to use for this input (when using RBF), or non present
   * @param associatedKeysets is an array of BIP 32 paths pointing to the path to the private key used for each UTXO
   * @param outputScriptHex is the hexadecimal serialized outputs of the transaction to sign
   * @param lockTime is the optional lockTime of the transaction to sign, or default (0)
   * @param sigHashType is the hash type of the transaction to sign, or default (all)
   * @return the signed transaction ready to be broadcast
   * @example
  btc.signP2SHTransaction({
  inputs: [ [tx, 1, "52210289b4a3ad52a919abd2bdd6920d8a6879b1e788c38aa76f0440a6f32a9f1996d02103a3393b1439d1693b063482c04bd40142db97bdf139eedd1b51ffb7070a37eac321030b9a409a1e476b0d5d17b804fcdb81cf30f9b99c6f3ae1178206e08bc500639853ae"] ],
  associatedKeysets: ["0'/0/0"],
  outputScriptHex: "01905f0100000000001976a91472a5d75c8d2d0565b656a5232703b167d50d5a2b88ac"
  }).then(result => ...);
   */


  signP2SHTransaction(arg) {
    if (arguments.length > 1) {
      console.warn("@ledgerhq/hw-app-btc: signP2SHTransaction multi argument signature is deprecated. please switch to named parameters.");
      const [inputs, associatedKeysets, outputScriptHex, lockTime, sigHashType, segwit, transactionVersion] = arguments;
      arg = {
        inputs,
        associatedKeysets,
        outputScriptHex,
        lockTime,
        sigHashType,
        segwit,
        transactionVersion
      };
      arg = fromDeprecateArguments(arguments, ["inputs", "associatedKeysets", "outputScriptHex", "lockTime", "sigHashType", "segwit", "transactionVersion"]);
    }

    return signP2SHTransaction(this.transport, arg);
  }
  /**
   * For each UTXO included in your transaction, create a transaction object from the raw serialized version of the transaction used in this UTXO.
   * @example
  const tx1 = btc.splitTransaction("01000000014ea60aeac5252c14291d428915bd7ccd1bfc4af009f4d4dc57ae597ed0420b71010000008a47304402201f36a12c240dbf9e566bc04321050b1984cd6eaf6caee8f02bb0bfec08e3354b022012ee2aeadcbbfd1e92959f57c15c1c6debb757b798451b104665aa3010569b49014104090b15bde569386734abf2a2b99f9ca6a50656627e77de663ca7325702769986cf26cc9dd7fdea0af432c8e2becc867c932e1b9dd742f2a108997c2252e2bdebffffffff0281b72e00000000001976a91472a5d75c8d2d0565b656a5232703b167d50d5a2b88aca0860100000000001976a9144533f5fb9b4817f713c48f0bfe96b9f50c476c9b88ac00000000");
   */


  splitTransaction(transactionHex, isSegwitSupported = false, hasTimestamp = false, hasExtraData = false, additionals = []) {
    return splitTransaction(transactionHex, isSegwitSupported, hasTimestamp, hasExtraData, additionals);
  }
  /**
  @example
  const tx1 = btc.splitTransaction("01000000014ea60aeac5252c14291d428915bd7ccd1bfc4af009f4d4dc57ae597ed0420b71010000008a47304402201f36a12c240dbf9e566bc04321050b1984cd6eaf6caee8f02bb0bfec08e3354b022012ee2aeadcbbfd1e92959f57c15c1c6debb757b798451b104665aa3010569b49014104090b15bde569386734abf2a2b99f9ca6a50656627e77de663ca7325702769986cf26cc9dd7fdea0af432c8e2becc867c932e1b9dd742f2a108997c2252e2bdebffffffff0281b72e00000000001976a91472a5d75c8d2d0565b656a5232703b167d50d5a2b88aca0860100000000001976a9144533f5fb9b4817f713c48f0bfe96b9f50c476c9b88ac00000000");
  const outputScript = btc.serializeTransactionOutputs(tx1).toString('hex');
  */


  serializeTransactionOutputs(t) {
    return serializeTransactionOutputs(t);
  }

  getTrustedInput(indexLookup, transaction, additionals = []) {
    return getTrustedInput(this.transport, indexLookup, transaction, additionals);
  }

  getTrustedInputBIP143(indexLookup, transaction, additionals = []) {
    return getTrustedInputBIP143(this.transport, indexLookup, transaction, additionals);
  }

}

function fromDeprecateArguments(args, keys) {
  const obj = {};
  keys.forEach((key, i) => {
    const value = args[i];

    if (value !== undefined) {
      obj[key] = value;
    }
  });
  return obj;
}
//# sourceMappingURL=Btc.js.map

export default Btc;
//# sourceMappingURL=lazy-chunk-Btc.es.js.map
