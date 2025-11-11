import { b as buffer } from './lazy-chunk-index.es.js';
import { b as bs58check, v as varuint, R as RIPEMD160, s as sha, c as crypto_1, j as js, a as bs58 } from './lazy-chunk-bitcoin-lib.es.js';
import { g as getDefaultExportFromCjs } from './lazy-chunk-_commonjsHelpers.es.js';
import { l as log } from './lazy-chunk-index.es3.js';
import { p as process } from './lazy-chunk-_virtual_process.es.js';
import { r as requireLruCache } from './lazy-chunk-index.es4.js';
import './lazy-chunk-sha256.es.js';
import './lazy-chunk-events.es.js';

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

var bippath = /*@__PURE__*/getDefaultExportFromCjs(bip32Path);

function pathElementsToBuffer(paths) {
    const buffer$1 = buffer.Buffer.alloc(1 + paths.length * 4);
    buffer$1[0] = paths.length;
    paths.forEach((element, index) => {
        buffer$1.writeUInt32BE(element, 1 + 4 * index);
    });
    return buffer$1;
}
function bip32asBuffer(path) {
    const pathElements = !path ? [] : pathStringToArray(path);
    return pathElementsToBuffer(pathElements);
}
function pathArrayToString(pathElements) {
    // Limitation: bippath can't handle and empty path. It shouldn't affect us
    // right now, but might in the future.
    // TODO: Fix support for empty path.
    return bippath.fromPathArray(pathElements).toString();
}
function pathStringToArray(path) {
    return bippath.fromString(path).toPathArray();
}
function pubkeyFromXpub(xpub) {
    const xpubBuf = bs58check.decode(xpub);
    return xpubBuf.slice(xpubBuf.length - 33);
}
function getXpubComponents(xpub) {
    const xpubBuf = bs58check.decode(xpub);
    return {
        chaincode: xpubBuf.slice(13, 13 + 32),
        pubkey: xpubBuf.slice(xpubBuf.length - 33),
        version: xpubBuf.readUInt32BE(0),
    };
}
function hardenedPathOf(pathElements) {
    for (let i = pathElements.length - 1; i >= 0; i--) {
        if (pathElements[i] >= 0x80000000) {
            return pathElements.slice(0, i + 1);
        }
    }
    return [];
}

function unsafeTo64bitLE(n) {
    // we want to represent the input as a 8-bytes array
    if (n > Number.MAX_SAFE_INTEGER) {
        throw new Error("Can't convert numbers > MAX_SAFE_INT");
    }
    const byteArray = buffer.Buffer.alloc(8, 0);
    for (let index = 0; index < byteArray.length; index++) {
        const byte = n & 0xff;
        byteArray[index] = byte;
        n = (n - byte) / 256;
    }
    return byteArray;
}
function unsafeFrom64bitLE(byteArray) {
    let value = 0;
    if (byteArray.length != 8) {
        throw new Error("Expected Bufffer of lenght 8");
    }
    if (byteArray[7] != 0) {
        throw new Error("Can't encode numbers > MAX_SAFE_INT");
    }
    if (byteArray[6] > 0x1f) {
        throw new Error("Can't encode numbers > MAX_SAFE_INT");
    }
    for (let i = byteArray.length - 1; i >= 0; i--) {
        value = value * 256 + byteArray[i];
    }
    return value;
}
class BufferWriter {
    constructor() {
        this.bufs = [];
    }
    write(alloc, fn) {
        const b = buffer.Buffer.alloc(alloc);
        fn(b);
        this.bufs.push(b);
    }
    writeUInt8(i) {
        this.write(1, b => b.writeUInt8(i, 0));
    }
    writeInt32(i) {
        this.write(4, b => b.writeInt32LE(i, 0));
    }
    writeUInt32(i) {
        this.write(4, b => b.writeUInt32LE(i, 0));
    }
    writeUInt64(i) {
        const bytes = unsafeTo64bitLE(i);
        this.writeSlice(bytes);
    }
    writeVarInt(i) {
        this.bufs.push(varuint.encode(i));
    }
    writeSlice(slice) {
        this.bufs.push(buffer.Buffer.from(slice));
    }
    writeVarSlice(slice) {
        this.writeVarInt(slice.length);
        this.writeSlice(slice);
    }
    buffer() {
        return buffer.Buffer.concat(this.bufs);
    }
}
class BufferReader {
    constructor(buffer, offset = 0) {
        this.buffer = buffer;
        this.offset = offset;
    }
    available() {
        return this.buffer.length - this.offset;
    }
    readUInt8() {
        const result = this.buffer.readUInt8(this.offset);
        this.offset++;
        return result;
    }
    readInt32() {
        const result = this.buffer.readInt32LE(this.offset);
        this.offset += 4;
        return result;
    }
    readUInt32() {
        const result = this.buffer.readUInt32LE(this.offset);
        this.offset += 4;
        return result;
    }
    readUInt64() {
        const buf = this.readSlice(8);
        const n = unsafeFrom64bitLE(buf);
        return n;
    }
    readVarInt() {
        const vi = varuint.decode(this.buffer, this.offset);
        this.offset += varuint.decode.bytes;
        return vi;
    }
    readSlice(n) {
        if (this.buffer.length < this.offset + n) {
            throw new Error("Cannot read slice out of bounds");
        }
        const result = this.buffer.slice(this.offset, this.offset + n);
        this.offset += n;
        return result;
    }
    readVarSlice() {
        return this.readSlice(this.readVarInt());
    }
    readVector() {
        const count = this.readVarInt();
        const vector = [];
        for (let i = 0; i < count; i++)
            vector.push(this.readVarSlice());
        return vector;
    }
}

// flow
const MAX_SCRIPT_BLOCK = 50;
const DEFAULT_VERSION = 1;
const DEFAULT_LOCKTIME = 0;
const DEFAULT_SEQUENCE = 0xffffffff;
const SIGHASH_ALL = 1;
const OP_DUP = 0x76;
const OP_HASH160 = 0xa9;
const HASH_SIZE = 0x14;
const OP_EQUAL = 0x87;
const OP_EQUALVERIFY = 0x88;
const OP_CHECKSIG = 0xac;

function hashPublicKey(buffer) {
    return new RIPEMD160().update(sha("sha256").update(buffer).digest()).digest();
}

class BaseAccount {
    constructor(psbt, masterFp) {
        this.psbt = psbt;
        this.masterFp = masterFp;
    }
}
/**
 * Superclass for single signature accounts. This will make sure that the pubkey
 * arrays and path arrays in the method arguments contains exactly one element
 * and calls an abstract method to do the actual work.
 */
class SingleKeyAccount extends BaseAccount {
    spendingCondition(pubkeys) {
        if (pubkeys.length != 1) {
            throw new Error("Expected single key, got " + pubkeys.length);
        }
        return this.singleKeyCondition(pubkeys[0]);
    }
    setInput(i, inputTx, spentOutput, pubkeys, pathElems) {
        if (pubkeys.length != 1) {
            throw new Error("Expected single key, got " + pubkeys.length);
        }
        if (pathElems.length != 1) {
            throw new Error("Expected single path, got " + pathElems.length);
        }
        this.setSingleKeyInput(i, inputTx, spentOutput, pubkeys[0], pathElems[0]);
    }
    setOwnOutput(i, cond, pubkeys, paths) {
        if (pubkeys.length != 1) {
            throw new Error("Expected single key, got " + pubkeys.length);
        }
        if (paths.length != 1) {
            throw new Error("Expected single path, got " + paths.length);
        }
        this.setSingleKeyOutput(i, cond, pubkeys[0], paths[0]);
    }
}
class p2pkh extends SingleKeyAccount {
    singleKeyCondition(pubkey) {
        const buf = new BufferWriter();
        const pubkeyHash = hashPublicKey(pubkey);
        buf.writeSlice(buffer.Buffer.from([OP_DUP, OP_HASH160, HASH_SIZE]));
        buf.writeSlice(pubkeyHash);
        buf.writeSlice(buffer.Buffer.from([OP_EQUALVERIFY, OP_CHECKSIG]));
        return { scriptPubKey: buf.buffer() };
    }
    setSingleKeyInput(i, inputTx, _spentOutput, pubkey, path) {
        if (!inputTx) {
            throw new Error("Full input base transaction required");
        }
        this.psbt.setInputNonWitnessUtxo(i, inputTx);
        this.psbt.setInputBip32Derivation(i, pubkey, this.masterFp, path);
    }
    setSingleKeyOutput(i, cond, pubkey, path) {
        this.psbt.setOutputBip32Derivation(i, pubkey, this.masterFp, path);
    }
    getDescriptorTemplate() {
        return "pkh(@0)";
    }
}
class p2tr extends SingleKeyAccount {
    singleKeyCondition(pubkey) {
        const xonlyPubkey = pubkey.slice(1); // x-only pubkey
        const buf = new BufferWriter();
        const outputKey = this.getTaprootOutputKey(xonlyPubkey);
        buf.writeSlice(buffer.Buffer.from([0x51, 32])); // push1, pubkeylen
        buf.writeSlice(outputKey);
        return { scriptPubKey: buf.buffer() };
    }
    setSingleKeyInput(i, _inputTx, spentOutput, pubkey, path) {
        const xonly = pubkey.slice(1);
        this.psbt.setInputTapBip32Derivation(i, xonly, [], this.masterFp, path);
        this.psbt.setInputWitnessUtxo(i, spentOutput.amount, spentOutput.cond.scriptPubKey);
    }
    setSingleKeyOutput(i, cond, pubkey, path) {
        const xonly = pubkey.slice(1);
        this.psbt.setOutputTapBip32Derivation(i, xonly, [], this.masterFp, path);
    }
    getDescriptorTemplate() {
        return "tr(@0)";
    }
    /*
    The following two functions are copied from wallet-btc and adapted.
    They should be moved to a library to avoid code reuse.
    */
    hashTapTweak(x) {
        // hash_tag(x) = SHA256(SHA256(tag) || SHA256(tag) || x), see BIP340
        // See https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki#specification
        const h = crypto_1.sha256(buffer.Buffer.from("TapTweak", "utf-8"));
        return crypto_1.sha256(buffer.Buffer.concat([h, h, x]));
    }
    /**
     * Calculates a taproot output key from an internal key. This output key will be
     * used as witness program in a taproot output. The internal key is tweaked
     * according to recommendation in BIP341:
     * https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki#cite_ref-22-0
     *
     * @param internalPubkey A 32 byte x-only taproot internal key
     * @returns The output key
     */
    getTaprootOutputKey(internalPubkey) {
        if (internalPubkey.length != 32) {
            throw new Error("Expected 32 byte pubkey. Got " + internalPubkey.length);
        }
        // A BIP32 derived key can be converted to a schnorr pubkey by dropping
        // the first byte, which represent the oddness/evenness. In schnorr all
        // pubkeys are even.
        // https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki#public-key-conversion
        const evenEcdsaPubkey = buffer.Buffer.concat([buffer.Buffer.from([0x02]), internalPubkey]);
        const tweak = this.hashTapTweak(internalPubkey);
        // Q = P + int(hash_TapTweak(bytes(P)))G
        const outputEcdsaKey = buffer.Buffer.from(js.pointAddScalar(evenEcdsaPubkey, tweak));
        // Convert to schnorr.
        const outputSchnorrKey = outputEcdsaKey.slice(1);
        // Create address
        return outputSchnorrKey;
    }
}
class p2wpkhWrapped extends SingleKeyAccount {
    singleKeyCondition(pubkey) {
        const buf = new BufferWriter();
        const redeemScript = this.createRedeemScript(pubkey);
        const scriptHash = hashPublicKey(redeemScript);
        buf.writeSlice(buffer.Buffer.from([OP_HASH160, HASH_SIZE]));
        buf.writeSlice(scriptHash);
        buf.writeUInt8(OP_EQUAL);
        return { scriptPubKey: buf.buffer(), redeemScript: redeemScript };
    }
    setSingleKeyInput(i, inputTx, spentOutput, pubkey, path) {
        if (!inputTx) {
            throw new Error("Full input base transaction required");
        }
        this.psbt.setInputNonWitnessUtxo(i, inputTx);
        this.psbt.setInputBip32Derivation(i, pubkey, this.masterFp, path);
        const userSuppliedRedeemScript = spentOutput.cond.redeemScript;
        const expectedRedeemScript = this.createRedeemScript(pubkey);
        if (userSuppliedRedeemScript && !expectedRedeemScript.equals(userSuppliedRedeemScript)) {
            // At what point might a user set the redeemScript on its own?
            throw new Error(`User-supplied redeemScript ${userSuppliedRedeemScript.toString("hex")} doesn't
       match expected ${expectedRedeemScript.toString("hex")} for input ${i}`);
        }
        this.psbt.setInputRedeemScript(i, expectedRedeemScript);
        this.psbt.setInputWitnessUtxo(i, spentOutput.amount, spentOutput.cond.scriptPubKey);
    }
    setSingleKeyOutput(i, cond, pubkey, path) {
        this.psbt.setOutputRedeemScript(i, cond.redeemScript);
        this.psbt.setOutputBip32Derivation(i, pubkey, this.masterFp, path);
    }
    getDescriptorTemplate() {
        return "sh(wpkh(@0))";
    }
    createRedeemScript(pubkey) {
        const pubkeyHash = hashPublicKey(pubkey);
        return buffer.Buffer.concat([buffer.Buffer.from("0014", "hex"), pubkeyHash]);
    }
}
class p2wpkh extends SingleKeyAccount {
    singleKeyCondition(pubkey) {
        const buf = new BufferWriter();
        const pubkeyHash = hashPublicKey(pubkey);
        buf.writeSlice(buffer.Buffer.from([0, HASH_SIZE]));
        buf.writeSlice(pubkeyHash);
        return { scriptPubKey: buf.buffer() };
    }
    setSingleKeyInput(i, inputTx, spentOutput, pubkey, path) {
        if (!inputTx) {
            throw new Error("Full input base transaction required");
        }
        this.psbt.setInputNonWitnessUtxo(i, inputTx);
        this.psbt.setInputBip32Derivation(i, pubkey, this.masterFp, path);
        this.psbt.setInputWitnessUtxo(i, spentOutput.amount, spentOutput.cond.scriptPubKey);
    }
    setSingleKeyOutput(i, cond, pubkey, path) {
        this.psbt.setOutputBip32Derivation(i, pubkey, this.masterFp, path);
    }
    getDescriptorTemplate() {
        return "wpkh(@0)";
    }
}

/**
 * This class implements the merkle tree used by Ledger Bitcoin app v2+,
 * which is documented at
 * https://github.com/LedgerHQ/app-bitcoin-new/blob/master/doc/merkle.md
 */
class Merkle {
    constructor(leaves, hasher = crypto_1.sha256) {
        this.leaves = leaves;
        this.h = hasher;
        const nodes = this.calculateRoot(leaves);
        this.rootNode = nodes.root;
        this.leafNodes = nodes.leaves;
    }
    getRoot() {
        return this.rootNode.hash;
    }
    size() {
        return this.leaves.length;
    }
    getLeaves() {
        return this.leaves;
    }
    getLeafHash(index) {
        return this.leafNodes[index].hash;
    }
    getProof(index) {
        if (index >= this.leaves.length)
            throw Error("Index out of bounds");
        return proveNode(this.leafNodes[index]);
    }
    calculateRoot(leaves) {
        const n = leaves.length;
        if (n == 0) {
            return {
                root: new Node(undefined, undefined, buffer.Buffer.alloc(32, 0)),
                leaves: [],
            };
        }
        if (n == 1) {
            const newNode = new Node(undefined, undefined, leaves[0]);
            return { root: newNode, leaves: [newNode] };
        }
        const leftCount = highestPowerOf2LessThan(n);
        const leftBranch = this.calculateRoot(leaves.slice(0, leftCount));
        const rightBranch = this.calculateRoot(leaves.slice(leftCount));
        const leftChild = leftBranch.root;
        const rightChild = rightBranch.root;
        const hash = this.hashNode(leftChild.hash, rightChild.hash);
        const node = new Node(leftChild, rightChild, hash);
        leftChild.parent = node;
        rightChild.parent = node;
        return { root: node, leaves: leftBranch.leaves.concat(rightBranch.leaves) };
    }
    hashNode(left, right) {
        return this.h(buffer.Buffer.concat([buffer.Buffer.from([1]), left, right]));
    }
}
function hashLeaf(buf, hashFunction = crypto_1.sha256) {
    return hashConcat(buffer.Buffer.from([0]), buf, hashFunction);
}
function hashConcat(bufA, bufB, hashFunction) {
    return hashFunction(buffer.Buffer.concat([bufA, bufB]));
}
class Node {
    constructor(left, right, hash) {
        this.leftChild = left;
        this.rightChild = right;
        this.hash = hash;
    }
    isLeaf() {
        return this.leftChild == undefined;
    }
}
function proveNode(node) {
    if (!node.parent) {
        return [];
    }
    if (node.parent.leftChild == node) {
        if (!node.parent.rightChild) {
            throw new Error("Expected right child to exist");
        }
        return [node.parent.rightChild.hash, ...proveNode(node.parent)];
    }
    else {
        if (!node.parent.leftChild) {
            throw new Error("Expected left child to exist");
        }
        return [node.parent.leftChild.hash, ...proveNode(node.parent)];
    }
}
function highestPowerOf2LessThan(n) {
    if (n < 2) {
        throw Error("Expected n >= 2");
    }
    if (isPowerOf2(n)) {
        return n / 2;
    }
    return 1 << Math.floor(Math.log2(n));
}
function isPowerOf2(n) {
    return (n & (n - 1)) == 0;
}

/**
 * The Bitcon hardware app uses a descriptors-like thing to describe
 * how to construct output scripts from keys. A "Wallet Policy" consists
 * of a "Descriptor Template" and a list of "keys". A key is basically
 * a serialized BIP32 extended public key with some added derivation path
 * information. This is documented at
 * https://github.com/LedgerHQ/app-bitcoin-new/blob/master/doc/wallet.md
 */
class WalletPolicy {
    /**
     * For now, we only support default descriptor templates.
     */
    constructor(descriptorTemplate, key) {
        this.descriptorTemplate = descriptorTemplate;
        this.keys = [key];
    }
    getWalletId() {
        // wallet_id (sha256 of the wallet serialization),
        return crypto_1.sha256(this.serialize());
    }
    serialize() {
        const keyBuffers = this.keys.map(k => {
            return buffer.Buffer.from(k, "ascii");
        });
        const m = new Merkle(keyBuffers.map(k => hashLeaf(k)));
        const buf = new BufferWriter();
        buf.writeUInt8(0x01); // wallet type (policy map)
        buf.writeUInt8(0); // length of wallet name (empty string for default wallets)
        buf.writeVarSlice(buffer.Buffer.from(this.descriptorTemplate, "ascii"));
        buf.writeVarInt(this.keys.length), buf.writeSlice(m.getRoot());
        return buf.buffer();
    }
}
function createKey$1(masterFingerprint, path, xpub) {
    const accountPath = pathArrayToString(path);
    return `[${masterFingerprint.toString("hex")}${accountPath.substring(1)}]${xpub}/**`;
}

/**
 * This implements the "Transaction Extractor" role of BIP370 (PSBTv2
 * https://github.com/bitcoin/bips/blob/master/bip-0370.mediawiki#transaction-extractor). However
 * the role is partially documented in BIP174 (PSBTv0
 * https://github.com/bitcoin/bips/blob/master/bip-0174.mediawiki#transaction-extractor).
 */
function extract(psbt) {
    var _a, _b;
    const tx = new BufferWriter();
    tx.writeUInt32(psbt.getGlobalTxVersion());
    const isSegwit = !!psbt.getInputWitnessUtxo(0);
    if (isSegwit) {
        tx.writeSlice(buffer.Buffer.from([0, 1]));
    }
    const inputCount = psbt.getGlobalInputCount();
    tx.writeVarInt(inputCount);
    const witnessWriter = new BufferWriter();
    for (let i = 0; i < inputCount; i++) {
        tx.writeSlice(psbt.getInputPreviousTxid(i));
        tx.writeUInt32(psbt.getInputOutputIndex(i));
        tx.writeVarSlice((_a = psbt.getInputFinalScriptsig(i)) !== null && _a !== void 0 ? _a : buffer.Buffer.from([]));
        tx.writeUInt32(psbt.getInputSequence(i));
        if (isSegwit) {
            witnessWriter.writeSlice(psbt.getInputFinalScriptwitness(i));
        }
    }
    const outputCount = psbt.getGlobalOutputCount();
    tx.writeVarInt(outputCount);
    for (let i = 0; i < outputCount; i++) {
        tx.writeUInt64(psbt.getOutputAmount(i));
        tx.writeVarSlice(psbt.getOutputScript(i));
    }
    tx.writeSlice(witnessWriter.buffer());
    tx.writeUInt32((_b = psbt.getGlobalFallbackLocktime()) !== null && _b !== void 0 ? _b : 0);
    return tx.buffer();
}

var psbtGlobal;
(function (psbtGlobal) {
    psbtGlobal[psbtGlobal["TX_VERSION"] = 2] = "TX_VERSION";
    psbtGlobal[psbtGlobal["FALLBACK_LOCKTIME"] = 3] = "FALLBACK_LOCKTIME";
    psbtGlobal[psbtGlobal["INPUT_COUNT"] = 4] = "INPUT_COUNT";
    psbtGlobal[psbtGlobal["OUTPUT_COUNT"] = 5] = "OUTPUT_COUNT";
    psbtGlobal[psbtGlobal["TX_MODIFIABLE"] = 6] = "TX_MODIFIABLE";
    psbtGlobal[psbtGlobal["VERSION"] = 251] = "VERSION";
})(psbtGlobal || (psbtGlobal = {}));
var psbtIn;
(function (psbtIn) {
    psbtIn[psbtIn["NON_WITNESS_UTXO"] = 0] = "NON_WITNESS_UTXO";
    psbtIn[psbtIn["WITNESS_UTXO"] = 1] = "WITNESS_UTXO";
    psbtIn[psbtIn["PARTIAL_SIG"] = 2] = "PARTIAL_SIG";
    psbtIn[psbtIn["SIGHASH_TYPE"] = 3] = "SIGHASH_TYPE";
    psbtIn[psbtIn["REDEEM_SCRIPT"] = 4] = "REDEEM_SCRIPT";
    psbtIn[psbtIn["BIP32_DERIVATION"] = 6] = "BIP32_DERIVATION";
    psbtIn[psbtIn["FINAL_SCRIPTSIG"] = 7] = "FINAL_SCRIPTSIG";
    psbtIn[psbtIn["FINAL_SCRIPTWITNESS"] = 8] = "FINAL_SCRIPTWITNESS";
    psbtIn[psbtIn["PREVIOUS_TXID"] = 14] = "PREVIOUS_TXID";
    psbtIn[psbtIn["OUTPUT_INDEX"] = 15] = "OUTPUT_INDEX";
    psbtIn[psbtIn["SEQUENCE"] = 16] = "SEQUENCE";
    psbtIn[psbtIn["TAP_KEY_SIG"] = 19] = "TAP_KEY_SIG";
    psbtIn[psbtIn["TAP_BIP32_DERIVATION"] = 22] = "TAP_BIP32_DERIVATION";
})(psbtIn || (psbtIn = {}));
var psbtOut;
(function (psbtOut) {
    psbtOut[psbtOut["REDEEM_SCRIPT"] = 0] = "REDEEM_SCRIPT";
    psbtOut[psbtOut["BIP_32_DERIVATION"] = 2] = "BIP_32_DERIVATION";
    psbtOut[psbtOut["AMOUNT"] = 3] = "AMOUNT";
    psbtOut[psbtOut["SCRIPT"] = 4] = "SCRIPT";
    psbtOut[psbtOut["TAP_BIP32_DERIVATION"] = 7] = "TAP_BIP32_DERIVATION";
})(psbtOut || (psbtOut = {}));
const PSBT_MAGIC_BYTES = buffer.Buffer.from([0x70, 0x73, 0x62, 0x74, 0xff]);
class NoSuchEntry extends Error {
}
/**
 * Implements Partially Signed Bitcoin Transaction version 2, BIP370, as
 * documented at https://github.com/bitcoin/bips/blob/master/bip-0370.mediawiki
 * and https://github.com/bitcoin/bips/blob/master/bip-0174.mediawiki
 *
 * A psbt is a data structure that can carry all relevant information about a
 * transaction through all stages of the signing process. From constructing an
 * unsigned transaction to extracting the final serialized transaction ready for
 * broadcast.
 *
 * This implementation is limited to what's needed in ledgerjs to carry out its
 * duties, which means that support for features like multisig or taproot script
 * path spending are not implemented. Specifically, it supports p2pkh,
 * p2wpkhWrappedInP2sh, p2wpkh and p2tr key path spending.
 *
 * This class is made purposefully dumb, so it's easy to add support for
 * complemantary fields as needed in the future.
 */
class PsbtV2 {
    constructor() {
        this.globalMap = new Map();
        this.inputMaps = [];
        this.outputMaps = [];
    }
    setGlobalTxVersion(version) {
        this.setGlobal(psbtGlobal.TX_VERSION, uint32LE(version));
    }
    getGlobalTxVersion() {
        return this.getGlobal(psbtGlobal.TX_VERSION).readUInt32LE(0);
    }
    setGlobalFallbackLocktime(locktime) {
        this.setGlobal(psbtGlobal.FALLBACK_LOCKTIME, uint32LE(locktime));
    }
    getGlobalFallbackLocktime() {
        var _a;
        return (_a = this.getGlobalOptional(psbtGlobal.FALLBACK_LOCKTIME)) === null || _a === void 0 ? void 0 : _a.readUInt32LE(0);
    }
    setGlobalInputCount(inputCount) {
        this.setGlobal(psbtGlobal.INPUT_COUNT, varint(inputCount));
    }
    getGlobalInputCount() {
        return fromVarint(this.getGlobal(psbtGlobal.INPUT_COUNT));
    }
    setGlobalOutputCount(outputCount) {
        this.setGlobal(psbtGlobal.OUTPUT_COUNT, varint(outputCount));
    }
    getGlobalOutputCount() {
        return fromVarint(this.getGlobal(psbtGlobal.OUTPUT_COUNT));
    }
    setGlobalTxModifiable(byte) {
        this.setGlobal(psbtGlobal.TX_MODIFIABLE, byte);
    }
    getGlobalTxModifiable() {
        return this.getGlobalOptional(psbtGlobal.TX_MODIFIABLE);
    }
    setGlobalPsbtVersion(psbtVersion) {
        this.setGlobal(psbtGlobal.VERSION, uint32LE(psbtVersion));
    }
    getGlobalPsbtVersion() {
        return this.getGlobal(psbtGlobal.VERSION).readUInt32LE(0);
    }
    setInputNonWitnessUtxo(inputIndex, transaction) {
        this.setInput(inputIndex, psbtIn.NON_WITNESS_UTXO, b(), transaction);
    }
    getInputNonWitnessUtxo(inputIndex) {
        return this.getInputOptional(inputIndex, psbtIn.NON_WITNESS_UTXO, b());
    }
    setInputWitnessUtxo(inputIndex, amount, scriptPubKey) {
        const buf = new BufferWriter();
        buf.writeSlice(amount);
        buf.writeVarSlice(scriptPubKey);
        this.setInput(inputIndex, psbtIn.WITNESS_UTXO, b(), buf.buffer());
    }
    getInputWitnessUtxo(inputIndex) {
        const utxo = this.getInputOptional(inputIndex, psbtIn.WITNESS_UTXO, b());
        if (!utxo)
            return undefined;
        const buf = new BufferReader(utxo);
        return { amount: buf.readSlice(8), scriptPubKey: buf.readVarSlice() };
    }
    setInputPartialSig(inputIndex, pubkey, signature) {
        this.setInput(inputIndex, psbtIn.PARTIAL_SIG, pubkey, signature);
    }
    getInputPartialSig(inputIndex, pubkey) {
        return this.getInputOptional(inputIndex, psbtIn.PARTIAL_SIG, pubkey);
    }
    setInputSighashType(inputIndex, sigHashtype) {
        this.setInput(inputIndex, psbtIn.SIGHASH_TYPE, b(), uint32LE(sigHashtype));
    }
    getInputSighashType(inputIndex) {
        const result = this.getInputOptional(inputIndex, psbtIn.SIGHASH_TYPE, b());
        if (!result)
            return undefined;
        return result.readUInt32LE(0);
    }
    setInputRedeemScript(inputIndex, redeemScript) {
        this.setInput(inputIndex, psbtIn.REDEEM_SCRIPT, b(), redeemScript);
    }
    getInputRedeemScript(inputIndex) {
        return this.getInputOptional(inputIndex, psbtIn.REDEEM_SCRIPT, b());
    }
    setInputBip32Derivation(inputIndex, pubkey, masterFingerprint, path) {
        if (pubkey.length != 33)
            throw new Error("Invalid pubkey length: " + pubkey.length);
        this.setInput(inputIndex, psbtIn.BIP32_DERIVATION, pubkey, this.encodeBip32Derivation(masterFingerprint, path));
    }
    getInputBip32Derivation(inputIndex, pubkey) {
        const buf = this.getInputOptional(inputIndex, psbtIn.BIP32_DERIVATION, pubkey);
        if (!buf)
            return undefined;
        return this.decodeBip32Derivation(buf);
    }
    setInputFinalScriptsig(inputIndex, scriptSig) {
        this.setInput(inputIndex, psbtIn.FINAL_SCRIPTSIG, b(), scriptSig);
    }
    getInputFinalScriptsig(inputIndex) {
        return this.getInputOptional(inputIndex, psbtIn.FINAL_SCRIPTSIG, b());
    }
    setInputFinalScriptwitness(inputIndex, scriptWitness) {
        this.setInput(inputIndex, psbtIn.FINAL_SCRIPTWITNESS, b(), scriptWitness);
    }
    getInputFinalScriptwitness(inputIndex) {
        return this.getInput(inputIndex, psbtIn.FINAL_SCRIPTWITNESS, b());
    }
    setInputPreviousTxId(inputIndex, txid) {
        this.setInput(inputIndex, psbtIn.PREVIOUS_TXID, b(), txid);
    }
    getInputPreviousTxid(inputIndex) {
        return this.getInput(inputIndex, psbtIn.PREVIOUS_TXID, b());
    }
    setInputOutputIndex(inputIndex, outputIndex) {
        this.setInput(inputIndex, psbtIn.OUTPUT_INDEX, b(), uint32LE(outputIndex));
    }
    getInputOutputIndex(inputIndex) {
        return this.getInput(inputIndex, psbtIn.OUTPUT_INDEX, b()).readUInt32LE(0);
    }
    setInputSequence(inputIndex, sequence) {
        this.setInput(inputIndex, psbtIn.SEQUENCE, b(), uint32LE(sequence));
    }
    getInputSequence(inputIndex) {
        var _a, _b;
        return (_b = (_a = this.getInputOptional(inputIndex, psbtIn.SEQUENCE, b())) === null || _a === void 0 ? void 0 : _a.readUInt32LE(0)) !== null && _b !== void 0 ? _b : 0xffffffff;
    }
    setInputTapKeySig(inputIndex, sig) {
        this.setInput(inputIndex, psbtIn.TAP_KEY_SIG, b(), sig);
    }
    getInputTapKeySig(inputIndex) {
        return this.getInputOptional(inputIndex, psbtIn.TAP_KEY_SIG, b());
    }
    setInputTapBip32Derivation(inputIndex, pubkey, hashes, masterFingerprint, path) {
        if (pubkey.length != 32)
            throw new Error("Invalid pubkey length: " + pubkey.length);
        const buf = this.encodeTapBip32Derivation(hashes, masterFingerprint, path);
        this.setInput(inputIndex, psbtIn.TAP_BIP32_DERIVATION, pubkey, buf);
    }
    getInputTapBip32Derivation(inputIndex, pubkey) {
        const buf = this.getInput(inputIndex, psbtIn.TAP_BIP32_DERIVATION, pubkey);
        return this.decodeTapBip32Derivation(buf);
    }
    getInputKeyDatas(inputIndex, keyType) {
        return this.getKeyDatas(this.inputMaps[inputIndex], keyType);
    }
    setOutputRedeemScript(outputIndex, redeemScript) {
        this.setOutput(outputIndex, psbtOut.REDEEM_SCRIPT, b(), redeemScript);
    }
    getOutputRedeemScript(outputIndex) {
        return this.getOutput(outputIndex, psbtOut.REDEEM_SCRIPT, b());
    }
    setOutputBip32Derivation(outputIndex, pubkey, masterFingerprint, path) {
        this.setOutput(outputIndex, psbtOut.BIP_32_DERIVATION, pubkey, this.encodeBip32Derivation(masterFingerprint, path));
    }
    getOutputBip32Derivation(outputIndex, pubkey) {
        const buf = this.getOutput(outputIndex, psbtOut.BIP_32_DERIVATION, pubkey);
        return this.decodeBip32Derivation(buf);
    }
    setOutputAmount(outputIndex, amount) {
        this.setOutput(outputIndex, psbtOut.AMOUNT, b(), uint64LE(amount));
    }
    getOutputAmount(outputIndex) {
        const buf = this.getOutput(outputIndex, psbtOut.AMOUNT, b());
        return unsafeFrom64bitLE(buf);
    }
    setOutputScript(outputIndex, scriptPubKey) {
        this.setOutput(outputIndex, psbtOut.SCRIPT, b(), scriptPubKey);
    }
    getOutputScript(outputIndex) {
        return this.getOutput(outputIndex, psbtOut.SCRIPT, b());
    }
    setOutputTapBip32Derivation(outputIndex, pubkey, hashes, fingerprint, path) {
        const buf = this.encodeTapBip32Derivation(hashes, fingerprint, path);
        this.setOutput(outputIndex, psbtOut.TAP_BIP32_DERIVATION, pubkey, buf);
    }
    getOutputTapBip32Derivation(outputIndex, pubkey) {
        const buf = this.getOutput(outputIndex, psbtOut.TAP_BIP32_DERIVATION, pubkey);
        return this.decodeTapBip32Derivation(buf);
    }
    deleteInputEntries(inputIndex, keyTypes) {
        const map = this.inputMaps[inputIndex];
        map.forEach((_v, k, m) => {
            if (this.isKeyType(k, keyTypes)) {
                m.delete(k);
            }
        });
    }
    copy(to) {
        this.copyMap(this.globalMap, to.globalMap);
        this.copyMaps(this.inputMaps, to.inputMaps);
        this.copyMaps(this.outputMaps, to.outputMaps);
    }
    copyMaps(from, to) {
        from.forEach((m, index) => {
            const to_index = new Map();
            this.copyMap(m, to_index);
            to[index] = to_index;
        });
    }
    copyMap(from, to) {
        from.forEach((v, k) => to.set(k, buffer.Buffer.from(v)));
    }
    serialize() {
        const buf = new BufferWriter();
        buf.writeSlice(buffer.Buffer.from([0x70, 0x73, 0x62, 0x74, 0xff]));
        serializeMap(buf, this.globalMap);
        this.inputMaps.forEach(map => {
            serializeMap(buf, map);
        });
        this.outputMaps.forEach(map => {
            serializeMap(buf, map);
        });
        return buf.buffer();
    }
    deserialize(psbt) {
        const buf = new BufferReader(psbt);
        if (!buf.readSlice(5).equals(PSBT_MAGIC_BYTES)) {
            throw new Error("Invalid magic bytes");
        }
        while (this.readKeyPair(this.globalMap, buf))
            ;
        for (let i = 0; i < this.getGlobalInputCount(); i++) {
            this.inputMaps[i] = new Map();
            while (this.readKeyPair(this.inputMaps[i], buf))
                ;
        }
        for (let i = 0; i < this.getGlobalOutputCount(); i++) {
            this.outputMaps[i] = new Map();
            while (this.readKeyPair(this.outputMaps[i], buf))
                ;
        }
    }
    readKeyPair(map, buf) {
        const keyLen = buf.readVarInt();
        if (keyLen == 0) {
            return false;
        }
        const keyType = buf.readUInt8();
        const keyData = buf.readSlice(keyLen - 1);
        const value = buf.readVarSlice();
        set(map, keyType, keyData, value);
        return true;
    }
    getKeyDatas(map, keyType) {
        const result = [];
        map.forEach((_v, k) => {
            if (this.isKeyType(k, [keyType])) {
                result.push(buffer.Buffer.from(k.substring(2), "hex"));
            }
        });
        return result;
    }
    isKeyType(hexKey, keyTypes) {
        const keyType = buffer.Buffer.from(hexKey.substring(0, 2), "hex").readUInt8(0);
        return keyTypes.some(k => k == keyType);
    }
    setGlobal(keyType, value) {
        const key = new Key(keyType, buffer.Buffer.from([]));
        this.globalMap.set(key.toString(), value);
    }
    getGlobal(keyType) {
        return get(this.globalMap, keyType, b(), false);
    }
    getGlobalOptional(keyType) {
        return get(this.globalMap, keyType, b(), true);
    }
    setInput(index, keyType, keyData, value) {
        set(this.getMap(index, this.inputMaps), keyType, keyData, value);
    }
    getInput(index, keyType, keyData) {
        return get(this.inputMaps[index], keyType, keyData, false);
    }
    getInputOptional(index, keyType, keyData) {
        return get(this.inputMaps[index], keyType, keyData, true);
    }
    setOutput(index, keyType, keyData, value) {
        set(this.getMap(index, this.outputMaps), keyType, keyData, value);
    }
    getOutput(index, keyType, keyData) {
        return get(this.outputMaps[index], keyType, keyData, false);
    }
    getMap(index, maps) {
        if (maps[index]) {
            return maps[index];
        }
        return (maps[index] = new Map());
    }
    encodeBip32Derivation(masterFingerprint, path) {
        const buf = new BufferWriter();
        this.writeBip32Derivation(buf, masterFingerprint, path);
        return buf.buffer();
    }
    decodeBip32Derivation(buffer) {
        const buf = new BufferReader(buffer);
        return this.readBip32Derivation(buf);
    }
    writeBip32Derivation(buf, masterFingerprint, path) {
        buf.writeSlice(masterFingerprint);
        path.forEach(element => {
            buf.writeUInt32(element);
        });
    }
    readBip32Derivation(buf) {
        const masterFingerprint = buf.readSlice(4);
        const path = [];
        while (buf.offset < buf.buffer.length) {
            path.push(buf.readUInt32());
        }
        return { masterFingerprint, path };
    }
    encodeTapBip32Derivation(hashes, masterFingerprint, path) {
        const buf = new BufferWriter();
        buf.writeVarInt(hashes.length);
        hashes.forEach(h => {
            buf.writeSlice(h);
        });
        this.writeBip32Derivation(buf, masterFingerprint, path);
        return buf.buffer();
    }
    decodeTapBip32Derivation(buffer) {
        const buf = new BufferReader(buffer);
        const hashCount = buf.readVarInt();
        const hashes = [];
        for (let i = 0; i < hashCount; i++) {
            hashes.push(buf.readSlice(32));
        }
        const deriv = this.readBip32Derivation(buf);
        return Object.assign({ hashes }, deriv);
    }
}
function get(map, keyType, keyData, acceptUndefined) {
    if (!map)
        throw Error("No such map");
    const key = new Key(keyType, keyData);
    const value = map.get(key.toString());
    if (!value) {
        if (acceptUndefined) {
            return undefined;
        }
        throw new NoSuchEntry(key.toString());
    }
    // Make sure to return a copy, to protect the underlying data.
    return buffer.Buffer.from(value);
}
class Key {
    constructor(keyType, keyData) {
        this.keyType = keyType;
        this.keyData = keyData;
    }
    toString() {
        const buf = new BufferWriter();
        this.toBuffer(buf);
        return buf.buffer().toString("hex");
    }
    serialize(buf) {
        buf.writeVarInt(1 + this.keyData.length);
        this.toBuffer(buf);
    }
    toBuffer(buf) {
        buf.writeUInt8(this.keyType);
        buf.writeSlice(this.keyData);
    }
}
class KeyPair {
    constructor(key, value) {
        this.key = key;
        this.value = value;
    }
    serialize(buf) {
        this.key.serialize(buf);
        buf.writeVarSlice(this.value);
    }
}
function createKey(buf) {
    return new Key(buf.readUInt8(0), buf.slice(1));
}
function serializeMap(buf, map) {
    for (const k of map.keys()) {
        const value = map.get(k);
        const keyPair = new KeyPair(createKey(buffer.Buffer.from(k, "hex")), value);
        keyPair.serialize(buf);
    }
    buf.writeUInt8(0);
}
function b() {
    return buffer.Buffer.from([]);
}
function set(map, keyType, keyData, value) {
    const key = new Key(keyType, keyData);
    map.set(key.toString(), value);
}
function uint32LE(n) {
    const b = buffer.Buffer.alloc(4);
    b.writeUInt32LE(n, 0);
    return b;
}
function uint64LE(n) {
    return unsafeTo64bitLE(n);
}
function varint(n) {
    const b = new BufferWriter();
    b.writeVarInt(n);
    return b.buffer();
}
function fromVarint(buf) {
    return new BufferReader(buf).readVarInt();
}

/**
 * This roughly implements the "input finalizer" role of BIP370 (PSBTv2
 * https://github.com/bitcoin/bips/blob/master/bip-0370.mediawiki). However
 * the role is documented in BIP174 (PSBTv0
 * https://github.com/bitcoin/bips/blob/master/bip-0174.mediawiki).
 *
 * Verify that all inputs have a signature, and set inputFinalScriptwitness
 * and/or inputFinalScriptSig depending on the type of the spent outputs. Clean
 * fields that aren't useful anymore, partial signatures, redeem script and
 * derivation paths.
 *
 * @param psbt The psbt with all signatures added as partial sigs, either
 * through PSBT_IN_PARTIAL_SIG or PSBT_IN_TAP_KEY_SIG
 */
function finalize(psbt) {
    // First check that each input has a signature
    const inputCount = psbt.getGlobalInputCount();
    for (let i = 0; i < inputCount; i++) {
        const legacyPubkeys = psbt.getInputKeyDatas(i, psbtIn.PARTIAL_SIG);
        const taprootSig = psbt.getInputTapKeySig(i);
        if (legacyPubkeys.length == 0 && !taprootSig) {
            throw Error(`No signature for input ${i} present`);
        }
        if (legacyPubkeys.length > 0) {
            if (legacyPubkeys.length > 1) {
                throw Error(`Expected exactly one signature, got ${legacyPubkeys.length}`);
            }
            if (taprootSig) {
                throw Error("Both taproot and non-taproot signatures present.");
            }
            const isSegwitV0 = !!psbt.getInputWitnessUtxo(i);
            const redeemScript = psbt.getInputRedeemScript(i);
            const isWrappedSegwit = !!redeemScript;
            const signature = psbt.getInputPartialSig(i, legacyPubkeys[0]);
            if (!signature)
                throw new Error("Expected partial signature for input " + i);
            if (isSegwitV0) {
                const witnessBuf = new BufferWriter();
                witnessBuf.writeVarInt(2);
                witnessBuf.writeVarInt(signature.length);
                witnessBuf.writeSlice(signature);
                witnessBuf.writeVarInt(legacyPubkeys[0].length);
                witnessBuf.writeSlice(legacyPubkeys[0]);
                psbt.setInputFinalScriptwitness(i, witnessBuf.buffer());
                if (isWrappedSegwit) {
                    if (!redeemScript || redeemScript.length == 0) {
                        throw new Error("Expected non-empty redeemscript. Can't finalize intput " + i);
                    }
                    const scriptSigBuf = new BufferWriter();
                    // Push redeemScript length
                    scriptSigBuf.writeUInt8(redeemScript.length);
                    scriptSigBuf.writeSlice(redeemScript);
                    psbt.setInputFinalScriptsig(i, scriptSigBuf.buffer());
                }
            }
            else {
                // Legacy input
                const scriptSig = new BufferWriter();
                writePush(scriptSig, signature);
                writePush(scriptSig, legacyPubkeys[0]);
                psbt.setInputFinalScriptsig(i, scriptSig.buffer());
            }
        }
        else {
            // Taproot input
            const signature = psbt.getInputTapKeySig(i);
            if (!signature) {
                throw Error("No taproot signature found");
            }
            if (signature.length != 64 && signature.length != 65) {
                throw Error("Unexpected length of schnorr signature.");
            }
            const witnessBuf = new BufferWriter();
            witnessBuf.writeVarInt(1);
            witnessBuf.writeVarSlice(signature);
            psbt.setInputFinalScriptwitness(i, witnessBuf.buffer());
        }
        clearFinalizedInput(psbt, i);
    }
}
/**
 * Deletes fields that are no longer neccesary from the psbt.
 *
 * Note, the spec doesn't say anything about removing ouput fields
 * like PSBT_OUT_BIP32_DERIVATION_PATH and others, so we keep them
 * without actually knowing why. I think we should remove them too.
 */
function clearFinalizedInput(psbt, inputIndex) {
    const keyTypes = [
        psbtIn.BIP32_DERIVATION,
        psbtIn.PARTIAL_SIG,
        psbtIn.TAP_BIP32_DERIVATION,
        psbtIn.TAP_KEY_SIG,
    ];
    const witnessUtxoAvailable = !!psbt.getInputWitnessUtxo(inputIndex);
    const nonWitnessUtxoAvailable = !!psbt.getInputNonWitnessUtxo(inputIndex);
    if (witnessUtxoAvailable && nonWitnessUtxoAvailable) {
        // Remove NON_WITNESS_UTXO for segwit v0 as it's only needed while signing.
        // Segwit v1 doesn't have NON_WITNESS_UTXO set.
        // See https://github.com/bitcoin/bips/blob/master/bip-0174.mediawiki#cite_note-7
        keyTypes.push(psbtIn.NON_WITNESS_UTXO);
    }
    psbt.deleteInputEntries(inputIndex, keyTypes);
}
/**
 * Writes a script push operation to buf, which looks different
 * depending on the size of the data. See
 * https://en.bitcoin.it/wiki/Script#Constants
 *
 * @param buf the BufferWriter to write to
 * @param data the Buffer to be pushed.
 */
function writePush(buf, data) {
    if (data.length <= 75) {
        buf.writeUInt8(data.length);
    }
    else if (data.length <= 256) {
        buf.writeUInt8(76);
        buf.writeUInt8(data.length);
    }
    else if (data.length <= 256 * 256) {
        buf.writeUInt8(77);
        const b = buffer.Buffer.alloc(2);
        b.writeUInt16LE(data.length, 0);
        buf.writeSlice(b);
    }
    buf.writeSlice(data);
}

function getVarint(data, offset) {
    if (data[offset] < 0xfd) {
        return [data[offset], 1];
    }
    if (data[offset] === 0xfd) {
        return [(data[offset + 2] << 8) + data[offset + 1], 3];
    }
    if (data[offset] === 0xfe) {
        return [
            (data[offset + 4] << 24) +
                (data[offset + 3] << 16) +
                (data[offset + 2] << 8) +
                data[offset + 1],
            5,
        ];
    }
    throw new Error("getVarint called with unexpected parameters");
}
function createVarint(value) {
    if (value < 0xfd) {
        const buffer$1 = buffer.Buffer.alloc(1);
        buffer$1[0] = value;
        return buffer$1;
    }
    if (value <= 0xffff) {
        const buffer$1 = buffer.Buffer.alloc(3);
        buffer$1[0] = 0xfd;
        buffer$1[1] = value & 0xff;
        buffer$1[2] = (value >> 8) & 0xff;
        return buffer$1;
    }
    const buffer$1 = buffer.Buffer.alloc(5);
    buffer$1[0] = 0xfe;
    buffer$1[1] = value & 0xff;
    buffer$1[2] = (value >> 8) & 0xff;
    buffer$1[3] = (value >> 16) & 0xff;
    buffer$1[4] = (value >> 24) & 0xff;
    return buffer$1;
}

/**
  @example
const tx1 = btc.splitTransaction("01000000014ea60aeac5252c14291d428915bd7ccd1bfc4af009f4d4dc57ae597ed0420b71010000008a47304402201f36a12c240dbf9e566bc04321050b1984cd6eaf6caee8f02bb0bfec08e3354b022012ee2aeadcbbfd1e92959f57c15c1c6debb757b798451b104665aa3010569b49014104090b15bde569386734abf2a2b99f9ca6a50656627e77de663ca7325702769986cf26cc9dd7fdea0af432c8e2becc867c932e1b9dd742f2a108997c2252e2bdebffffffff0281b72e00000000001976a91472a5d75c8d2d0565b656a5232703b167d50d5a2b88aca0860100000000001976a9144533f5fb9b4817f713c48f0bfe96b9f50c476c9b88ac00000000");
const outputScript = btc.serializeTransactionOutputs(tx1).toString('hex');
  */
function serializeTransactionOutputs({ outputs }) {
    let outputBuffer = buffer.Buffer.alloc(0);
    if (typeof outputs !== "undefined") {
        outputBuffer = buffer.Buffer.concat([outputBuffer, createVarint(outputs.length)]);
        outputs.forEach(output => {
            outputBuffer = buffer.Buffer.concat([
                outputBuffer,
                output.amount,
                createVarint(output.script.length),
                output.script,
            ]);
        });
    }
    return outputBuffer;
}
function serializeTransaction(transaction, skipWitness, timestamp, additionals = []) {
    const isDecred = additionals.includes("decred");
    const isZcash = additionals.includes("zcash");
    const isBech32 = additionals.includes("bech32");
    let inputBuffer = buffer.Buffer.alloc(0);
    const useWitness = typeof transaction["witness"] != "undefined" && !skipWitness;
    transaction.inputs.forEach(input => {
        inputBuffer =
            isDecred || isBech32
                ? buffer.Buffer.concat([
                    inputBuffer,
                    input.prevout,
                    buffer.Buffer.from([0x00]),
                    input.sequence,
                ])
                : buffer.Buffer.concat([
                    inputBuffer,
                    input.prevout,
                    createVarint(input.script.length),
                    input.script,
                    input.sequence,
                ]);
    });
    let outputBuffer = serializeTransactionOutputs(transaction);
    if (typeof transaction.outputs !== "undefined" && typeof transaction.locktime !== "undefined") {
        outputBuffer = buffer.Buffer.concat([
            outputBuffer,
            (useWitness && transaction.witness) || buffer.Buffer.alloc(0),
            transaction.locktime,
            transaction.nExpiryHeight || buffer.Buffer.alloc(0),
            transaction.extraData || buffer.Buffer.alloc(0),
        ]);
    }
    // from to https://zips.z.cash/zip-0225, zcash is different with other coins, the lock_time and nExpiryHeight fields are before the inputs and outputs
    if (isZcash) {
        return buffer.Buffer.concat([
            transaction.version,
            transaction.nVersionGroupId || buffer.Buffer.alloc(0),
            buffer.Buffer.from([0xb4, 0xd0, 0xd6, 0xc2]),
            transaction.locktime || buffer.Buffer.from([0x00, 0x00, 0x00, 0x00]),
            transaction.nExpiryHeight || buffer.Buffer.from([0x00, 0x00, 0x00, 0x00]),
            useWitness ? buffer.Buffer.from("0001", "hex") : buffer.Buffer.alloc(0),
            createVarint(transaction.inputs.length),
            inputBuffer,
            outputBuffer,
        ]);
    }
    return buffer.Buffer.concat([
        transaction.version,
        timestamp ? timestamp : buffer.Buffer.alloc(0),
        transaction.nVersionGroupId || buffer.Buffer.alloc(0),
        useWitness ? buffer.Buffer.from("0001", "hex") : buffer.Buffer.alloc(0),
        createVarint(transaction.inputs.length),
        inputBuffer,
        outputBuffer,
    ]);
}

var __awaiter$b = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/**
 * This class implements the same interface as BtcOld (formerly
 * named Btc), but interacts with Bitcoin hardware app version 2+
 * which uses a totally new APDU protocol. This new
 * protocol is documented at
 * https://github.com/LedgerHQ/app-bitcoin-new/blob/master/doc/bitcoin.md
 *
 * Since the interface must remain compatible with BtcOld, the methods
 * of this class are quite clunky, because it needs to adapt legacy
 * input data into the PSBT process. In the future, a new interface should
 * be developed that exposes PSBT to the outer world, which would render
 * a much cleaner implementation.
 */
class BtcNew {
    constructor(client) {
        this.client = client;
    }
    /**
     * This is a new method that allow users to get an xpub at a standard path.
     * Standard paths are described at
     * https://github.com/LedgerHQ/app-bitcoin-new/blob/master/doc/bitcoin.md#description
     *
     * This boils down to paths (N=0 for Bitcoin, N=1 for Testnet):
     * M/44'/N'/x'/**
     * M/48'/N'/x'/y'/**
     * M/49'/N'/x'/**
     * M/84'/N'/x'/**
     * M/86'/N'/x'/**
     *
     * The method was added because of added security in the hardware app v2+. The
     * new hardware app will allow export of any xpub up to and including the
     * deepest hardened key of standard derivation paths, whereas the old app
     * would allow export of any key.
     *
     * This caused an issue for callers of this class, who only had
     * getWalletPublicKey() to call which means they have to constuct xpub
     * themselves:
     *
     * Suppose a user of this class wants to create an account xpub on a standard
     * path, M/44'/0'/Z'. The user must get the parent key fingerprint (see BIP32)
     * by requesting the parent key M/44'/0'. The new app won't allow that, because
     * it only allows exporting deepest level hardened path. So the options are to
     * allow requesting M/44'/0' from the app, or to add a new function
     * "getWalletXpub".
     *
     * We opted for adding a new function, which can greatly simplify client code.
     */
    getWalletXpub({ path, xpubVersion, }) {
        return __awaiter$b(this, void 0, void 0, function* () {
            const pathElements = pathStringToArray(path);
            const xpub = yield this.client.getExtendedPubkey(false, pathElements);
            const xpubComponents = getXpubComponents(xpub);
            if (xpubComponents.version != xpubVersion) {
                throw new Error(`Expected xpub version ${xpubVersion} doesn't match the xpub version from the device ${xpubComponents.version}`);
            }
            return xpub;
        });
    }
    /**
     * This method returns a public key, a bitcoin address, and and a chaincode
     * for a specific derivation path.
     *
     * Limitation: If the path is not a leaf node of a standard path, the address
     * will be the empty string "", see this.getWalletAddress() for details.
     */
    getWalletPublicKey(path, opts) {
        var _a, _b;
        return __awaiter$b(this, void 0, void 0, function* () {
            if (!isPathNormal(path)) {
                throw Error(`non-standard path: ${path}`);
            }
            const pathElements = pathStringToArray(path);
            const xpub = yield this.client.getExtendedPubkey(false, pathElements);
            const display = (_a = opts === null || opts === void 0 ? void 0 : opts.verify) !== null && _a !== void 0 ? _a : false;
            const address = yield this.getWalletAddress(pathElements, descrTemplFrom((_b = opts === null || opts === void 0 ? void 0 : opts.format) !== null && _b !== void 0 ? _b : "legacy"), display);
            const components = getXpubComponents(xpub);
            const uncompressedPubkey = buffer.Buffer.from(js.pointCompress(components.pubkey, false));
            return {
                publicKey: uncompressedPubkey.toString("hex"),
                bitcoinAddress: address,
                chainCode: components.chaincode.toString("hex"),
            };
        });
    }
    /**
     * Get an address for the specified path.
     *
     * If display is true, we must get the address from the device, which would require
     * us to determine WalletPolicy. This requires two *extra* queries to the device, one
     * for the account xpub and one for master key fingerprint.
     *
     * If display is false we *could* generate the address ourselves, but chose to
     * get it from the device to save development time. However, it shouldn't take
     * too much time to implement local address generation.
     *
     * Moreover, if the path is not for a leaf, ie accountPath+/X/Y, there is no
     * way to get the address from the device. In this case we have to create it
     * ourselves, but we don't at this time, and instead return an empty ("") address.
     */
    getWalletAddress(pathElements, descrTempl, display) {
        return __awaiter$b(this, void 0, void 0, function* () {
            const accountPath = hardenedPathOf(pathElements);
            if (accountPath.length + 2 != pathElements.length) {
                return "";
            }
            const accountXpub = yield this.client.getExtendedPubkey(false, accountPath);
            const masterFingerprint = yield this.client.getMasterFingerprint();
            const policy = new WalletPolicy(descrTempl, createKey$1(masterFingerprint, accountPath, accountXpub));
            const changeAndIndex = pathElements.slice(-2, pathElements.length);
            return this.client.getWalletAddress(policy, buffer.Buffer.alloc(32, 0), changeAndIndex[0], changeAndIndex[1], display);
        });
    }
    /**
     * Build and sign a transaction. See Btc.createPaymentTransaction for
     * details on how to use this method.
     *
     * This method will convert the legacy arguments, CreateTransactionArg, into
     * a psbt which is finally signed and finalized, and the extracted fully signed
     * transaction is returned.
     */
    createPaymentTransaction(arg) {
        return __awaiter$b(this, void 0, void 0, function* () {
            const inputCount = arg.inputs.length;
            if (inputCount == 0) {
                throw Error("No inputs");
            }
            const psbt = new PsbtV2();
            // The master fingerprint is needed when adding BIP32 derivation paths on
            // the psbt.
            const masterFp = yield this.client.getMasterFingerprint();
            const accountType = accountTypeFromArg(arg, psbt, masterFp);
            if (arg.lockTime != undefined) {
                // The signer will assume locktime 0 if unset
                psbt.setGlobalFallbackLocktime(arg.lockTime);
            }
            psbt.setGlobalInputCount(inputCount);
            psbt.setGlobalPsbtVersion(2);
            psbt.setGlobalTxVersion(2);
            let notifyCount = 0;
            const progress = () => {
                if (!arg.onDeviceStreaming)
                    return;
                arg.onDeviceStreaming({
                    total: 2 * inputCount,
                    index: notifyCount,
                    progress: ++notifyCount / (2 * inputCount),
                });
            };
            let accountXpub = "";
            let accountPath = [];
            for (let i = 0; i < inputCount; i++) {
                progress();
                const pathElems = pathStringToArray(arg.associatedKeysets[i]);
                if (accountXpub == "") {
                    // We assume all inputs belong to the same account so we set
                    // the account xpub and path based on the first input.
                    accountPath = pathElems.slice(0, -2);
                    accountXpub = yield this.client.getExtendedPubkey(false, accountPath);
                }
                yield this.setInput(psbt, i, arg.inputs[i], pathElems, accountType, masterFp, arg.sigHashType);
            }
            const outputsConcat = buffer.Buffer.from(arg.outputScriptHex, "hex");
            const outputsBufferReader = new BufferReader(outputsConcat);
            const outputCount = outputsBufferReader.readVarInt();
            psbt.setGlobalOutputCount(outputCount);
            const changeData = yield this.outputScriptAt(accountPath, accountType, arg.changePath);
            // If the caller supplied a changePath, we must make sure there actually is
            // a change output. If no change output found, we'll throw an error.
            let changeFound = !changeData;
            for (let i = 0; i < outputCount; i++) {
                const amount = Number(outputsBufferReader.readUInt64());
                const outputScript = outputsBufferReader.readVarSlice();
                psbt.setOutputAmount(i, amount);
                psbt.setOutputScript(i, outputScript);
                // We won't know if we're paying to ourselves, because there's no
                // information in arg to support multiple "change paths". One exception is
                // if there are multiple outputs to the change address.
                const isChange = changeData && outputScript.equals(changeData === null || changeData === void 0 ? void 0 : changeData.cond.scriptPubKey);
                if (isChange) {
                    changeFound = true;
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    const changePath = pathStringToArray(arg.changePath);
                    const pubkey = changeData.pubkey;
                    accountType.setOwnOutput(i, changeData.cond, [pubkey], [changePath]);
                }
            }
            if (!changeFound) {
                throw new Error("Change script not found among outputs! " + (changeData === null || changeData === void 0 ? void 0 : changeData.cond.scriptPubKey.toString("hex")));
            }
            const key = createKey$1(masterFp, accountPath, accountXpub);
            const p = new WalletPolicy(accountType.getDescriptorTemplate(), key);
            // This is cheating, because it's not actually requested on the
            // device yet, but it will be, soonish.
            if (arg.onDeviceSignatureRequested)
                arg.onDeviceSignatureRequested();
            let firstSigned = false;
            // This callback will be called once for each signature yielded.
            const progressCallback = () => {
                if (!firstSigned) {
                    firstSigned = true;
                    arg.onDeviceSignatureGranted && arg.onDeviceSignatureGranted();
                }
                progress();
            };
            yield this.signPsbt(psbt, p, progressCallback);
            finalize(psbt);
            const serializedTx = extract(psbt);
            return serializedTx.toString("hex");
        });
    }
    /**
     * Signs an arbitrary hex-formatted message with the private key at
     * the provided derivation path according to the Bitcoin Signature format
     * and returns v, r, s.
     */
    signMessage({ path, messageHex }) {
        return __awaiter$b(this, void 0, void 0, function* () {
            const pathElements = pathStringToArray(path);
            const message = buffer.Buffer.from(messageHex, "hex");
            const sig = yield this.client.signMessage(message, pathElements);
            const buf = buffer.Buffer.from(sig, "base64");
            const v = buf.readUInt8() - 27 - 4;
            const r = buf.slice(1, 33).toString("hex");
            const s = buf.slice(33, 65).toString("hex");
            return {
                v,
                r,
                s,
            };
        });
    }
    /**
     * Calculates an output script along with public key and possible redeemScript
     * from a path and accountType. The accountPath must be a prefix of path.
     *
     * @returns an object with output script (property "script"), redeemScript (if
     * wrapped p2wpkh), and pubkey at provided path. The values of these three
     * properties depend on the accountType used.
     */
    outputScriptAt(accountPath, accountType, path) {
        return __awaiter$b(this, void 0, void 0, function* () {
            if (!path)
                return undefined;
            const pathElems = pathStringToArray(path);
            // Make sure path is in our account, otherwise something fishy is probably
            // going on.
            for (let i = 0; i < accountPath.length; i++) {
                if (accountPath[i] != pathElems[i]) {
                    throw new Error(`Path ${path} not in account ${pathArrayToString(accountPath)}`);
                }
            }
            const xpub = yield this.client.getExtendedPubkey(false, pathElems);
            const pubkey = pubkeyFromXpub(xpub);
            const cond = accountType.spendingCondition([pubkey]);
            return { cond, pubkey };
        });
    }
    /**
     * Adds relevant data about an input to the psbt. This includes sequence,
     * previous txid, output index, spent UTXO, redeem script for wrapped p2wpkh,
     * public key and its derivation path.
     */
    setInput(psbt, i, input, pathElements, accountType, masterFP, sigHashType) {
        return __awaiter$b(this, void 0, void 0, function* () {
            const inputTx = input[0];
            const spentOutputIndex = input[1];
            // redeemScript will be null for wrapped p2wpkh, we need to create it
            // ourselves. But if set, it should be used.
            const redeemScript = input[2] ? buffer.Buffer.from(input[2], "hex") : undefined;
            const sequence = input[3];
            if (sequence != undefined) {
                psbt.setInputSequence(i, sequence);
            }
            if (sigHashType != undefined) {
                psbt.setInputSighashType(i, sigHashType);
            }
            const inputTxBuffer = serializeTransaction(inputTx, true);
            const inputTxid = crypto_1.hash256(inputTxBuffer);
            const xpubBase58 = yield this.client.getExtendedPubkey(false, pathElements);
            const pubkey = pubkeyFromXpub(xpubBase58);
            if (!inputTx.outputs)
                throw Error("Missing outputs array in transaction to sign");
            const spentTxOutput = inputTx.outputs[spentOutputIndex];
            const spendCondition = {
                scriptPubKey: spentTxOutput.script,
                redeemScript: redeemScript,
            };
            const spentOutput = { cond: spendCondition, amount: spentTxOutput.amount };
            accountType.setInput(i, inputTxBuffer, spentOutput, [pubkey], [pathElements]);
            psbt.setInputPreviousTxId(i, inputTxid);
            psbt.setInputOutputIndex(i, spentOutputIndex);
        });
    }
    /**
     * This implements the "Signer" role of the BIP370 transaction signing
     * process.
     *
     * It ssks the hardware device to sign the a psbt using the specified wallet
     * policy. This method assumes BIP32 derived keys are used for all inputs, see
     * comment in-line. The signatures returned from the hardware device is added
     * to the appropriate input fields of the PSBT.
     */
    signPsbt(psbt, walletPolicy, progressCallback) {
        return __awaiter$b(this, void 0, void 0, function* () {
            const sigs = yield this.client.signPsbt(psbt, walletPolicy, buffer.Buffer.alloc(32, 0), progressCallback);
            sigs.forEach((v, k) => {
                // Note: Looking at BIP32 derivation does not work in the generic case,
                // since some inputs might not have a BIP32-derived pubkey.
                const pubkeys = psbt.getInputKeyDatas(k, psbtIn.BIP32_DERIVATION);
                let pubkey;
                if (pubkeys.length != 1) {
                    // No legacy BIP32_DERIVATION, assume we're using taproot.
                    pubkey = psbt.getInputKeyDatas(k, psbtIn.TAP_BIP32_DERIVATION);
                    if (pubkey.length == 0) {
                        throw Error(`Missing pubkey derivation for input ${k}`);
                    }
                    psbt.setInputTapKeySig(k, v);
                }
                else {
                    pubkey = pubkeys[0];
                    psbt.setInputPartialSig(k, pubkey, v);
                }
            });
        });
    }
}
function descrTemplFrom(addressFormat) {
    if (addressFormat == "legacy")
        return "pkh(@0)";
    if (addressFormat == "p2sh")
        return "sh(wpkh(@0))";
    if (addressFormat == "bech32")
        return "wpkh(@0)";
    if (addressFormat == "bech32m")
        return "tr(@0)";
    throw new Error("Unsupported address format " + addressFormat);
}
function accountTypeFromArg(arg, psbt, masterFp) {
    if (arg.additionals.includes("bech32m"))
        return new p2tr(psbt, masterFp);
    if (arg.additionals.includes("bech32"))
        return new p2wpkh(psbt, masterFp);
    if (arg.segwit)
        return new p2wpkhWrapped(psbt, masterFp);
    return new p2pkh(psbt, masterFp);
}
/*
  The new protocol only allows standard path.
  Standard paths are (currently):
  M/44'/(1|0)'/X'
  M/49'/(1|0)'/X'
  M/84'/(1|0)'/X'
  M/86'/(1|0)'/X'
  M/48'/(1|0)'/X'/Y'
  followed by "", "(0|1)", or "(0|1)/b", where a and b are
  non-hardened. For example, the following paths are standard
  M/48'/1'/99'/7'
  M/86'/1'/99'/0
  M/48'/0'/99'/7'/1/17
  The following paths are non-standard
  M/48'/0'/99'           // Not deepest hardened path
  M/48'/0'/99'/7'/1/17/2 // Too many non-hardened derivation steps
  M/199'/0'/1'/0/88      // Not a known purpose 199
  M/86'/1'/99'/2         // Change path item must be 0 or 1
*/
function isPathNormal(path) {
    //path is not deepest hardened node of a standard path or deeper, use BtcOld
    const h = 0x80000000; //HARDENED from bip32
    const pathElems = pathStringToArray(path);
    const hard = (n) => n >= h;
    const soft = (n) => n === undefined || n < h;
    const change = (n) => n === undefined || n === 0 || n === 1;
    if (pathElems.length >= 3 &&
        pathElems.length <= 5 &&
        [44 + h, 49 + h, 84 + h, 86 + h].some(v => v == pathElems[0]) &&
        [0 + h, 1 + h].some(v => v == pathElems[1]) &&
        hard(pathElems[2]) &&
        change(pathElems[3]) &&
        soft(pathElems[4])) {
        return true;
    }
    if (pathElems.length >= 4 &&
        pathElems.length <= 6 &&
        48 + h == pathElems[0] &&
        [0 + h, 1 + h].some(v => v == pathElems[1]) &&
        hard(pathElems[2]) &&
        hard(pathElems[3]) &&
        change(pathElems[4]) &&
        soft(pathElems[5])) {
        return true;
    }
    return false;
}

var __awaiter$a = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const addressFormatMap = {
    legacy: 0,
    p2sh: 1,
    bech32: 2,
    cashaddr: 3,
};
function getWalletPublicKey(transport, options) {
    return __awaiter$a(this, void 0, void 0, function* () {
        const { path, verify, format } = Object.assign({ verify: false, format: "legacy" }, options);
        if (!(format in addressFormatMap)) {
            throw new Error("btc.getWalletPublicKey invalid format=" + format);
        }
        const buffer = bip32asBuffer(path);
        const p1 = verify ? 1 : 0;
        const p2 = addressFormatMap[format];
        const response = yield transport.send(0xe0, 0x40, p1, p2, buffer);
        const publicKeyLength = response[0];
        const addressLength = response[1 + publicKeyLength];
        const publicKey = response.slice(1, 1 + publicKeyLength).toString("hex");
        const bitcoinAddress = response
            .slice(1 + publicKeyLength + 1, 1 + publicKeyLength + 1 + addressLength)
            .toString("ascii");
        const chainCode = response
            .slice(1 + publicKeyLength + 1 + addressLength, 1 + publicKeyLength + 1 + addressLength + 32)
            .toString("hex");
        return {
            publicKey,
            bitcoinAddress,
            chainCode,
        };
    });
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
  if (process.env.NODE_ENV !== 'production') {
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

var invariant$1 = /*@__PURE__*/getDefaultExportFromCjs(browser);

var __awaiter$9 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
function getTrustedInputRaw(transport, transactionData, indexLookup) {
    return __awaiter$9(this, void 0, void 0, function* () {
        let data;
        let firstRound = false;
        if (typeof indexLookup === "number") {
            firstRound = true;
            const prefix = buffer.Buffer.alloc(4);
            prefix.writeUInt32BE(indexLookup, 0);
            data = buffer.Buffer.concat([prefix, transactionData], transactionData.length + 4);
        }
        else {
            data = transactionData;
        }
        const trustedInput = yield transport.send(0xe0, 0x42, firstRound ? 0x00 : 0x80, 0x00, data);
        const res = trustedInput.slice(0, trustedInput.length - 2).toString("hex");
        return res;
    });
}
function getTrustedInput(transport, indexLookup, transaction, additionals = []) {
    return __awaiter$9(this, void 0, void 0, function* () {
        const { version, inputs, outputs, locktime, nExpiryHeight, extraData } = transaction;
        if (!outputs || !locktime) {
            throw new Error("getTrustedInput: locktime & outputs is expected");
        }
        const isDecred = additionals.includes("decred");
        const isXST = additionals.includes("stealthcoin");
        const processScriptBlocks = (script, sequence) => __awaiter$9(this, void 0, void 0, function* () {
            const seq = sequence || buffer.Buffer.alloc(0);
            const scriptBlocks = [];
            let offset = 0;
            while (offset !== script.length) {
                const blockSize = script.length - offset > MAX_SCRIPT_BLOCK ? MAX_SCRIPT_BLOCK : script.length - offset;
                if (offset + blockSize !== script.length) {
                    scriptBlocks.push(script.slice(offset, offset + blockSize));
                }
                else {
                    scriptBlocks.push(buffer.Buffer.concat([script.slice(offset, offset + blockSize), seq]));
                }
                offset += blockSize;
            }
            // Handle case when no script length: we still want to pass the sequence
            // relatable: https://github.com/LedgerHQ/ledger-live-desktop/issues/1386
            if (script.length === 0) {
                scriptBlocks.push(seq);
            }
            let res;
            for (const scriptBlock of scriptBlocks) {
                res = yield getTrustedInputRaw(transport, scriptBlock);
            }
            return res;
        });
        const processWholeScriptBlock = block => getTrustedInputRaw(transport, block);
        yield getTrustedInputRaw(transport, buffer.Buffer.concat([
            transaction.version,
            transaction.timestamp || buffer.Buffer.alloc(0),
            transaction.nVersionGroupId || buffer.Buffer.alloc(0),
            createVarint(inputs.length),
        ]), indexLookup);
        for (const input of inputs) {
            const isXSTV2 = isXST && buffer.Buffer.compare(version, buffer.Buffer.from([0x02, 0x00, 0x00, 0x00])) === 0;
            const treeField = isDecred ? input.tree || buffer.Buffer.from([0x00]) : buffer.Buffer.alloc(0);
            const data = buffer.Buffer.concat([
                input.prevout,
                treeField,
                isXSTV2 ? buffer.Buffer.from([0x00]) : createVarint(input.script.length),
            ]);
            yield getTrustedInputRaw(transport, data);
            // iteration (eachSeries) ended
            // TODO notify progress
            // deferred.notify("input");
            // Reference: https://github.com/StealthSend/Stealth/commit/5be35d6c2c500b32ed82e5d6913d66d18a4b0a7f#diff-e8db9b851adc2422aadfffca88f14c91R566
            yield (isDecred
                ? processWholeScriptBlock(buffer.Buffer.concat([input.script, input.sequence]))
                : isXSTV2
                    ? processWholeScriptBlock(input.sequence)
                    : processScriptBlocks(input.script, input.sequence));
        }
        yield getTrustedInputRaw(transport, createVarint(outputs.length));
        for (const output of outputs) {
            const data = buffer.Buffer.concat([
                output.amount,
                isDecred ? buffer.Buffer.from([0x00, 0x00]) : buffer.Buffer.alloc(0),
                createVarint(output.script.length),
                output.script,
            ]);
            yield getTrustedInputRaw(transport, data);
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
            const data = buffer.Buffer.concat(endData);
            extraPart = isDecred ? data : buffer.Buffer.concat([createVarint(data.length), data]);
        }
        const res = yield processScriptBlocks(buffer.Buffer.concat([locktime, extraPart || buffer.Buffer.alloc(0)]));
        invariant$1(res, "missing result in processScriptBlocks");
        return res;
    });
}

var __awaiter$8 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
function startUntrustedHashTransactionInputRaw(transport, newTransaction, firstRound, transactionData, bip143 = false, overwinter = false, additionals = []) {
    const p2 = additionals.includes("cashaddr")
        ? 0x03
        : bip143
            ? additionals.includes("sapling")
                ? 0x05
                : overwinter
                    ? 0x04
                    : 0x02
            : 0x00;
    return transport.send(0xe0, 0x44, firstRound ? 0x00 : 0x80, newTransaction ? p2 : 0x80, transactionData);
}
function startUntrustedHashTransactionInput(transport, newTransaction, transaction, inputs, bip143 = false, overwinter = false, additionals = [], useTrustedInputForSegwit = false) {
    return __awaiter$8(this, void 0, void 0, function* () {
        let data = buffer.Buffer.concat([
            transaction.version,
            transaction.timestamp || buffer.Buffer.alloc(0),
            transaction.nVersionGroupId || buffer.Buffer.alloc(0),
            createVarint(transaction.inputs.length),
        ]);
        yield startUntrustedHashTransactionInputRaw(transport, newTransaction, true, data, bip143, overwinter, additionals);
        let i = 0;
        const isDecred = additionals.includes("decred");
        for (const input of transaction.inputs) {
            let prefix;
            const inputValue = inputs[i].value;
            if (bip143) {
                if (useTrustedInputForSegwit && inputs[i].trustedInput) {
                    prefix = buffer.Buffer.from([0x01, inputValue.length]);
                }
                else {
                    prefix = buffer.Buffer.from([0x02]);
                }
            }
            else {
                if (inputs[i].trustedInput) {
                    prefix = buffer.Buffer.from([0x01, inputs[i].value.length]);
                }
                else {
                    prefix = buffer.Buffer.from([0x00]);
                }
            }
            data = buffer.Buffer.concat([
                prefix,
                inputValue,
                isDecred ? buffer.Buffer.from([0x00]) : buffer.Buffer.alloc(0),
                createVarint(input.script.length),
            ]);
            yield startUntrustedHashTransactionInputRaw(transport, newTransaction, false, data, bip143, overwinter, additionals);
            const scriptBlocks = [];
            let offset = 0;
            if (input.script.length === 0) {
                scriptBlocks.push(input.sequence);
            }
            else {
                while (offset !== input.script.length) {
                    const blockSize = input.script.length - offset > MAX_SCRIPT_BLOCK
                        ? MAX_SCRIPT_BLOCK
                        : input.script.length - offset;
                    if (offset + blockSize !== input.script.length) {
                        scriptBlocks.push(input.script.slice(offset, offset + blockSize));
                    }
                    else {
                        scriptBlocks.push(buffer.Buffer.concat([input.script.slice(offset, offset + blockSize), input.sequence]));
                    }
                    offset += blockSize;
                }
            }
            for (const scriptBlock of scriptBlocks) {
                yield startUntrustedHashTransactionInputRaw(transport, newTransaction, false, scriptBlock, bip143, overwinter, additionals);
            }
            i++;
        }
    });
}

function getTrustedInputBIP143(transport, indexLookup, transaction, additionals = []) {
    if (!transaction) {
        throw new Error("getTrustedInputBIP143: missing tx");
    }
    const isDecred = additionals.includes("decred");
    if (isDecred) {
        throw new Error("Decred does not implement BIP143");
    }
    let hash = sha("sha256")
        .update(sha("sha256").update(serializeTransaction(transaction, true)).digest())
        .digest();
    const data = buffer.Buffer.alloc(4);
    data.writeUInt32LE(indexLookup, 0);
    const { outputs, locktime } = transaction;
    if (!outputs || !locktime) {
        throw new Error("getTrustedInputBIP143: locktime & outputs is expected");
    }
    if (!outputs[indexLookup]) {
        throw new Error("getTrustedInputBIP143: wrong index");
    }
    hash = buffer.Buffer.concat([hash, data, outputs[indexLookup].amount]);
    return hash.toString("hex");
}

function compressPublicKey(publicKey) {
    const prefix = (publicKey[64] & 1) !== 0 ? 0x03 : 0x02;
    const prefixBuffer = buffer.Buffer.alloc(1);
    prefixBuffer[0] = prefix;
    return buffer.Buffer.concat([prefixBuffer, publicKey.slice(1, 1 + 32)]);
}

function signTransaction(transport, path, lockTime, sigHashType, expiryHeight, additionals = []) {
    const isDecred = additionals.includes("decred");
    const pathsBuffer = bip32asBuffer(path);
    const lockTimeBuffer = buffer.Buffer.alloc(4);
    lockTimeBuffer.writeUInt32BE(lockTime, 0);
    let buffer$1 = isDecred
        ? buffer.Buffer.concat([
            pathsBuffer,
            lockTimeBuffer,
            expiryHeight || buffer.Buffer.from([0x00, 0x00, 0x00, 0x00]),
            buffer.Buffer.from([sigHashType]),
        ])
        : buffer.Buffer.concat([pathsBuffer, buffer.Buffer.from([0x00]), lockTimeBuffer, buffer.Buffer.from([sigHashType])]);
    if (expiryHeight && !isDecred) {
        buffer$1 = buffer.Buffer.concat([buffer$1, expiryHeight]);
    }
    return transport.send(0xe0, 0x48, 0x00, 0x00, buffer$1).then(result => {
        if (result.length > 0) {
            result[0] = 0x30;
            return result.slice(0, result.length - 2);
        }
        return result;
    });
}

var __awaiter$7 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
function provideOutputFullChangePath(transport, path) {
    const buffer = bip32asBuffer(path);
    return transport.send(0xe0, 0x4a, 0xff, 0x00, buffer);
}
function hashOutputFull(transport, outputScript, additionals = []) {
    return __awaiter$7(this, void 0, void 0, function* () {
        let offset = 0;
        const p1 = Number(0x80);
        const isDecred = additionals.includes("decred");
        ///WARNING: Decred works only with one call (without chunking)
        //TODO: test without this for Decred
        if (isDecred) {
            return transport.send(0xe0, 0x4a, p1, 0x00, outputScript);
        }
        while (offset < outputScript.length) {
            const blockSize = offset + MAX_SCRIPT_BLOCK >= outputScript.length
                ? outputScript.length - offset
                : MAX_SCRIPT_BLOCK;
            const p1 = offset + blockSize === outputScript.length ? 0x80 : 0x00;
            const data = outputScript.slice(offset, offset + blockSize);
            yield transport.send(0xe0, 0x4a, p1, 0x00, data);
            offset += blockSize;
        }
    });
}

var __awaiter$6 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const getAppAndVersion = (transport) => __awaiter$6(void 0, void 0, void 0, function* () {
    const r = yield transport.send(0xb0, 0x01, 0x00, 0x00);
    let i = 0;
    const format = r[i++];
    invariant$1(format === 1, "getAppAndVersion: format not supported");
    const nameLength = r[i++];
    const name = r.slice(i, (i += nameLength)).toString("ascii");
    const versionLength = r[i++];
    const version = r.slice(i, (i += versionLength)).toString("ascii");
    const flagLength = r[i++];
    const flags = r.slice(i, (i += flagLength));
    return {
        name,
        version,
        flags,
    };
});
const checkIsBtcLegacy = (transport) => __awaiter$6(void 0, void 0, void 0, function* () {
    try {
        // Call old btc API, it will throw an exception with new btc app. It is a workaround to differentiate new/old btc nano app
        yield transport.send(0xe0, 0xc4, 0, 0);
    }
    catch (e) {
        return false;
    }
    return true;
});

var re$3 = {exports: {}};

// Note: this is the semver.org version of the spec that it implements
// Not necessarily the package version of this code.
const SEMVER_SPEC_VERSION = '2.0.0';

const MAX_LENGTH$2 = 256;
const MAX_SAFE_INTEGER$1 = Number.MAX_SAFE_INTEGER ||
/* istanbul ignore next */ 9007199254740991;

// Max safe segment length for coercion.
const MAX_SAFE_COMPONENT_LENGTH = 16;

var constants$1 = {
  SEMVER_SPEC_VERSION,
  MAX_LENGTH: MAX_LENGTH$2,
  MAX_SAFE_INTEGER: MAX_SAFE_INTEGER$1,
  MAX_SAFE_COMPONENT_LENGTH,
};

const debug$1 = (
  typeof process === 'object' &&
  process.env &&
  process.env.NODE_DEBUG &&
  /\bsemver\b/i.test(process.env.NODE_DEBUG)
) ? (...args) => console.error('SEMVER', ...args)
  : () => {};

var debug_1 = debug$1;

(function (module, exports) {
	const { MAX_SAFE_COMPONENT_LENGTH } = constants$1;
	const debug = debug_1;
	exports = module.exports = {};

	// The actual regexps go on exports.re
	const re = exports.re = [];
	const src = exports.src = [];
	const t = exports.t = {};
	let R = 0;

	const createToken = (name, value, isGlobal) => {
	  const index = R++;
	  debug(name, index, value);
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
	createToken('GTE0', '^\\s*>=\\s*0\\.0\\.0\\s*$');
	createToken('GTE0PRE', '^\\s*>=\\s*0\\.0\\.0-0\\s*$'); 
} (re$3, re$3.exports));

var reExports = re$3.exports;

// parse out just the options we care about so we always get a consistent
// obj with keys in a consistent order.
const opts = ['includePrerelease', 'loose', 'rtl'];
const parseOptions$2 = options =>
  !options ? {}
  : typeof options !== 'object' ? { loose: true }
  : opts.filter(k => options[k]).reduce((o, k) => {
    o[k] = true;
    return o
  }, {});
var parseOptions_1 = parseOptions$2;

const numeric = /^[0-9]+$/;
const compareIdentifiers$1 = (a, b) => {
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

const rcompareIdentifiers = (a, b) => compareIdentifiers$1(b, a);

var identifiers$1 = {
  compareIdentifiers: compareIdentifiers$1,
  rcompareIdentifiers,
};

const debug = debug_1;
const { MAX_LENGTH: MAX_LENGTH$1, MAX_SAFE_INTEGER } = constants$1;
const { re: re$2, t: t$2 } = reExports;

const parseOptions$1 = parseOptions_1;
const { compareIdentifiers } = identifiers$1;
let SemVer$d = class SemVer {
  constructor (version, options) {
    options = parseOptions$1(options);

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

    debug('SemVer', version, options);
    this.options = options;
    this.loose = !!options.loose;
    // this isn't actually relevant for versions, but keep it so that we
    // don't run into trouble passing this.options around.
    this.includePrerelease = !!options.includePrerelease;

    const m = version.trim().match(options.loose ? re$2[t$2.LOOSE] : re$2[t$2.FULL]);

    if (!m) {
      throw new TypeError(`Invalid Version: ${version}`)
    }

    this.raw = version;

    // these are actually numbers
    this.major = +m[1];
    this.minor = +m[2];
    this.patch = +m[3];

    if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
      throw new TypeError('Invalid major version')
    }

    if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
      throw new TypeError('Invalid minor version')
    }

    if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
      throw new TypeError('Invalid patch version')
    }

    // numberify any prerelease numeric ids
    if (!m[4]) {
      this.prerelease = [];
    } else {
      this.prerelease = m[4].split('.').map((id) => {
        if (/^[0-9]+$/.test(id)) {
          const num = +id;
          if (num >= 0 && num < MAX_SAFE_INTEGER) {
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
    debug('SemVer.compare', this.version, this.options, other);
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
      compareIdentifiers(this.major, other.major) ||
      compareIdentifiers(this.minor, other.minor) ||
      compareIdentifiers(this.patch, other.patch)
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
      debug('prerelease compare', i, a, b);
      if (a === undefined && b === undefined) {
        return 0
      } else if (b === undefined) {
        return 1
      } else if (a === undefined) {
        return -1
      } else if (a === b) {
        continue
      } else {
        return compareIdentifiers(a, b)
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
      debug('prerelease compare', i, a, b);
      if (a === undefined && b === undefined) {
        return 0
      } else if (b === undefined) {
        return 1
      } else if (a === undefined) {
        return -1
      } else if (a === b) {
        continue
      } else {
        return compareIdentifiers(a, b)
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
          if (compareIdentifiers(this.prerelease[0], identifier) === 0) {
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
};

var semver$2 = SemVer$d;

const { MAX_LENGTH } = constants$1;
const { re: re$1, t: t$1 } = reExports;
const SemVer$c = semver$2;

const parseOptions = parseOptions_1;
const parse$6 = (version, options) => {
  options = parseOptions(options);

  if (version instanceof SemVer$c) {
    return version
  }

  if (typeof version !== 'string') {
    return null
  }

  if (version.length > MAX_LENGTH) {
    return null
  }

  const r = options.loose ? re$1[t$1.LOOSE] : re$1[t$1.FULL];
  if (!r.test(version)) {
    return null
  }

  try {
    return new SemVer$c(version, options)
  } catch (er) {
    return null
  }
};

var parse_1 = parse$6;

const parse$5 = parse_1;
const valid$2 = (version, options) => {
  const v = parse$5(version, options);
  return v ? v.version : null
};
var valid_1 = valid$2;

const parse$4 = parse_1;
const clean$1 = (version, options) => {
  const s = parse$4(version.trim().replace(/^[=v]+/, ''), options);
  return s ? s.version : null
};
var clean_1 = clean$1;

const SemVer$b = semver$2;

const inc$1 = (version, release, options, identifier) => {
  if (typeof (options) === 'string') {
    identifier = options;
    options = undefined;
  }

  try {
    return new SemVer$b(
      version instanceof SemVer$b ? version.version : version,
      options
    ).inc(release, identifier).version
  } catch (er) {
    return null
  }
};
var inc_1 = inc$1;

const SemVer$a = semver$2;
const compare$b = (a, b, loose) =>
  new SemVer$a(a, loose).compare(new SemVer$a(b, loose));

var compare_1 = compare$b;

const compare$a = compare_1;
const eq$3 = (a, b, loose) => compare$a(a, b, loose) === 0;
var eq_1 = eq$3;

const parse$3 = parse_1;
const eq$2 = eq_1;

const diff$1 = (version1, version2) => {
  if (eq$2(version1, version2)) {
    return null
  } else {
    const v1 = parse$3(version1);
    const v2 = parse$3(version2);
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
var diff_1 = diff$1;

const SemVer$9 = semver$2;
const major$1 = (a, loose) => new SemVer$9(a, loose).major;
var major_1 = major$1;

const SemVer$8 = semver$2;
const minor$1 = (a, loose) => new SemVer$8(a, loose).minor;
var minor_1 = minor$1;

const SemVer$7 = semver$2;
const patch$1 = (a, loose) => new SemVer$7(a, loose).patch;
var patch_1 = patch$1;

const parse$2 = parse_1;
const prerelease$1 = (version, options) => {
  const parsed = parse$2(version, options);
  return (parsed && parsed.prerelease.length) ? parsed.prerelease : null
};
var prerelease_1 = prerelease$1;

const compare$9 = compare_1;
const rcompare$1 = (a, b, loose) => compare$9(b, a, loose);
var rcompare_1 = rcompare$1;

const compare$8 = compare_1;
const compareLoose$1 = (a, b) => compare$8(a, b, true);
var compareLoose_1 = compareLoose$1;

const SemVer$6 = semver$2;
const compareBuild$3 = (a, b, loose) => {
  const versionA = new SemVer$6(a, loose);
  const versionB = new SemVer$6(b, loose);
  return versionA.compare(versionB) || versionA.compareBuild(versionB)
};
var compareBuild_1 = compareBuild$3;

const compareBuild$2 = compareBuild_1;
const sort$1 = (list, loose) => list.sort((a, b) => compareBuild$2(a, b, loose));
var sort_1 = sort$1;

const compareBuild$1 = compareBuild_1;
const rsort$1 = (list, loose) => list.sort((a, b) => compareBuild$1(b, a, loose));
var rsort_1 = rsort$1;

const compare$7 = compare_1;
const gt$4 = (a, b, loose) => compare$7(a, b, loose) > 0;
var gt_1 = gt$4;

const compare$6 = compare_1;
const lt$3 = (a, b, loose) => compare$6(a, b, loose) < 0;
var lt_1 = lt$3;

const compare$5 = compare_1;
const neq$2 = (a, b, loose) => compare$5(a, b, loose) !== 0;
var neq_1 = neq$2;

const compare$4 = compare_1;
const gte$3 = (a, b, loose) => compare$4(a, b, loose) >= 0;
var gte_1 = gte$3;

const compare$3 = compare_1;
const lte$3 = (a, b, loose) => compare$3(a, b, loose) <= 0;
var lte_1 = lte$3;

const eq$1 = eq_1;
const neq$1 = neq_1;
const gt$3 = gt_1;
const gte$2 = gte_1;
const lt$2 = lt_1;
const lte$2 = lte_1;

const cmp$1 = (a, op, b, loose) => {
  switch (op) {
    case '===':
      if (typeof a === 'object') {
        a = a.version;
      }
      if (typeof b === 'object') {
        b = b.version;
      }
      return a === b

    case '!==':
      if (typeof a === 'object') {
        a = a.version;
      }
      if (typeof b === 'object') {
        b = b.version;
      }
      return a !== b

    case '':
    case '=':
    case '==':
      return eq$1(a, b, loose)

    case '!=':
      return neq$1(a, b, loose)

    case '>':
      return gt$3(a, b, loose)

    case '>=':
      return gte$2(a, b, loose)

    case '<':
      return lt$2(a, b, loose)

    case '<=':
      return lte$2(a, b, loose)

    default:
      throw new TypeError(`Invalid operator: ${op}`)
  }
};
var cmp_1 = cmp$1;

const SemVer$5 = semver$2;
const parse$1 = parse_1;
const { re, t } = reExports;

const coerce$1 = (version, options) => {
  if (version instanceof SemVer$5) {
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
    match = version.match(re[t.COERCE]);
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
    while ((next = re[t.COERCERTL].exec(version)) &&
        (!match || match.index + match[0].length !== version.length)
    ) {
      if (!match ||
            next.index + next[0].length !== match.index + match[0].length) {
        match = next;
      }
      re[t.COERCERTL].lastIndex = next.index + next[1].length + next[2].length;
    }
    // leave it in a clean state
    re[t.COERCERTL].lastIndex = -1;
  }

  if (match === null) {
    return null
  }

  return parse$1(`${match[2]}.${match[3] || '0'}.${match[4] || '0'}`, options)
};
var coerce_1 = coerce$1;

var range;
var hasRequiredRange;

function requireRange () {
	if (hasRequiredRange) return range;
	hasRequiredRange = 1;
	// hoisted class for cyclic dependency
	class Range {
	  constructor (range, options) {
	    options = parseOptions(options);

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

	    if (range instanceof Comparator) {
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
	      .split('||')
	      // map the range to a 2d array of comparators
	      .map(r => this.parseRange(r.trim()))
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
	      if (this.set.length === 0) {
	        this.set = [first];
	      } else if (this.set.length > 1) {
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
	    if (cached) {
	      return cached
	    }

	    const loose = this.options.loose;
	    // `1.2.3 - 1.2.4` => `>=1.2.3 <=1.2.4`
	    const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
	    range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
	    debug('hyphen replace', range);
	    // `> 1.2.3 < 1.2.5` => `>1.2.3 <1.2.5`
	    range = range.replace(re[t.COMPARATORTRIM], comparatorTrimReplace);
	    debug('comparator trim', range);

	    // `~ 1.2.3` => `~1.2.3`
	    range = range.replace(re[t.TILDETRIM], tildeTrimReplace);

	    // `^ 1.2.3` => `^1.2.3`
	    range = range.replace(re[t.CARETTRIM], caretTrimReplace);

	    // normalize spaces
	    range = range.split(/\s+/).join(' ');

	    // At this point, the range is completely trimmed and
	    // ready to be split into comparators.

	    let rangeList = range
	      .split(' ')
	      .map(comp => parseComparator(comp, this.options))
	      .join(' ')
	      .split(/\s+/)
	      // >=0.0.0 is equivalent to *
	      .map(comp => replaceGTE0(comp, this.options));

	    if (loose) {
	      // in loose mode, throw out any that are not valid comparators
	      rangeList = rangeList.filter(comp => {
	        debug('loose invalid filter', comp, this.options);
	        return !!comp.match(re[t.COMPARATORLOOSE])
	      });
	    }
	    debug('range list', rangeList);

	    // if any comparators are the null set, then replace with JUST null set
	    // if more than one comparator, remove any * comparators
	    // also, don't include the same comparator more than once
	    const rangeMap = new Map();
	    const comparators = rangeList.map(comp => new Comparator(comp, this.options));
	    for (const comp of comparators) {
	      if (isNullSet(comp)) {
	        return [comp]
	      }
	      rangeMap.set(comp.value, comp);
	    }
	    if (rangeMap.size > 1 && rangeMap.has('')) {
	      rangeMap.delete('');
	    }

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
	        version = new SemVer(version, this.options);
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
	range = Range;

	const LRU = requireLruCache();
	const cache = new LRU({ max: 1000 });

	const parseOptions = parseOptions_1;
	const Comparator = requireComparator();
	const debug = debug_1;
	const SemVer = semver$2;
	const {
	  re,
	  t,
	  comparatorTrimReplace,
	  tildeTrimReplace,
	  caretTrimReplace,
	} = reExports;

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
	  debug('comp', comp, options);
	  comp = replaceCarets(comp, options);
	  debug('caret', comp);
	  comp = replaceTildes(comp, options);
	  debug('tildes', comp);
	  comp = replaceXRanges(comp, options);
	  debug('xrange', comp);
	  comp = replaceStars(comp, options);
	  debug('stars', comp);
	  return comp
	};

	const isX = id => !id || id.toLowerCase() === 'x' || id === '*';

	// ~, ~> --> * (any, kinda silly)
	// ~2, ~2.x, ~2.x.x, ~>2, ~>2.x ~>2.x.x --> >=2.0.0 <3.0.0-0
	// ~2.0, ~2.0.x, ~>2.0, ~>2.0.x --> >=2.0.0 <2.1.0-0
	// ~1.2, ~1.2.x, ~>1.2, ~>1.2.x --> >=1.2.0 <1.3.0-0
	// ~1.2.3, ~>1.2.3 --> >=1.2.3 <1.3.0-0
	// ~1.2.0, ~>1.2.0 --> >=1.2.0 <1.3.0-0
	// ~0.0.1 --> >=0.0.1 <0.1.0-0
	const replaceTildes = (comp, options) =>
	  comp.trim().split(/\s+/).map((c) => {
	    return replaceTilde(c, options)
	  }).join(' ');

	const replaceTilde = (comp, options) => {
	  const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
	  return comp.replace(r, (_, M, m, p, pr) => {
	    debug('tilde', comp, _, M, m, p, pr);
	    let ret;

	    if (isX(M)) {
	      ret = '';
	    } else if (isX(m)) {
	      ret = `>=${M}.0.0 <${+M + 1}.0.0-0`;
	    } else if (isX(p)) {
	      // ~1.2 == >=1.2.0 <1.3.0-0
	      ret = `>=${M}.${m}.0 <${M}.${+m + 1}.0-0`;
	    } else if (pr) {
	      debug('replaceTilde pr', pr);
	      ret = `>=${M}.${m}.${p}-${pr
	      } <${M}.${+m + 1}.0-0`;
	    } else {
	      // ~1.2.3 == >=1.2.3 <1.3.0-0
	      ret = `>=${M}.${m}.${p
	      } <${M}.${+m + 1}.0-0`;
	    }

	    debug('tilde return', ret);
	    return ret
	  })
	};

	// ^ --> * (any, kinda silly)
	// ^2, ^2.x, ^2.x.x --> >=2.0.0 <3.0.0-0
	// ^2.0, ^2.0.x --> >=2.0.0 <3.0.0-0
	// ^1.2, ^1.2.x --> >=1.2.0 <2.0.0-0
	// ^1.2.3 --> >=1.2.3 <2.0.0-0
	// ^1.2.0 --> >=1.2.0 <2.0.0-0
	// ^0.0.1 --> >=0.0.1 <0.0.2-0
	// ^0.1.0 --> >=0.1.0 <0.2.0-0
	const replaceCarets = (comp, options) =>
	  comp.trim().split(/\s+/).map((c) => {
	    return replaceCaret(c, options)
	  }).join(' ');

	const replaceCaret = (comp, options) => {
	  debug('caret', comp, options);
	  const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
	  const z = options.includePrerelease ? '-0' : '';
	  return comp.replace(r, (_, M, m, p, pr) => {
	    debug('caret', comp, _, M, m, p, pr);
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
	      debug('replaceCaret pr', pr);
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
	      debug('no pr');
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

	    debug('caret return', ret);
	    return ret
	  })
	};

	const replaceXRanges = (comp, options) => {
	  debug('replaceXRanges', comp, options);
	  return comp.split(/\s+/).map((c) => {
	    return replaceXRange(c, options)
	  }).join(' ')
	};

	const replaceXRange = (comp, options) => {
	  comp = comp.trim();
	  const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
	  return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
	    debug('xRange', comp, ret, gtlt, M, m, p, pr);
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

	      if (gtlt === '<') {
	        pr = '-0';
	      }

	      ret = `${gtlt + M}.${m}.${p}${pr}`;
	    } else if (xm) {
	      ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
	    } else if (xp) {
	      ret = `>=${M}.${m}.0${pr
	      } <${M}.${+m + 1}.0-0`;
	    }

	    debug('xRange return', ret);

	    return ret
	  })
	};

	// Because * is AND-ed with everything else in the comparator,
	// and '' means "any version", just remove the *s entirely.
	const replaceStars = (comp, options) => {
	  debug('replaceStars', comp, options);
	  // Looseness is ignored here.  star is always as loose as it gets!
	  return comp.trim().replace(re[t.STAR], '')
	};

	const replaceGTE0 = (comp, options) => {
	  debug('replaceGTE0', comp, options);
	  return comp.trim()
	    .replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], '')
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
	      debug(set[i].semver);
	      if (set[i].semver === Comparator.ANY) {
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
	return range;
}

var comparator;
var hasRequiredComparator;

function requireComparator () {
	if (hasRequiredComparator) return comparator;
	hasRequiredComparator = 1;
	const ANY = Symbol('SemVer ANY');
	// hoisted class for cyclic dependency
	class Comparator {
	  static get ANY () {
	    return ANY
	  }

	  constructor (comp, options) {
	    options = parseOptions(options);

	    if (comp instanceof Comparator) {
	      if (comp.loose === !!options.loose) {
	        return comp
	      } else {
	        comp = comp.value;
	      }
	    }

	    debug('comparator', comp, options);
	    this.options = options;
	    this.loose = !!options.loose;
	    this.parse(comp);

	    if (this.semver === ANY) {
	      this.value = '';
	    } else {
	      this.value = this.operator + this.semver.version;
	    }

	    debug('comp', this);
	  }

	  parse (comp) {
	    const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
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
	      this.semver = new SemVer(m[2], this.options.loose);
	    }
	  }

	  toString () {
	    return this.value
	  }

	  test (version) {
	    debug('Comparator.test', version, this.options.loose);

	    if (this.semver === ANY || version === ANY) {
	      return true
	    }

	    if (typeof version === 'string') {
	      try {
	        version = new SemVer(version, this.options);
	      } catch (er) {
	        return false
	      }
	    }

	    return cmp(version, this.operator, this.semver, this.options)
	  }

	  intersects (comp, options) {
	    if (!(comp instanceof Comparator)) {
	      throw new TypeError('a Comparator is required')
	    }

	    if (!options || typeof options !== 'object') {
	      options = {
	        loose: !!options,
	        includePrerelease: false,
	      };
	    }

	    if (this.operator === '') {
	      if (this.value === '') {
	        return true
	      }
	      return new Range(comp.value, options).test(this.value)
	    } else if (comp.operator === '') {
	      if (comp.value === '') {
	        return true
	      }
	      return new Range(this.value, options).test(comp.semver)
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
	      cmp(this.semver, '<', comp.semver, options) &&
	      (this.operator === '>=' || this.operator === '>') &&
	        (comp.operator === '<=' || comp.operator === '<');
	    const oppositeDirectionsGreaterThan =
	      cmp(this.semver, '>', comp.semver, options) &&
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

	comparator = Comparator;

	const parseOptions = parseOptions_1;
	const { re, t } = reExports;
	const cmp = cmp_1;
	const debug = debug_1;
	const SemVer = semver$2;
	const Range = requireRange();
	return comparator;
}

const Range$9 = requireRange();
const satisfies$4 = (version, range, options) => {
  try {
    range = new Range$9(range, options);
  } catch (er) {
    return false
  }
  return range.test(version)
};
var satisfies_1 = satisfies$4;

const Range$8 = requireRange();

// Mostly just for testing and legacy API reasons
const toComparators$1 = (range, options) =>
  new Range$8(range, options).set
    .map(comp => comp.map(c => c.value).join(' ').trim().split(' '));

var toComparators_1 = toComparators$1;

const SemVer$4 = semver$2;
const Range$7 = requireRange();

const maxSatisfying$1 = (versions, range, options) => {
  let max = null;
  let maxSV = null;
  let rangeObj = null;
  try {
    rangeObj = new Range$7(range, options);
  } catch (er) {
    return null
  }
  versions.forEach((v) => {
    if (rangeObj.test(v)) {
      // satisfies(v, range, options)
      if (!max || maxSV.compare(v) === -1) {
        // compare(max, v, true)
        max = v;
        maxSV = new SemVer$4(max, options);
      }
    }
  });
  return max
};
var maxSatisfying_1 = maxSatisfying$1;

const SemVer$3 = semver$2;
const Range$6 = requireRange();
const minSatisfying$1 = (versions, range, options) => {
  let min = null;
  let minSV = null;
  let rangeObj = null;
  try {
    rangeObj = new Range$6(range, options);
  } catch (er) {
    return null
  }
  versions.forEach((v) => {
    if (rangeObj.test(v)) {
      // satisfies(v, range, options)
      if (!min || minSV.compare(v) === 1) {
        // compare(min, v, true)
        min = v;
        minSV = new SemVer$3(min, options);
      }
    }
  });
  return min
};
var minSatisfying_1 = minSatisfying$1;

const SemVer$2 = semver$2;
const Range$5 = requireRange();
const gt$2 = gt_1;

const minVersion$1 = (range, loose) => {
  range = new Range$5(range, loose);

  let minver = new SemVer$2('0.0.0');
  if (range.test(minver)) {
    return minver
  }

  minver = new SemVer$2('0.0.0-0');
  if (range.test(minver)) {
    return minver
  }

  minver = null;
  for (let i = 0; i < range.set.length; ++i) {
    const comparators = range.set[i];

    let setMin = null;
    comparators.forEach((comparator) => {
      // Clone to avoid manipulating the comparator's semver object.
      const compver = new SemVer$2(comparator.semver.version);
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
          if (!setMin || gt$2(compver, setMin)) {
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
    if (setMin && (!minver || gt$2(minver, setMin))) {
      minver = setMin;
    }
  }

  if (minver && range.test(minver)) {
    return minver
  }

  return null
};
var minVersion_1 = minVersion$1;

const Range$4 = requireRange();
const validRange$1 = (range, options) => {
  try {
    // Return '*' instead of '' so that truthiness works.
    // This will throw if it's invalid anyway
    return new Range$4(range, options).range || '*'
  } catch (er) {
    return null
  }
};
var valid$1 = validRange$1;

const SemVer$1 = semver$2;
const Comparator$2 = requireComparator();
const { ANY: ANY$1 } = Comparator$2;
const Range$3 = requireRange();
const satisfies$3 = satisfies_1;
const gt$1 = gt_1;
const lt$1 = lt_1;
const lte$1 = lte_1;
const gte$1 = gte_1;

const outside$3 = (version, range, hilo, options) => {
  version = new SemVer$1(version, options);
  range = new Range$3(range, options);

  let gtfn, ltefn, ltfn, comp, ecomp;
  switch (hilo) {
    case '>':
      gtfn = gt$1;
      ltefn = lte$1;
      ltfn = lt$1;
      comp = '>';
      ecomp = '>=';
      break
    case '<':
      gtfn = lt$1;
      ltefn = gte$1;
      ltfn = gt$1;
      comp = '<';
      ecomp = '<=';
      break
    default:
      throw new TypeError('Must provide a hilo val of "<" or ">"')
  }

  // If it satisfies the range it is not outside
  if (satisfies$3(version, range, options)) {
    return false
  }

  // From now on, variable terms are as if we're in "gtr" mode.
  // but note that everything is flipped for the "ltr" function.

  for (let i = 0; i < range.set.length; ++i) {
    const comparators = range.set[i];

    let high = null;
    let low = null;

    comparators.forEach((comparator) => {
      if (comparator.semver === ANY$1) {
        comparator = new Comparator$2('>=0.0.0');
      }
      high = high || comparator;
      low = low || comparator;
      if (gtfn(comparator.semver, high.semver, options)) {
        high = comparator;
      } else if (ltfn(comparator.semver, low.semver, options)) {
        low = comparator;
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

var outside_1 = outside$3;

// Determine if version is greater than all the versions possible in the range.
const outside$2 = outside_1;
const gtr$1 = (version, range, options) => outside$2(version, range, '>', options);
var gtr_1 = gtr$1;

const outside$1 = outside_1;
// Determine if version is less than all the versions possible in the range
const ltr$1 = (version, range, options) => outside$1(version, range, '<', options);
var ltr_1 = ltr$1;

const Range$2 = requireRange();
const intersects$1 = (r1, r2, options) => {
  r1 = new Range$2(r1, options);
  r2 = new Range$2(r2, options);
  return r1.intersects(r2)
};
var intersects_1 = intersects$1;

// given a set of versions and a range, create a "simplified" range
// that includes the same versions that the original range does
// If the original range is shorter than the simplified one, return that.
const satisfies$2 = satisfies_1;
const compare$2 = compare_1;
var simplify = (versions, range, options) => {
  const set = [];
  let first = null;
  let prev = null;
  const v = versions.sort((a, b) => compare$2(a, b, options));
  for (const version of v) {
    const included = satisfies$2(version, range, options);
    if (included) {
      prev = version;
      if (!first) {
        first = version;
      }
    } else {
      if (prev) {
        set.push([first, prev]);
      }
      prev = null;
      first = null;
    }
  }
  if (first) {
    set.push([first, null]);
  }

  const ranges = [];
  for (const [min, max] of set) {
    if (min === max) {
      ranges.push(min);
    } else if (!max && min === v[0]) {
      ranges.push('*');
    } else if (!max) {
      ranges.push(`>=${min}`);
    } else if (min === v[0]) {
      ranges.push(`<=${max}`);
    } else {
      ranges.push(`${min} - ${max}`);
    }
  }
  const simplified = ranges.join(' || ');
  const original = typeof range.raw === 'string' ? range.raw : String(range);
  return simplified.length < original.length ? simplified : range
};

const Range$1 = requireRange();
const Comparator$1 = requireComparator();
const { ANY } = Comparator$1;
const satisfies$1 = satisfies_1;
const compare$1 = compare_1;

// Complex range `r1 || r2 || ...` is a subset of `R1 || R2 || ...` iff:
// - Every simple range `r1, r2, ...` is a null set, OR
// - Every simple range `r1, r2, ...` which is not a null set is a subset of
//   some `R1, R2, ...`
//
// Simple range `c1 c2 ...` is a subset of simple range `C1 C2 ...` iff:
// - If c is only the ANY comparator
//   - If C is only the ANY comparator, return true
//   - Else if in prerelease mode, return false
//   - else replace c with `[>=0.0.0]`
// - If C is only the ANY comparator
//   - if in prerelease mode, return true
//   - else replace C with `[>=0.0.0]`
// - Let EQ be the set of = comparators in c
// - If EQ is more than one, return true (null set)
// - Let GT be the highest > or >= comparator in c
// - Let LT be the lowest < or <= comparator in c
// - If GT and LT, and GT.semver > LT.semver, return true (null set)
// - If any C is a = range, and GT or LT are set, return false
// - If EQ
//   - If GT, and EQ does not satisfy GT, return true (null set)
//   - If LT, and EQ does not satisfy LT, return true (null set)
//   - If EQ satisfies every C, return true
//   - Else return false
// - If GT
//   - If GT.semver is lower than any > or >= comp in C, return false
//   - If GT is >=, and GT.semver does not satisfy every C, return false
//   - If GT.semver has a prerelease, and not in prerelease mode
//     - If no C has a prerelease and the GT.semver tuple, return false
// - If LT
//   - If LT.semver is greater than any < or <= comp in C, return false
//   - If LT is <=, and LT.semver does not satisfy every C, return false
//   - If GT.semver has a prerelease, and not in prerelease mode
//     - If no C has a prerelease and the LT.semver tuple, return false
// - Else return true

const subset$1 = (sub, dom, options = {}) => {
  if (sub === dom) {
    return true
  }

  sub = new Range$1(sub, options);
  dom = new Range$1(dom, options);
  let sawNonNull = false;

  OUTER: for (const simpleSub of sub.set) {
    for (const simpleDom of dom.set) {
      const isSub = simpleSubset(simpleSub, simpleDom, options);
      sawNonNull = sawNonNull || isSub !== null;
      if (isSub) {
        continue OUTER
      }
    }
    // the null set is a subset of everything, but null simple ranges in
    // a complex range should be ignored.  so if we saw a non-null range,
    // then we know this isn't a subset, but if EVERY simple range was null,
    // then it is a subset.
    if (sawNonNull) {
      return false
    }
  }
  return true
};

const simpleSubset = (sub, dom, options) => {
  if (sub === dom) {
    return true
  }

  if (sub.length === 1 && sub[0].semver === ANY) {
    if (dom.length === 1 && dom[0].semver === ANY) {
      return true
    } else if (options.includePrerelease) {
      sub = [new Comparator$1('>=0.0.0-0')];
    } else {
      sub = [new Comparator$1('>=0.0.0')];
    }
  }

  if (dom.length === 1 && dom[0].semver === ANY) {
    if (options.includePrerelease) {
      return true
    } else {
      dom = [new Comparator$1('>=0.0.0')];
    }
  }

  const eqSet = new Set();
  let gt, lt;
  for (const c of sub) {
    if (c.operator === '>' || c.operator === '>=') {
      gt = higherGT(gt, c, options);
    } else if (c.operator === '<' || c.operator === '<=') {
      lt = lowerLT(lt, c, options);
    } else {
      eqSet.add(c.semver);
    }
  }

  if (eqSet.size > 1) {
    return null
  }

  let gtltComp;
  if (gt && lt) {
    gtltComp = compare$1(gt.semver, lt.semver, options);
    if (gtltComp > 0) {
      return null
    } else if (gtltComp === 0 && (gt.operator !== '>=' || lt.operator !== '<=')) {
      return null
    }
  }

  // will iterate one or zero times
  for (const eq of eqSet) {
    if (gt && !satisfies$1(eq, String(gt), options)) {
      return null
    }

    if (lt && !satisfies$1(eq, String(lt), options)) {
      return null
    }

    for (const c of dom) {
      if (!satisfies$1(eq, String(c), options)) {
        return false
      }
    }

    return true
  }

  let higher, lower;
  let hasDomLT, hasDomGT;
  // if the subset has a prerelease, we need a comparator in the superset
  // with the same tuple and a prerelease, or it's not a subset
  let needDomLTPre = lt &&
    !options.includePrerelease &&
    lt.semver.prerelease.length ? lt.semver : false;
  let needDomGTPre = gt &&
    !options.includePrerelease &&
    gt.semver.prerelease.length ? gt.semver : false;
  // exception: <1.2.3-0 is the same as <1.2.3
  if (needDomLTPre && needDomLTPre.prerelease.length === 1 &&
      lt.operator === '<' && needDomLTPre.prerelease[0] === 0) {
    needDomLTPre = false;
  }

  for (const c of dom) {
    hasDomGT = hasDomGT || c.operator === '>' || c.operator === '>=';
    hasDomLT = hasDomLT || c.operator === '<' || c.operator === '<=';
    if (gt) {
      if (needDomGTPre) {
        if (c.semver.prerelease && c.semver.prerelease.length &&
            c.semver.major === needDomGTPre.major &&
            c.semver.minor === needDomGTPre.minor &&
            c.semver.patch === needDomGTPre.patch) {
          needDomGTPre = false;
        }
      }
      if (c.operator === '>' || c.operator === '>=') {
        higher = higherGT(gt, c, options);
        if (higher === c && higher !== gt) {
          return false
        }
      } else if (gt.operator === '>=' && !satisfies$1(gt.semver, String(c), options)) {
        return false
      }
    }
    if (lt) {
      if (needDomLTPre) {
        if (c.semver.prerelease && c.semver.prerelease.length &&
            c.semver.major === needDomLTPre.major &&
            c.semver.minor === needDomLTPre.minor &&
            c.semver.patch === needDomLTPre.patch) {
          needDomLTPre = false;
        }
      }
      if (c.operator === '<' || c.operator === '<=') {
        lower = lowerLT(lt, c, options);
        if (lower === c && lower !== lt) {
          return false
        }
      } else if (lt.operator === '<=' && !satisfies$1(lt.semver, String(c), options)) {
        return false
      }
    }
    if (!c.operator && (lt || gt) && gtltComp !== 0) {
      return false
    }
  }

  // if there was a < or >, and nothing in the dom, then must be false
  // UNLESS it was limited by another range in the other direction.
  // Eg, >1.0.0 <1.0.1 is still a subset of <2.0.0
  if (gt && hasDomLT && !lt && gtltComp !== 0) {
    return false
  }

  if (lt && hasDomGT && !gt && gtltComp !== 0) {
    return false
  }

  // we needed a prerelease range in a specific tuple, but didn't get one
  // then this isn't a subset.  eg >=1.2.3-pre is not a subset of >=1.0.0,
  // because it includes prereleases in the 1.2.3 tuple
  if (needDomGTPre || needDomLTPre) {
    return false
  }

  return true
};

// >=1.2.3 is lower than >1.2.3
const higherGT = (a, b, options) => {
  if (!a) {
    return b
  }
  const comp = compare$1(a.semver, b.semver, options);
  return comp > 0 ? a
    : comp < 0 ? b
    : b.operator === '>' && a.operator === '>=' ? b
    : a
};

// <=1.2.3 is higher than <1.2.3
const lowerLT = (a, b, options) => {
  if (!a) {
    return b
  }
  const comp = compare$1(a.semver, b.semver, options);
  return comp < 0 ? a
    : comp > 0 ? b
    : b.operator === '<' && a.operator === '<=' ? b
    : a
};

var subset_1 = subset$1;

// just pre-load all the stuff that index.js lazily exports
const internalRe = reExports;
const constants = constants$1;
const SemVer = semver$2;
const identifiers = identifiers$1;
const parse = parse_1;
const valid = valid_1;
const clean = clean_1;
const inc = inc_1;
const diff = diff_1;
const major = major_1;
const minor = minor_1;
const patch = patch_1;
const prerelease = prerelease_1;
const compare = compare_1;
const rcompare = rcompare_1;
const compareLoose = compareLoose_1;
const compareBuild = compareBuild_1;
const sort = sort_1;
const rsort = rsort_1;
const gt = gt_1;
const lt = lt_1;
const eq = eq_1;
const neq = neq_1;
const gte = gte_1;
const lte = lte_1;
const cmp = cmp_1;
const coerce = coerce_1;
const Comparator = requireComparator();
const Range = requireRange();
const satisfies = satisfies_1;
const toComparators = toComparators_1;
const maxSatisfying = maxSatisfying_1;
const minSatisfying = minSatisfying_1;
const minVersion = minVersion_1;
const validRange = valid$1;
const outside = outside_1;
const gtr = gtr_1;
const ltr = ltr_1;
const intersects = intersects_1;
const simplifyRange = simplify;
const subset = subset_1;
var semver = {
  parse,
  valid,
  clean,
  inc,
  diff,
  major,
  minor,
  patch,
  prerelease,
  compare,
  rcompare,
  compareLoose,
  compareBuild,
  sort,
  rsort,
  gt,
  lt,
  eq,
  neq,
  gte,
  lte,
  cmp,
  coerce,
  Comparator,
  Range,
  satisfies,
  toComparators,
  maxSatisfying,
  minSatisfying,
  minVersion,
  validRange,
  outside,
  gtr,
  ltr,
  intersects,
  simplifyRange,
  subset,
  SemVer,
  re: internalRe.re,
  src: internalRe.src,
  tokens: internalRe.t,
  SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
  compareIdentifiers: identifiers.compareIdentifiers,
  rcompareIdentifiers: identifiers.rcompareIdentifiers,
};

var semver$1 = /*@__PURE__*/getDefaultExportFromCjs(semver);

function shouldUseTrustedInputForSegwit({ version, name, }) {
    if (name === "Decred")
        return false;
    if (name === "Exchange")
        return true;
    return semver$1.gte(version, "1.4.0");
}

var __awaiter$5 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const defaultsSignTransaction = {
    lockTime: DEFAULT_LOCKTIME,
    sigHashType: SIGHASH_ALL,
    segwit: false,
    additionals: [],
    onDeviceStreaming: _e => { },
    onDeviceSignatureGranted: () => { },
    onDeviceSignatureRequested: () => { },
};
function createTransaction(transport, arg) {
    return __awaiter$5(this, void 0, void 0, function* () {
        const signTx = Object.assign(Object.assign({}, defaultsSignTransaction), arg);
        const { inputs, associatedKeysets, changePath, outputScriptHex, lockTime, sigHashType, segwit, initialTimestamp, additionals, expiryHeight, onDeviceStreaming, onDeviceSignatureGranted, onDeviceSignatureRequested, } = signTx;
        let useTrustedInputForSegwit = signTx.useTrustedInputForSegwit;
        if (useTrustedInputForSegwit === undefined) {
            try {
                const a = yield getAppAndVersion(transport);
                useTrustedInputForSegwit = shouldUseTrustedInputForSegwit(a);
            }
            catch (e) {
                if (e.statusCode === 0x6d00) {
                    useTrustedInputForSegwit = false;
                }
                else {
                    throw e;
                }
            }
        }
        // loop: 0 or 1 (before and after)
        // i: index of the input being streamed
        // i goes on 0...n, inluding n. in order for the progress value to go to 1
        // we normalize the 2 loops to make a global percentage
        const notify = (loop, i) => {
            const { length } = inputs;
            if (length < 3)
                return; // there is not enough significant event to worth notifying (aka just use a spinner)
            const index = length * loop + i;
            const total = 2 * length;
            const progress = index / total;
            onDeviceStreaming({
                progress,
                total,
                index,
            });
        };
        const isDecred = additionals.includes("decred");
        const isZcash = additionals.includes("zcash");
        const isXST = additionals.includes("stealthcoin");
        const startTime = Date.now();
        const sapling = additionals.includes("sapling");
        const bech32 = segwit && additionals.includes("bech32");
        const useBip143 = segwit ||
            (!!additionals &&
                (additionals.includes("abc") ||
                    additionals.includes("gold") ||
                    additionals.includes("bip143"))) ||
            (!!expiryHeight && !isDecred);
        // Inputs are provided as arrays of [transaction, output_index, optional redeem script, optional sequence]
        // associatedKeysets are provided as arrays of [path]
        const lockTimeBuffer = buffer.Buffer.alloc(4);
        lockTimeBuffer.writeUInt32LE(lockTime, 0);
        const nullScript = buffer.Buffer.alloc(0);
        const nullPrevout = buffer.Buffer.alloc(0);
        const defaultVersion = buffer.Buffer.alloc(4);
        !!expiryHeight && !isDecred
            ? defaultVersion.writeUInt32LE(isZcash ? 0x80000005 : sapling ? 0x80000004 : 0x80000003, 0) // v5 format for zcash refer to https://zips.z.cash/zip-0225
            : isXST
                ? defaultVersion.writeUInt32LE(2, 0)
                : defaultVersion.writeUInt32LE(1, 0);
        // Default version to 2 for XST not to have timestamp
        const trustedInputs = [];
        const regularOutputs = [];
        const signatures = [];
        const publicKeys = [];
        let firstRun = true;
        const targetTransaction = {
            inputs: [],
            version: defaultVersion,
            timestamp: buffer.Buffer.alloc(0),
        };
        const getTrustedInputCall = useBip143 && !useTrustedInputForSegwit ? getTrustedInputBIP143 : getTrustedInput;
        const outputScript = buffer.Buffer.from(outputScriptHex, "hex");
        notify(0, 0);
        // first pass on inputs to get trusted inputs
        for (const input of inputs) {
            {
                const trustedInput = yield getTrustedInputCall(transport, input[1], input[0], additionals);
                log("hw", "got trustedInput=" + trustedInput);
                const sequence = buffer.Buffer.alloc(4);
                sequence.writeUInt32LE(input.length >= 4 && typeof input[3] === "number" ? input[3] : DEFAULT_SEQUENCE, 0);
                trustedInputs.push({
                    trustedInput: true,
                    value: buffer.Buffer.from(trustedInput, "hex"),
                    sequence,
                });
            }
            const { outputs } = input[0];
            const index = input[1];
            if (outputs && index <= outputs.length - 1) {
                regularOutputs.push(outputs[index]);
            }
            if (expiryHeight && !isDecred) {
                targetTransaction.nVersionGroupId = buffer.Buffer.from(
                // nVersionGroupId is 0x26A7270A for zcash from https://z.cash/upgrade/nu5/
                isZcash
                    ? [0x0a, 0x27, 0xa7, 0x26]
                    : sapling
                        ? [0x85, 0x20, 0x2f, 0x89]
                        : [0x70, 0x82, 0xc4, 0x03]);
                targetTransaction.nExpiryHeight = expiryHeight;
                // For sapling : valueBalance (8), nShieldedSpend (1), nShieldedOutput (1), nJoinSplit (1)
                // Overwinter : use nJoinSplit (1)
                targetTransaction.extraData = buffer.Buffer.from(sapling ? [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00] : [0x00]);
            }
            else if (isDecred) {
                targetTransaction.nExpiryHeight = expiryHeight;
            }
        }
        targetTransaction.inputs = inputs.map((input, idx) => {
            const sequence = buffer.Buffer.alloc(4);
            sequence.writeUInt32LE(input.length >= 4 && typeof input[3] === "number" ? input[3] : DEFAULT_SEQUENCE, 0);
            return {
                script: isZcash ? regularOutputs[idx].script : nullScript,
                prevout: nullPrevout,
                sequence,
            };
        });
        {
            // Collect public keys
            const result = [];
            for (let i = 0; i < inputs.length; i++) {
                const r = yield getWalletPublicKey(transport, {
                    path: associatedKeysets[i],
                });
                notify(0, i + 1);
                result.push(r);
            }
            for (let i = 0; i < result.length; i++) {
                publicKeys.push(compressPublicKey(buffer.Buffer.from(result[i].publicKey, "hex")));
            }
        }
        if (initialTimestamp !== undefined) {
            targetTransaction.timestamp = buffer.Buffer.alloc(4);
            targetTransaction.timestamp.writeUInt32LE(Math.floor(initialTimestamp + (Date.now() - startTime) / 1000), 0);
        }
        onDeviceSignatureRequested();
        if (useBip143) {
            // Do the first run with all inputs
            yield startUntrustedHashTransactionInput(transport, true, targetTransaction, trustedInputs, true, !!expiryHeight, additionals, useTrustedInputForSegwit);
            if (changePath) {
                yield provideOutputFullChangePath(transport, changePath);
            }
            yield hashOutputFull(transport, outputScript);
        }
        if (!!expiryHeight && !isDecred) {
            yield signTransaction(transport, "", lockTime, SIGHASH_ALL, expiryHeight);
        }
        // Do the second run with the individual transaction
        for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i];
            const script = inputs[i].length >= 3 && typeof input[2] === "string"
                ? buffer.Buffer.from(input[2], "hex")
                : !segwit
                    ? regularOutputs[i].script
                    : buffer.Buffer.concat([
                        buffer.Buffer.from([OP_DUP, OP_HASH160, HASH_SIZE]),
                        hashPublicKey(publicKeys[i]),
                        buffer.Buffer.from([OP_EQUALVERIFY, OP_CHECKSIG]),
                    ]);
            const pseudoTX = Object.assign({}, targetTransaction);
            const pseudoTrustedInputs = useBip143 ? [trustedInputs[i]] : trustedInputs;
            if (useBip143) {
                pseudoTX.inputs = [Object.assign(Object.assign({}, pseudoTX.inputs[i]), { script })];
            }
            else {
                pseudoTX.inputs[i].script = script;
            }
            yield startUntrustedHashTransactionInput(transport, !useBip143 && firstRun, pseudoTX, pseudoTrustedInputs, useBip143, !!expiryHeight && !isDecred, additionals, useTrustedInputForSegwit);
            if (!useBip143) {
                if (changePath) {
                    yield provideOutputFullChangePath(transport, changePath);
                }
                yield hashOutputFull(transport, outputScript, additionals);
            }
            if (firstRun) {
                onDeviceSignatureGranted();
                notify(1, 0);
            }
            const signature = yield signTransaction(transport, associatedKeysets[i], lockTime, sigHashType, expiryHeight, additionals);
            notify(1, i + 1);
            signatures.push(signature);
            targetTransaction.inputs[i].script = nullScript;
            if (firstRun) {
                firstRun = false;
            }
        }
        // Populate the final input scripts
        for (let i = 0; i < inputs.length; i++) {
            if (segwit) {
                targetTransaction.witness = buffer.Buffer.alloc(0);
                if (!bech32) {
                    targetTransaction.inputs[i].script = buffer.Buffer.concat([
                        buffer.Buffer.from("160014", "hex"),
                        hashPublicKey(publicKeys[i]),
                    ]);
                }
            }
            else {
                const signatureSize = buffer.Buffer.alloc(1);
                const keySize = buffer.Buffer.alloc(1);
                signatureSize[0] = signatures[i].length;
                keySize[0] = publicKeys[i].length;
                targetTransaction.inputs[i].script = buffer.Buffer.concat([
                    signatureSize,
                    signatures[i],
                    keySize,
                    publicKeys[i],
                ]);
            }
            const offset = useBip143 && !useTrustedInputForSegwit ? 0 : 4;
            targetTransaction.inputs[i].prevout = trustedInputs[i].value.slice(offset, offset + 0x24);
        }
        targetTransaction.locktime = lockTimeBuffer;
        let result = buffer.Buffer.concat([
            serializeTransaction(targetTransaction, false, targetTransaction.timestamp, additionals),
            outputScript,
        ]);
        if (segwit && !isDecred) {
            let witness = buffer.Buffer.alloc(0);
            for (let i = 0; i < inputs.length; i++) {
                const tmpScriptData = buffer.Buffer.concat([
                    buffer.Buffer.from("02", "hex"),
                    buffer.Buffer.from([signatures[i].length]),
                    signatures[i],
                    buffer.Buffer.from([publicKeys[i].length]),
                    publicKeys[i],
                ]);
                witness = buffer.Buffer.concat([witness, tmpScriptData]);
            }
            result = buffer.Buffer.concat([result, witness]);
        }
        // from to https://zips.z.cash/zip-0225, zcash is different with other coins, the lock_time and nExpiryHeight fields are before the inputs and outputs
        if (!isZcash) {
            result = buffer.Buffer.concat([result, lockTimeBuffer]);
            if (expiryHeight) {
                result = buffer.Buffer.concat([
                    result,
                    targetTransaction.nExpiryHeight || buffer.Buffer.alloc(0),
                    targetTransaction.extraData || buffer.Buffer.alloc(0),
                ]);
            }
        }
        if (isDecred) {
            let decredWitness = buffer.Buffer.from([targetTransaction.inputs.length]);
            inputs.forEach((input, inputIndex) => {
                decredWitness = buffer.Buffer.concat([
                    decredWitness,
                    buffer.Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
                    buffer.Buffer.from([0x00, 0x00, 0x00, 0x00]),
                    buffer.Buffer.from([0xff, 0xff, 0xff, 0xff]),
                    buffer.Buffer.from([targetTransaction.inputs[inputIndex].script.length]),
                    targetTransaction.inputs[inputIndex].script,
                ]);
            });
            result = buffer.Buffer.concat([result, decredWitness]);
        }
        if (isZcash) {
            result = buffer.Buffer.concat([result, buffer.Buffer.from([0x00, 0x00, 0x00])]);
        }
        return result.toString("hex");
    });
}

var __awaiter$4 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
function signMessage(transport, { path, messageHex, }) {
    return __awaiter$4(this, void 0, void 0, function* () {
        const paths = bippath.fromString(path).toPathArray();
        const message = buffer.Buffer.from(messageHex, "hex");
        let offset = 0;
        while (offset !== message.length) {
            const maxChunkSize = offset === 0 ? MAX_SCRIPT_BLOCK - 1 - paths.length * 4 - 4 : MAX_SCRIPT_BLOCK;
            const chunkSize = offset + maxChunkSize > message.length ? message.length - offset : maxChunkSize;
            const buffer$1 = buffer.Buffer.alloc(offset === 0 ? 1 + paths.length * 4 + 2 + chunkSize : chunkSize);
            if (offset === 0) {
                buffer$1[0] = paths.length;
                paths.forEach((element, index) => {
                    buffer$1.writeUInt32BE(element, 1 + 4 * index);
                });
                buffer$1.writeUInt16BE(message.length, 1 + 4 * paths.length);
                message.copy(buffer$1, 1 + 4 * paths.length + 2, offset, offset + chunkSize);
            }
            else {
                message.copy(buffer$1, 0, offset, offset + chunkSize);
            }
            yield transport.send(0xe0, 0x4e, 0x00, offset === 0 ? 0x01 : 0x80, buffer$1);
            offset += chunkSize;
        }
        const res = yield transport.send(0xe0, 0x4e, 0x80, 0x00, buffer.Buffer.from([0x00]));
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
            s,
        };
    });
}

var __awaiter$3 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/**
 * Bitcoin API.
 *
 * @example
 * import Btc from "@ledgerhq/hw-app-btc";
 * const btc = new Btc({ transport, currency: "zcash" });
 */
class BtcOld {
    constructor(transport) {
        this.transport = transport;
        this.derivationsCache = {};
    }
    derivatePath(path) {
        return __awaiter$3(this, void 0, void 0, function* () {
            if (this.derivationsCache[path])
                return this.derivationsCache[path];
            const res = yield getWalletPublicKey(this.transport, {
                path,
            });
            this.derivationsCache[path] = res;
            return res;
        });
    }
    getWalletXpub({ path, xpubVersion, }) {
        return __awaiter$3(this, void 0, void 0, function* () {
            const pathElements = pathStringToArray(path);
            const parentPath = pathElements.slice(0, -1);
            const parentDerivation = yield this.derivatePath(pathArrayToString(parentPath));
            const accountDerivation = yield this.derivatePath(path);
            const fingerprint = makeFingerprint(compressPublicKeySECP256(buffer.Buffer.from(parentDerivation.publicKey, "hex")));
            const xpub = makeXpub(xpubVersion, pathElements.length, fingerprint, pathElements[pathElements.length - 1], buffer.Buffer.from(accountDerivation.chainCode, "hex"), compressPublicKeySECP256(buffer.Buffer.from(accountDerivation.publicKey, "hex")));
            return xpub;
        });
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
        if ((opts === null || opts === void 0 ? void 0 : opts.format) === "bech32m") {
            throw new Error("Unsupported address format bech32m");
        }
        return getWalletPublicKey(this.transport, Object.assign(Object.assign({}, opts), { path }));
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
    createPaymentTransaction(arg) {
        if (arguments.length > 1) {
            throw new Error("@ledgerhq/hw-app-btc: createPaymentTransaction multi argument signature is deprecated. please switch to named parameters.");
        }
        return createTransaction(this.transport, arg);
    }
    signMessage({ path, messageHex }) {
        return __awaiter$3(this, void 0, void 0, function* () {
            return signMessage(this.transport, {
                path,
                messageHex,
            });
        });
    }
}
function makeFingerprint(compressedPubKey) {
    return hash160(compressedPubKey).slice(0, 4);
}
function asBufferUInt32BE(n) {
    const buf = buffer.Buffer.allocUnsafe(4);
    buf.writeUInt32BE(n, 0);
    return buf;
}
const compressPublicKeySECP256 = (publicKey) => buffer.Buffer.concat([buffer.Buffer.from([0x02 + (publicKey[64] & 0x01)]), publicKey.slice(1, 33)]);
function makeXpub(version, depth, parentFingerprint, index, chainCode, pubKey) {
    const indexBuffer = asBufferUInt32BE(index);
    indexBuffer[0] |= 0x80;
    const extendedKeyBytes = buffer.Buffer.concat([
        asBufferUInt32BE(version),
        buffer.Buffer.from([depth]),
        parentFingerprint,
        indexBuffer,
        chainCode,
        pubKey,
    ]);
    const checksum = hash256(extendedKeyBytes).slice(0, 4);
    return bs58.encode(buffer.Buffer.concat([extendedKeyBytes, checksum]));
}
function sha256(buffer) {
    return sha("sha256").update(buffer).digest();
}
function hash256(buffer) {
    return sha256(sha256(buffer));
}
function ripemd160(buffer) {
    return new RIPEMD160().update(buffer).digest();
}
function hash160(buffer) {
    return ripemd160(sha256(buffer));
}

/**
 * This implements "Merkelized Maps", documented at
 * https://github.com/LedgerHQ/app-bitcoin-new/blob/master/doc/merkle.md#merkleized-maps
 *
 * A merkelized map consist of two merkle trees, one for the keys of
 * a map and one for the values of the same map, thus the two merkle
 * trees have the same shape. The commitment is the number elements
 * in the map followed by the keys' merkle root followed by the
 * values' merkle root.
 */
class MerkleMap {
    /**
     * @param keys Sorted list of (unhashed) keys
     * @param values values, in corresponding order as the keys, and of equal length
     */
    constructor(keys, values) {
        if (keys.length != values.length) {
            throw new Error("keys and values should have the same length");
        }
        // Sanity check: verify that keys are actually sorted and with no duplicates
        for (let i = 0; i < keys.length - 1; i++) {
            if (keys[i].toString("hex") >= keys[i + 1].toString("hex")) {
                throw new Error("keys must be in strictly increasing order");
            }
        }
        this.keys = keys;
        this.keysTree = new Merkle(keys.map(k => hashLeaf(k)));
        this.values = values;
        this.valuesTree = new Merkle(values.map(v => hashLeaf(v)));
    }
    commitment() {
        // returns a buffer between 65 and 73 (included) bytes long
        return buffer.Buffer.concat([
            createVarint(this.keys.length),
            this.keysTree.getRoot(),
            this.valuesTree.getRoot(),
        ]);
    }
}

/**
 * This class merkelizes a PSBTv2, by merkelizing the different
 * maps of the psbt. This is used during the transaction signing process,
 * where the hardware app can request specific parts of the psbt from the
 * client code and be sure that the response data actually belong to the psbt.
 * The reason for this is the limited amount of memory available to the app,
 * so it can't always store the full psbt in memory.
 *
 * The signing process is documented at
 * https://github.com/LedgerHQ/app-bitcoin-new/blob/master/doc/bitcoin.md#sign_psbt
 */
class MerkelizedPsbt extends PsbtV2 {
    constructor(psbt) {
        super();
        this.inputMerkleMaps = [];
        this.outputMerkleMaps = [];
        psbt.copy(this);
        this.globalMerkleMap = MerkelizedPsbt.createMerkleMap(this.globalMap);
        for (let i = 0; i < this.getGlobalInputCount(); i++) {
            this.inputMerkleMaps.push(MerkelizedPsbt.createMerkleMap(this.inputMaps[i]));
        }
        this.inputMapCommitments = [...this.inputMerkleMaps.values()].map(v => v.commitment());
        for (let i = 0; i < this.getGlobalOutputCount(); i++) {
            this.outputMerkleMaps.push(MerkelizedPsbt.createMerkleMap(this.outputMaps[i]));
        }
        this.outputMapCommitments = [...this.outputMerkleMaps.values()].map(v => v.commitment());
    }
    // These public functions are for MerkelizedPsbt.
    getGlobalSize() {
        return this.globalMap.size;
    }
    getGlobalKeysValuesRoot() {
        return this.globalMerkleMap.commitment();
    }
    static createMerkleMap(map) {
        const sortedKeysStrings = [...map.keys()].sort();
        const values = sortedKeysStrings.map(k => {
            const v = map.get(k);
            if (!v) {
                throw new Error("No value for key " + k);
            }
            return v;
        });
        const sortedKeys = sortedKeysStrings.map(k => buffer.Buffer.from(k, "hex"));
        const merkleMap = new MerkleMap(sortedKeys, values);
        return merkleMap;
    }
}

var ClientCommandCode;
(function (ClientCommandCode) {
    ClientCommandCode[ClientCommandCode["YIELD"] = 16] = "YIELD";
    ClientCommandCode[ClientCommandCode["GET_PREIMAGE"] = 64] = "GET_PREIMAGE";
    ClientCommandCode[ClientCommandCode["GET_MERKLE_LEAF_PROOF"] = 65] = "GET_MERKLE_LEAF_PROOF";
    ClientCommandCode[ClientCommandCode["GET_MERKLE_LEAF_INDEX"] = 66] = "GET_MERKLE_LEAF_INDEX";
    ClientCommandCode[ClientCommandCode["GET_MORE_ELEMENTS"] = 160] = "GET_MORE_ELEMENTS";
})(ClientCommandCode || (ClientCommandCode = {}));
class ClientCommand {
}
class YieldCommand extends ClientCommand {
    constructor(results, progressCallback) {
        super();
        this.progressCallback = progressCallback;
        this.code = ClientCommandCode.YIELD;
        this.results = results;
    }
    execute(request) {
        this.results.push(buffer.Buffer.from(request.subarray(1)));
        this.progressCallback();
        return buffer.Buffer.from("");
    }
}
class GetPreimageCommand extends ClientCommand {
    constructor(known_preimages, queue) {
        super();
        this.code = ClientCommandCode.GET_PREIMAGE;
        this.known_preimages = known_preimages;
        this.queue = queue;
    }
    execute(request) {
        const req = buffer.Buffer.from(request.subarray(1));
        // we expect no more data to read
        if (req.length != 1 + 32) {
            throw new Error("Invalid request, unexpected trailing data");
        }
        if (req[0] != 0) {
            throw new Error("Unsupported request, the first byte should be 0");
        }
        // read the hash
        const hash = buffer.Buffer.alloc(32);
        for (let i = 0; i < 32; i++) {
            hash[i] = req[1 + i];
        }
        const req_hash_hex = hash.toString("hex");
        const known_preimage = this.known_preimages.get(req_hash_hex);
        if (known_preimage != undefined) {
            const preimage_len_varint = createVarint(known_preimage.length);
            // We can send at most 255 - len(preimage_len_out) - 1 bytes in a single message;
            // the rest will be stored in the queue for GET_MORE_ELEMENTS
            const max_payload_size = 255 - preimage_len_varint.length - 1;
            const payload_size = Math.min(max_payload_size, known_preimage.length);
            if (payload_size < known_preimage.length) {
                for (let i = payload_size; i < known_preimage.length; i++) {
                    this.queue.push(buffer.Buffer.from([known_preimage[i]]));
                }
            }
            return buffer.Buffer.concat([
                preimage_len_varint,
                buffer.Buffer.from([payload_size]),
                buffer.Buffer.from(known_preimage.subarray(0, payload_size)),
            ]);
        }
        throw Error(`Requested unknown preimage for: ${req_hash_hex}`);
    }
}
class GetMerkleLeafProofCommand extends ClientCommand {
    constructor(known_trees, queue) {
        super();
        this.code = ClientCommandCode.GET_MERKLE_LEAF_PROOF;
        this.known_trees = known_trees;
        this.queue = queue;
    }
    execute(request) {
        const req = buffer.Buffer.from(request.subarray(1));
        if (req.length < 32 + 1 + 1) {
            throw new Error("Invalid request, expected at least 34 bytes");
        }
        const reqBuf = new BufferReader(req);
        const hash = reqBuf.readSlice(32);
        const hash_hex = hash.toString("hex");
        let tree_size;
        let leaf_index;
        try {
            tree_size = reqBuf.readVarInt();
            leaf_index = reqBuf.readVarInt();
        }
        catch (e) {
            throw new Error("Invalid request, couldn't parse tree_size or leaf_index");
        }
        const mt = this.known_trees.get(hash_hex);
        if (!mt) {
            throw Error(`Requested Merkle leaf proof for unknown tree: ${hash_hex}`);
        }
        if (leaf_index >= tree_size || mt.size() != tree_size) {
            throw Error("Invalid index or tree size.");
        }
        if (this.queue.length != 0) {
            throw Error("This command should not execute when the queue is not empty.");
        }
        const proof = mt.getProof(leaf_index);
        const n_response_elements = Math.min(Math.floor((255 - 32 - 1 - 1) / 32), proof.length);
        const n_leftover_elements = proof.length - n_response_elements;
        // Add to the queue any proof elements that do not fit the response
        if (n_leftover_elements > 0) {
            this.queue.push(...proof.slice(-n_leftover_elements));
        }
        return buffer.Buffer.concat([
            mt.getLeafHash(leaf_index),
            buffer.Buffer.from([proof.length]),
            buffer.Buffer.from([n_response_elements]),
            ...proof.slice(0, n_response_elements),
        ]);
    }
}
class GetMerkleLeafIndexCommand extends ClientCommand {
    constructor(known_trees) {
        super();
        this.code = ClientCommandCode.GET_MERKLE_LEAF_INDEX;
        this.known_trees = known_trees;
    }
    execute(request) {
        const req = buffer.Buffer.from(request.subarray(1));
        if (req.length != 32 + 32) {
            throw new Error("Invalid request, unexpected trailing data");
        }
        // read the root hash
        const root_hash = buffer.Buffer.alloc(32);
        for (let i = 0; i < 32; i++) {
            root_hash[i] = req.readUInt8(i);
        }
        const root_hash_hex = root_hash.toString("hex");
        // read the leaf hash
        const leef_hash = buffer.Buffer.alloc(32);
        for (let i = 0; i < 32; i++) {
            leef_hash[i] = req.readUInt8(32 + i);
        }
        const leef_hash_hex = leef_hash.toString("hex");
        const mt = this.known_trees.get(root_hash_hex);
        if (!mt) {
            throw Error(`Requested Merkle leaf index for unknown root: ${root_hash_hex}`);
        }
        let leaf_index = 0;
        let found = 0;
        for (let i = 0; i < mt.size(); i++) {
            if (mt.getLeafHash(i).toString("hex") == leef_hash_hex) {
                found = 1;
                leaf_index = i;
                break;
            }
        }
        return buffer.Buffer.concat([buffer.Buffer.from([found]), createVarint(leaf_index)]);
    }
}
class GetMoreElementsCommand extends ClientCommand {
    constructor(queue) {
        super();
        this.code = ClientCommandCode.GET_MORE_ELEMENTS;
        this.queue = queue;
    }
    execute(request) {
        if (request.length != 1) {
            throw new Error("Invalid request, unexpected trailing data");
        }
        if (this.queue.length === 0) {
            throw new Error("No elements to get");
        }
        // all elements should have the same length
        const element_len = this.queue[0].length;
        if (this.queue.some(el => el.length != element_len)) {
            throw new Error("The queue contains elements with different byte length, which is not expected");
        }
        const max_elements = Math.floor(253 / element_len);
        const n_returned_elements = Math.min(max_elements, this.queue.length);
        const returned_elements = this.queue.splice(0, n_returned_elements);
        return buffer.Buffer.concat([
            buffer.Buffer.from([n_returned_elements]),
            buffer.Buffer.from([element_len]),
            ...returned_elements,
        ]);
    }
}
/**
 * This class will dispatch a client command coming from the hardware device to
 * the appropriate client command implementation. Those client commands
 * typically requests data from a merkle tree or merkelized maps.
 *
 * A ClientCommandInterpreter is prepared by adding the merkle trees and
 * merkelized maps it should be able to serve to the hardware device. This class
 * doesn't know anything about the semantics of the data it holds, it just
 * serves merkle data. It doesn't even know in what context it is being
 * executed, ie SignPsbt, getWalletAddress, etc.
 *
 * If the command yelds results to the client, as signPsbt does, the yielded
 * data will be accessible after the command completed by calling getYielded(),
 * which will return the yields in the same order as they came in.
 */
class ClientCommandInterpreter {
    constructor(progressCallback) {
        this.roots = new Map();
        this.preimages = new Map();
        this.yielded = [];
        this.queue = [];
        this.commands = new Map();
        const commands = [
            new YieldCommand(this.yielded, progressCallback),
            new GetPreimageCommand(this.preimages, this.queue),
            new GetMerkleLeafIndexCommand(this.roots),
            new GetMerkleLeafProofCommand(this.roots, this.queue),
            new GetMoreElementsCommand(this.queue),
        ];
        for (const cmd of commands) {
            if (this.commands.has(cmd.code)) {
                throw new Error(`Multiple commands with code ${cmd.code}`);
            }
            this.commands.set(cmd.code, cmd);
        }
    }
    getYielded() {
        return this.yielded;
    }
    addKnownPreimage(preimage) {
        this.preimages.set(crypto_1.sha256(preimage).toString("hex"), preimage);
    }
    addKnownList(elements) {
        for (const el of elements) {
            const preimage = buffer.Buffer.concat([buffer.Buffer.from([0]), el]);
            this.addKnownPreimage(preimage);
        }
        const mt = new Merkle(elements.map(el => hashLeaf(el)));
        this.roots.set(mt.getRoot().toString("hex"), mt);
    }
    addKnownMapping(mm) {
        this.addKnownList(mm.keys);
        this.addKnownList(mm.values);
    }
    execute(request) {
        if (request.length == 0) {
            throw new Error("Unexpected empty command");
        }
        const cmdCode = request[0];
        const cmd = this.commands.get(cmdCode);
        if (!cmd) {
            throw new Error(`Unexpected command code ${cmdCode}`);
        }
        return cmd.execute(request);
    }
}

var __awaiter$2 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const CLA_BTC = 0xe1;
const CLA_FRAMEWORK = 0xf8;
var BitcoinIns;
(function (BitcoinIns) {
    BitcoinIns[BitcoinIns["GET_PUBKEY"] = 0] = "GET_PUBKEY";
    // GET_ADDRESS = 0x01, // Removed from app
    BitcoinIns[BitcoinIns["REGISTER_WALLET"] = 2] = "REGISTER_WALLET";
    BitcoinIns[BitcoinIns["GET_WALLET_ADDRESS"] = 3] = "GET_WALLET_ADDRESS";
    BitcoinIns[BitcoinIns["SIGN_PSBT"] = 4] = "SIGN_PSBT";
    BitcoinIns[BitcoinIns["GET_MASTER_FINGERPRINT"] = 5] = "GET_MASTER_FINGERPRINT";
    BitcoinIns[BitcoinIns["SIGN_MESSAGE"] = 16] = "SIGN_MESSAGE";
})(BitcoinIns || (BitcoinIns = {}));
var FrameworkIns;
(function (FrameworkIns) {
    FrameworkIns[FrameworkIns["CONTINUE_INTERRUPTED"] = 1] = "CONTINUE_INTERRUPTED";
})(FrameworkIns || (FrameworkIns = {}));
/**
 * This class encapsulates the APDU protocol documented at
 * https://github.com/LedgerHQ/app-bitcoin-new/blob/master/doc/bitcoin.md
 */
class AppClient {
    constructor(transport) {
        this.transport = transport;
    }
    makeRequest(ins, data, cci) {
        return __awaiter$2(this, void 0, void 0, function* () {
            let response = yield this.transport.send(CLA_BTC, ins, 0, 0, data, [0x9000, 0xe000]);
            while (response.readUInt16BE(response.length - 2) === 0xe000) {
                if (!cci) {
                    throw new Error("Unexpected SW_INTERRUPTED_EXECUTION");
                }
                const hwRequest = response.slice(0, -2);
                const commandResponse = cci.execute(hwRequest);
                response = yield this.transport.send(CLA_FRAMEWORK, FrameworkIns.CONTINUE_INTERRUPTED, 0, 0, commandResponse, [0x9000, 0xe000]);
            }
            return response.slice(0, -2); // drop the status word (can only be 0x9000 at this point)
        });
    }
    getExtendedPubkey(display, pathElements) {
        return __awaiter$2(this, void 0, void 0, function* () {
            if (pathElements.length > 6) {
                throw new Error("Path too long. At most 6 levels allowed.");
            }
            const response = yield this.makeRequest(BitcoinIns.GET_PUBKEY, buffer.Buffer.concat([buffer.Buffer.from(display ? [1] : [0]), pathElementsToBuffer(pathElements)]));
            return response.toString("ascii");
        });
    }
    getWalletAddress(walletPolicy, walletHMAC, change, addressIndex, display) {
        return __awaiter$2(this, void 0, void 0, function* () {
            if (change !== 0 && change !== 1)
                throw new Error("Change can only be 0 or 1");
            if (addressIndex < 0 || !Number.isInteger(addressIndex))
                throw new Error("Invalid address index");
            if (walletHMAC != null && walletHMAC.length != 32) {
                throw new Error("Invalid HMAC length");
            }
            const clientInterpreter = new ClientCommandInterpreter(() => { });
            clientInterpreter.addKnownList(walletPolicy.keys.map(k => buffer.Buffer.from(k, "ascii")));
            clientInterpreter.addKnownPreimage(walletPolicy.serialize());
            const addressIndexBuffer = buffer.Buffer.alloc(4);
            addressIndexBuffer.writeUInt32BE(addressIndex, 0);
            const response = yield this.makeRequest(BitcoinIns.GET_WALLET_ADDRESS, buffer.Buffer.concat([
                buffer.Buffer.from(display ? [1] : [0]),
                walletPolicy.getWalletId(),
                walletHMAC || buffer.Buffer.alloc(32, 0),
                buffer.Buffer.from([change]),
                addressIndexBuffer,
            ]), clientInterpreter);
            return response.toString("ascii");
        });
    }
    signPsbt(psbt, walletPolicy, walletHMAC, progressCallback) {
        return __awaiter$2(this, void 0, void 0, function* () {
            const merkelizedPsbt = new MerkelizedPsbt(psbt);
            if (walletHMAC != null && walletHMAC.length != 32) {
                throw new Error("Invalid HMAC length");
            }
            const clientInterpreter = new ClientCommandInterpreter(progressCallback);
            // prepare ClientCommandInterpreter
            clientInterpreter.addKnownList(walletPolicy.keys.map(k => buffer.Buffer.from(k, "ascii")));
            clientInterpreter.addKnownPreimage(walletPolicy.serialize());
            clientInterpreter.addKnownMapping(merkelizedPsbt.globalMerkleMap);
            for (const map of merkelizedPsbt.inputMerkleMaps) {
                clientInterpreter.addKnownMapping(map);
            }
            for (const map of merkelizedPsbt.outputMerkleMaps) {
                clientInterpreter.addKnownMapping(map);
            }
            clientInterpreter.addKnownList(merkelizedPsbt.inputMapCommitments);
            const inputMapsRoot = new Merkle(merkelizedPsbt.inputMapCommitments.map(m => hashLeaf(m))).getRoot();
            clientInterpreter.addKnownList(merkelizedPsbt.outputMapCommitments);
            const outputMapsRoot = new Merkle(merkelizedPsbt.outputMapCommitments.map(m => hashLeaf(m))).getRoot();
            yield this.makeRequest(BitcoinIns.SIGN_PSBT, buffer.Buffer.concat([
                merkelizedPsbt.getGlobalKeysValuesRoot(),
                createVarint(merkelizedPsbt.getGlobalInputCount()),
                inputMapsRoot,
                createVarint(merkelizedPsbt.getGlobalOutputCount()),
                outputMapsRoot,
                walletPolicy.getWalletId(),
                walletHMAC || buffer.Buffer.alloc(32, 0),
            ]), clientInterpreter);
            const yielded = clientInterpreter.getYielded();
            const ret = new Map();
            for (const inputAndSig of yielded) {
                ret.set(inputAndSig[0], inputAndSig.slice(1));
            }
            return ret;
        });
    }
    getMasterFingerprint() {
        return __awaiter$2(this, void 0, void 0, function* () {
            return this.makeRequest(BitcoinIns.GET_MASTER_FINGERPRINT, buffer.Buffer.from([]));
        });
    }
    signMessage(message, pathElements) {
        return __awaiter$2(this, void 0, void 0, function* () {
            if (pathElements.length > 6) {
                throw new Error("Path too long. At most 6 levels allowed.");
            }
            const clientInterpreter = new ClientCommandInterpreter(() => { });
            // prepare ClientCommandInterpreter
            const nChunks = Math.ceil(message.length / 64);
            const chunks = [];
            for (let i = 0; i < nChunks; i++) {
                chunks.push(message.subarray(64 * i, 64 * i + 64));
            }
            clientInterpreter.addKnownList(chunks);
            const chunksRoot = new Merkle(chunks.map(m => hashLeaf(m))).getRoot();
            const response = yield this.makeRequest(BitcoinIns.SIGN_MESSAGE, buffer.Buffer.concat([pathElementsToBuffer(pathElements), createVarint(message.length), chunksRoot]), clientInterpreter);
            return response.toString("base64");
        });
    }
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
    transaction.inputs.forEach(({ prevout, script, sequence }, i) => {
        str += `\ninput ${i}:`;
        str += ` prevout ${prevout.toString("hex")}`;
        str += ` script ${script.toString("hex")}`;
        str += ` sequence ${sequence.toString("hex")}`;
    });
    (transaction.outputs || []).forEach(({ amount, script }, i) => {
        str += `\noutput ${i}:`;
        str += ` amount ${amount.toString("hex")}`;
        str += ` script ${script.toString("hex")}`;
    });
    return str;
}

function splitTransaction(transactionHex, isSegwitSupported = false, hasTimestamp = false, hasExtraData = false, additionals = []) {
    const inputs = [];
    const outputs = [];
    let witness = false;
    let offset = 0;
    let timestamp = buffer.Buffer.alloc(0);
    let nExpiryHeight = buffer.Buffer.alloc(0);
    let nVersionGroupId = buffer.Buffer.alloc(0);
    let extraData = buffer.Buffer.alloc(0);
    let witnessScript, locktime;
    const isDecred = additionals.includes("decred");
    const isZencash = additionals.includes("zencash");
    const isZcash = additionals.includes("zcash");
    const transaction = buffer.Buffer.from(transactionHex, "hex");
    const version = transaction.slice(offset, offset + 4);
    const overwinter = version.equals(buffer.Buffer.from([0x03, 0x00, 0x00, 0x80])) ||
        version.equals(buffer.Buffer.from([0x04, 0x00, 0x00, 0x80])) ||
        version.equals(buffer.Buffer.from([0x05, 0x00, 0x00, 0x80]));
    const isZcashv5 = isZcash && version.equals(buffer.Buffer.from([0x05, 0x00, 0x00, 0x80]));
    offset += 4;
    if (!hasTimestamp &&
        isSegwitSupported &&
        transaction[offset] === 0 &&
        transaction[offset + 1] !== 0 &&
        !isZencash) {
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
    if (isZcashv5) {
        locktime = transaction.slice(offset + 4, offset + 8);
        nExpiryHeight = transaction.slice(offset + 8, offset + 12);
        offset += 12;
    }
    let varint = getVarint(transaction, offset);
    const numberInputs = varint[0];
    offset += varint[1];
    for (let i = 0; i < numberInputs; i++) {
        const prevout = transaction.slice(offset, offset + 36);
        offset += 36;
        let script = buffer.Buffer.alloc(0);
        let tree = buffer.Buffer.alloc(0);
        //No script for decred, it has a witness
        if (!isDecred) {
            varint = getVarint(transaction, offset);
            offset += varint[1];
            script = transaction.slice(offset, offset + varint[0]);
            offset += varint[0];
        }
        else {
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
            tree,
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
            script,
        });
    }
    if (witness) {
        witnessScript = transaction.slice(offset, -4);
        locktime = transaction.slice(transaction.length - 4);
    }
    else if (!isZcashv5) {
        locktime = transaction.slice(offset, offset + 4);
    }
    offset += 4;
    if ((overwinter || isDecred) && !isZcashv5) {
        nExpiryHeight = transaction.slice(offset, offset + 4);
        offset += 4;
    }
    if (hasExtraData) {
        extraData = transaction.slice(offset);
    }
    //Get witnesses for Decred
    if (isDecred) {
        varint = getVarint(transaction, offset);
        offset += varint[1];
        if (varint[0] !== numberInputs) {
            throw new Error("splitTransaction: incoherent number of witnesses");
        }
        for (let i = 0; i < numberInputs; i++) {
            //amount
            offset += 8;
            //block height
            offset += 4;
            //block index
            offset += 4;
            //Script size
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
        extraData,
    };
    log("btc", `splitTransaction ${transactionHex}:\n${formatTransactionDebug(t)}`);
    return t;
}

var __awaiter$1 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const defaultArg = {
    lockTime: DEFAULT_LOCKTIME,
    sigHashType: SIGHASH_ALL,
    segwit: false,
    transactionVersion: DEFAULT_VERSION,
};
function signP2SHTransaction(transport, arg) {
    return __awaiter$1(this, void 0, void 0, function* () {
        const { inputs, associatedKeysets, outputScriptHex, lockTime, sigHashType, segwit, transactionVersion, } = Object.assign(Object.assign({}, defaultArg), arg);
        // Inputs are provided as arrays of [transaction, output_index, redeem script, optional sequence]
        // associatedKeysets are provided as arrays of [path]
        const nullScript = buffer.Buffer.alloc(0);
        const nullPrevout = buffer.Buffer.alloc(0);
        const defaultVersion = buffer.Buffer.alloc(4);
        defaultVersion.writeUInt32LE(transactionVersion, 0);
        const trustedInputs = [];
        const regularOutputs = [];
        const signatures = [];
        let firstRun = true;
        const targetTransaction = {
            inputs: [],
            version: defaultVersion,
        };
        const getTrustedInputCall = segwit ? getTrustedInputBIP143 : getTrustedInput;
        const outputScript = buffer.Buffer.from(outputScriptHex, "hex");
        for (const input of inputs) {
            {
                const trustedInput = yield getTrustedInputCall(transport, input[1], input[0]);
                const sequence = buffer.Buffer.alloc(4);
                sequence.writeUInt32LE(input.length >= 4 && typeof input[3] === "number" ? input[3] : DEFAULT_SEQUENCE, 0);
                trustedInputs.push({
                    trustedInput: false,
                    value: segwit
                        ? buffer.Buffer.from(trustedInput, "hex")
                        : buffer.Buffer.from(trustedInput, "hex").slice(4, 4 + 0x24),
                    sequence,
                });
            }
            const { outputs } = input[0];
            const index = input[1];
            if (outputs && index <= outputs.length - 1) {
                regularOutputs.push(outputs[index]);
            }
        }
        // Pre-build the target transaction
        for (let i = 0; i < inputs.length; i++) {
            const sequence = buffer.Buffer.alloc(4);
            sequence.writeUInt32LE(inputs[i].length >= 4 && typeof inputs[i][3] === "number"
                ? inputs[i][3]
                : DEFAULT_SEQUENCE, 0);
            targetTransaction.inputs.push({
                script: nullScript,
                prevout: nullPrevout,
                sequence,
            });
        }
        if (segwit) {
            yield startUntrustedHashTransactionInput(transport, true, targetTransaction, trustedInputs, true);
            yield hashOutputFull(transport, outputScript);
        }
        for (let i = 0; i < inputs.length; i++) {
            const input = inputs[i];
            const script = inputs[i].length >= 3 && typeof input[2] === "string"
                ? buffer.Buffer.from(input[2], "hex")
                : regularOutputs[i].script;
            const pseudoTX = Object.assign({}, targetTransaction);
            const pseudoTrustedInputs = segwit ? [trustedInputs[i]] : trustedInputs;
            if (segwit) {
                pseudoTX.inputs = [Object.assign(Object.assign({}, pseudoTX.inputs[i]), { script })];
            }
            else {
                pseudoTX.inputs[i].script = script;
            }
            yield startUntrustedHashTransactionInput(transport, !segwit && firstRun, pseudoTX, pseudoTrustedInputs, segwit);
            if (!segwit) {
                yield hashOutputFull(transport, outputScript);
            }
            const signature = yield signTransaction(transport, associatedKeysets[i], lockTime, sigHashType);
            signatures.push(segwit ? signature.toString("hex") : signature.slice(0, signature.length - 1).toString("hex"));
            targetTransaction.inputs[i].script = nullScript;
            if (firstRun) {
                firstRun = false;
            }
        }
        return signatures;
    });
}

var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/**
 * Bitcoin API.
 *
 * @example
 * import Btc from "@ledgerhq/hw-app-btc";
 * const btc = new Btc({ transport, currency: "bitcoin" });
 */
class Btc {
    constructor({ transport, scrambleKey = "BTC", currency = "bitcoin", }) {
        this._transport = transport;
        this._transport.decorateAppAPIMethods(this, [
            "getWalletXpub",
            "getWalletPublicKey",
            "signP2SHTransaction",
            "signMessage",
            "createPaymentTransaction",
            "getTrustedInput",
            "getTrustedInputBIP143",
        ], scrambleKey);
        // new APDU (nano app API) for bitcoin and old APDU for altcoin
        if (currency === "bitcoin" || currency === "bitcoin_testnet") {
            this._impl = new BtcNew(new AppClient(this._transport));
        }
        else {
            this._impl = new BtcOld(this._transport);
        }
    }
    /**
     * Get an XPUB with a ledger device
     * @param arg derivation parameter
     * - path: a BIP 32 path of the account level. e.g. `84'/0'/0'`
     * - xpubVersion: the XPUBVersion of the coin used. (use @ledgerhq/currencies if needed)
     * @returns XPUB of the account
     */
    getWalletXpub(arg) {
        return this.changeImplIfNecessary().then(impl => {
            return impl.getWalletXpub(arg);
        });
    }
    /**
     * @param path a BIP 32 path
     * @param options an object with optional these fields:
     *
     * - verify (boolean) will ask user to confirm the address on the device
     *
     * - format ("legacy" | "p2sh" | "bech32" | "bech32m" | "cashaddr") to use different bitcoin address formatter.
     *
     * NB The normal usage is to use:
     *
     * - legacy format with 44' paths
     *
     * - p2sh format with 49' paths
     *
     * - bech32 format with 84' paths
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
                // eslint-disable-next-line prefer-rest-params
                format: arguments[2] ? "p2sh" : "legacy",
            };
        }
        else {
            options = opts || {};
        }
        return this.changeImplIfNecessary().then(impl => {
            return impl.getWalletPublicKey(path, options);
        });
    }
    /**
     * You can sign a message according to the Bitcoin Signature format and retrieve v, r, s given the message and the BIP 32 path of the account to sign.
     * @example
     btc.signMessage("44'/60'/0'/0'/0", Buffer.from("test").toString("hex")).then(function(result) {
       var v = result['v'] + 27 + 4;
       var signature = Buffer.from(v.toString(16) + result['r'] + result['s'], 'hex').toString('base64');
       console.log("Signature : " + signature);
     }).catch(function(ex) {console.log(ex);});
     */
    signMessage(path, messageHex) {
        return this.changeImplIfNecessary().then(impl => {
            return impl.signMessage({
                path,
                messageHex,
            });
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
     * @param outputScriptHex is the hexadecimal serialized outputs of the transaction to sign, including leading vararg voutCount
     * @param lockTime is the optional lockTime of the transaction to sign, or default (0)
     * @param sigHashType is the hash type of the transaction to sign, or default (all)
     * @param segwit is an optional boolean indicating wether to use segwit or not. This includes wrapped segwit.
     * @param initialTimestamp is an optional timestamp of the function call to use for coins that necessitate timestamps only, (not the one that the tx will include)
     * @param additionals list of additionnal options
     *
     * - "bech32" for spending native segwit outputs
     * - "bech32m" for spending segwit v1+ outputs
     * - "abc" for bch
     * - "gold" for btg
     * - "bipxxx" for using BIPxxx
     * - "sapling" to indicate a zec transaction is supporting sapling (to be set over block 419200)
     * @param expiryHeight is an optional Buffer for zec overwinter / sapling Txs
     * @param useTrustedInputForSegwit trust inputs for segwit transactions. If app version >= 1.4.0 this should be true.
     * @return the signed transaction ready to be broadcast
     * @example
    btc.createTransaction({
     inputs: [ [tx1, 1] ],
     associatedKeysets: ["0'/0/0"],
     outputScriptHex: "01905f0100000000001976a91472a5d75c8d2d0565b656a5232703b167d50d5a2b88ac"
    }).then(res => ...);
     */
    createPaymentTransaction(arg) {
        if (arguments.length > 1) {
            throw new Error("@ledgerhq/hw-app-btc: createPaymentTransaction multi argument signature is deprecated. please switch to named parameters.");
        }
        return this.changeImplIfNecessary().then(impl => {
            return impl.createPaymentTransaction(arg);
        });
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
        return signP2SHTransaction(this._transport, arg);
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
        return getTrustedInput(this._transport, indexLookup, transaction, additionals);
    }
    getTrustedInputBIP143(indexLookup, transaction, additionals = []) {
        return getTrustedInputBIP143(this._transport, indexLookup, transaction, additionals);
    }
    changeImplIfNecessary() {
        return __awaiter(this, void 0, void 0, function* () {
            // if BtcOld was instantiated, stick with it
            if (this._impl instanceof BtcOld)
                return this._impl;
            const appAndVersion = yield getAppAndVersion(this._transport);
            let isBtcLegacy = true; // default for all altcoins
            if (appAndVersion.name === "Bitcoin" || appAndVersion.name === "Bitcoin Test") {
                const [major, minor] = appAndVersion.version.split(".");
                // we use the legacy protocol for versions below 2.1.0 of the Bitcoin app.
                isBtcLegacy = parseInt(major) <= 1 || (parseInt(major) == 2 && parseInt(minor) == 0);
            }
            else if (appAndVersion.name === "Bitcoin Legacy" ||
                appAndVersion.name === "Bitcoin Test Legacy") {
                // the "Bitcoin Legacy" and "Bitcoin Testnet Legacy" app use the legacy protocol, regardless of the version
                isBtcLegacy = true;
            }
            else if (appAndVersion.name === "Exchange") {
                // We can't query the version of the Bitcoin app if we're coming from Exchange;
                // therefore, we use a workaround to distinguish legacy and new versions.
                // This can be removed once Ledger Live enforces minimum bitcoin version >= 2.1.0.
                isBtcLegacy = yield checkIsBtcLegacy(this._transport);
            }
            if (isBtcLegacy) {
                this._impl = new BtcOld(this._transport);
            }
            return this._impl;
        });
    }
}

export { Btc as default };
//# sourceMappingURL=lazy-chunk-Btc.es.js.map
