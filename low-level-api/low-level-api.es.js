// Constant shared between the low-level-api and the high-level-api.
// As a separate file to be able to use these constants in the main chunk without the need to import the entire lazy
// chunks of the low level api, and to avoid circular dependencies between main entry and other files.
var NimiqVersion;
(function (NimiqVersion) {
    NimiqVersion["ALBATROSS"] = "albatross";
    NimiqVersion["LEGACY"] = "legacy";
})(NimiqVersion || (NimiqVersion = {}));

function isNimiqLegacy(core) {
    // Note that checking for core.Version.CORE_JS_VERSION would be nicer, but it's unfortunately not available in the
    // web-offline variant.
    return 'GenesisConfig' in core && core.GenesisConfig.CONFIGS.main.NETWORK_ID === 42;
}
async function loadNimiq(nimiqVersion, inlcudeNimiqLegacyCryptography, preloadWasm = true) {
    const [Nimiq] = await Promise.all(nimiqVersion === NimiqVersion.ALBATROSS
        ? [loadNimiqAlbatrossCore(preloadWasm)]
        : [
            loadNimiqLegacyCore(),
            ...(inlcudeNimiqLegacyCryptography ? [loadNimiqLegacyCryptography(preloadWasm)] : []),
        ]);
    return Nimiq;
}
const isNimiqAlbatrossHub = typeof loadAlbatross !== 'undefined' && (
// Running on Hub domain.
/^hub\.(?:pos\.)?nimiq(?:-testnet)?\.com$/.test(window.location.hostname)
    // Or running on localhost:8080 or BrowserStack's bs-local.com:8080 which is where Hub dev versions are run.
    || /^(?:localhost|bs-local\.com):8080$/.test(window.location.host));
const nimiqCoreBasePath = isNimiqAlbatrossHub
    // On a Nimiq Hub with Albatross support, use the Hub's copy of the core (copied from @nimiq/albatross-wasm in the
    // Hub's vue.config.js, which is an alias for @nimiq/core@next), same as the Hub itself is doing, to avoid using and
    // loading an additional version.
    ? '/albatross-client/web/'
    // In other cases load @nimiq/core-web@next from jsdelivr. Load from cdn to avoid bundling a copy of core if it's
    // not needed. This way, we also don't need to handle the wasm file in the rollup config.
    : 'https://cdn.jsdelivr.net/npm/@nimiq/core@next/web/';
let nimiqCorePromise = null;
async function loadNimiqAlbatrossCore(preloadWasm = true) {
    nimiqCorePromise = nimiqCorePromise || (async () => {
        try {
            if (preloadWasm) {
                // Preload wasm in parallel. We only need the main wasm, not the Client or worker.
                // No integrity hash here, because main-wasm/index.js loads the wasm without integrity hash.
                preloadAsset(`${nimiqCoreBasePath}main-wasm/index_bg.wasm`, 'fetch', true);
            }
            // Note: we don't import /web/index.js or run the Hub's loadAlbatross because we don't need the Client which
            // depends on and loads the worker, including the worker wasm, and is auto-instantiated in /web/index.js. We
            // only load the main wasm handler and initialize it, which loads the main wasm. Note that these are the
            // exact same files as loaded by the Hub, i.e. there is no double loading happening as files will be already
            // cached. Also, calling init again when the wasm is already initialized, does not unnecessarily initialize
            // or fetch anything again.
            const Nimiq = await import(`${nimiqCoreBasePath}main-wasm/index.js`);
            const { default: init } = Nimiq;
            await init();
            return Nimiq;
        }
        catch (e) {
            nimiqCorePromise = null;
            throw e;
        }
    })();
    return nimiqCorePromise;
}
const nimiqLegacyCoreBasePath = window.location.hostname.endsWith('.nimiq.com')
    // On the nimiq.com domain use cdn.nimiq.com.
    ? 'https://cdn.nimiq.com/'
    // On other domains use jsdelivr instead of nimiq cdn to avoid getting blocked by ad blockers.
    : 'https://cdn.jsdelivr.net/npm/@nimiq/core-web/';
let nimiqLegacyCorePromise = null;
let nimiqLegacyCryptographyPromise = null;
/**
 * Lazy-load the Nimiq core api from the cdn server if it's not loaded yet.
 */
async function loadNimiqLegacyCore(coreVariant = 'web-offline') {
    // Return global Nimiq if already loaded from @nimiq/core-web, for example in Nimiq Hub.
    if (typeof Nimiq !== 'undefined')
        return Nimiq;
    nimiqLegacyCorePromise = nimiqLegacyCorePromise || new Promise((resolve, reject) => {
        console.warn('Support for Nimiq Legacy is deprecated and will be removed in the future.');
        const $head = document.getElementsByTagName('head')[0];
        const $script = document.createElement('script');
        $script.type = 'text/javascript';
        $script.onload = () => {
            $script.parentNode.removeChild($script);
            resolve();
        };
        $script.onerror = (e) => {
            $script.parentNode.removeChild($script);
            reject(e);
        };
        $script.src = `${nimiqLegacyCoreBasePath}${coreVariant}.js`;
        $head.appendChild($script);
    }).then(() => Nimiq, // The Nimiq global has been set by the legacy Core.
    (e) => {
        nimiqLegacyCorePromise = null;
        return Promise.reject(e);
    });
    return nimiqLegacyCorePromise;
}
/**
 * Load the WebAssembly and module for cryptographic functions. You will have to do this before calculating hashes,
 * deriving keys or addresses, signing transactions or messages, etc.
 */
async function loadNimiqLegacyCryptography(preloadWasm = true) {
    nimiqLegacyCryptographyPromise = nimiqLegacyCryptographyPromise || (async () => {
        try {
            if (preloadWasm) {
                // Preload wasm and wasm handler in parallel.
                preloadAsset(`${nimiqLegacyCoreBasePath}worker-wasm.wasm`, 'fetch', true);
                preloadAsset(`${nimiqLegacyCoreBasePath}worker-wasm.js`, 'script', true, 'sha256-1h3wGtySfLKDIxTvVjS56pcJKsrLCb63YosamKCWLHA=');
            }
            const NimiqLegacy = await loadNimiqLegacyCore();
            // Note: this will not import the wasm again if it has already been imported, for example by the parent app.
            await NimiqLegacy.WasmHelper.doImport();
        }
        catch (e) {
            nimiqLegacyCryptographyPromise = null;
            throw e;
        }
    })();
    return nimiqLegacyCryptographyPromise;
}
function preloadAsset(asset, as, crossOrigin, integrity) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = as;
    link.href = asset;
    link.onload = link.onerror = () => document.head.removeChild(link); // eslint-disable-line no-multi-assign
    if (crossOrigin)
        link.crossOrigin = '';
    if (integrity)
        link.integrity = integrity;
    document.head.appendChild(link);
}

function parsePath(path) {
    if (!path.startsWith('44\'/242\'')) {
        throw new Error(`Not a Nimiq BIP32 path. Path: ${path}. The Nimiq app is authorized only for paths starting with 44'/242'. `
            + ' Example: 44\'/242\'/0\'/0\'');
    }
    const pathParts = path.split('/').map((part) => {
        let number = parseInt(part, 10);
        if (Number.isNaN(number)) {
            throw new Error(`Invalid path: ${path}`);
        }
        if (part.endsWith('\'')) {
            number += 0x80000000;
        }
        else {
            throw new Error('Detected a non-hardened path element in requested BIP32 path.'
                + ' Non-hardended paths are not supported at this time. Please use an all-hardened path.'
                + ' Example: 44\'/242\'/0\'/0\'');
        }
        return number;
    });
    const pathBuffer = Buffer.alloc(1 + pathParts.length * 4);
    pathBuffer[0] = pathParts.length;
    pathParts.forEach((element, index) => {
        pathBuffer.writeUInt32BE(element, 1 + 4 * index);
    });
    return pathBuffer;
}
async function publicKeyToAddress(publicKey, nimiqVersion) {
    // Cryptography is needed for hashing public key to an address.
    const Nimiq = await loadNimiq(nimiqVersion, /* include cryptography */ true);
    return new Nimiq.PublicKey(publicKey).toAddress().toUserFriendlyAddress();
}
async function verifySignature(data, signature, publicKey, nimiqVersion) {
    // Cryptography is needed for verifying signatures.
    const Nimiq = await loadNimiq(nimiqVersion, /* include cryptography */ true);
    if (isNimiqLegacy(Nimiq)) {
        const nimiqSignature = new Nimiq.Signature(signature);
        const nimiqPublicKey = new Nimiq.PublicKey(publicKey);
        return nimiqSignature.verify(nimiqPublicKey, data);
    }
    else {
        const nimiqSignature = Nimiq.Signature.deserialize(signature);
        const nimiqPublicKey = new Nimiq.PublicKey(publicKey);
        return nimiqPublicKey.verify(nimiqSignature, data);
    }
}

// Also see developers.ledger.com/docs/transport/open-close-info-on-apps/, github.com/LedgerHQ/ledgerjs/issues/365 and
// github.com/LedgerHQ/ledger-secure-sdk/blob/master/src/os_io_seproxyhal.c for other interesting requests.
async function getAppNameAndVersion(transport, scrambleKey, withApiLock = true) {
    // Taken from @ledgerhq/hw-app-btc/getAppAndVersion.js. We don't import it directly from there to avoid loading its
    // unnecessary dependencies. Note that this request is common to all apps and the dashboard and is no Bitcoin app
    // specific request (it's not on https://github.com/LedgerHQ/app-bitcoin-new/blob/master/doc/bitcoin.md but in the
    // Ledger SDKs, see https://github.com/LedgerHQ/ledger-secure-sdk/blob/master/src/os_io_seproxyhal.c. Also mind the
    // different cla). However, for u2f and WebAuthn the used scramble key must match the one of the connected app for
    // the Ledger to answer the request. Therefore, set the scrambleKey manually to make it compatible with all apps,
    // not only the Nimiq app.
    let getAppNameAndVersionHandler = async () => {
        // Note that no u2f heartbeat is required here as the call is not interactive but answers directly.
        const response = await transport.send(0xb0, 0x01, 0x00, 0x00);
        const status = response.slice(response.length - 2).readUInt16BE(0);
        if (status !== 0x9000)
            throw new Error('getAppNameAndVersion failed'); // should not actually happen
        let offset = 0;
        const format = response[offset++];
        if (format !== 1)
            throw new Error('Unsupported format');
        const nameLength = response[offset++];
        const name = response.slice(offset, (offset += nameLength)).toString('ascii');
        const versionLength = response[offset++];
        const version = response.slice(offset, (offset += versionLength)).toString('ascii');
        return { name, version };
    };
    // Set the scramble key and enable the api lock (for ledger busy errors) if requested. Note that the lock is a
    // property of the transport, not the handler, thus work correctly across multiple independently decorated
    // getAppNameAndVersionHandler and other decorated methods. Also, other decorated methods always overwrite the
    // scramble key to their required key on each invocation, such that setting it here won't affect other api calls.
    if (withApiLock) {
        // Decorating the api method does not modify the transport instance, therefore decorating on each invocation of
        // getAppNameAndVersion does no harm.
        getAppNameAndVersionHandler = transport.decorateAppAPIMethod('getAppNameAndVersionHandler', getAppNameAndVersionHandler, undefined, scrambleKey);
    }
    else {
        // Setting the scramble key manually does no harm, as any decorated api method will overwrite it again.
        transport.setScrambleKey(scrambleKey);
    }
    return getAppNameAndVersionHandler();
}

const CLA = 0xe0;
const INS_GET_PK = 0x02;
const INS_SIGN_TX = 0x04;
const INS_KEEP_ALIVE = 0x08;
const INS_SIGN_MESSAGE = 0x0a;
const APDU_MAX_SIZE = 255; // see IO_APDU_BUFFER_SIZE in os.h in ledger sdk
const P1_FIRST_APDU = 0x00;
const P1_MORE_APDU = 0x80;
const P1_NO_VALIDATE = 0x00;
const P1_VALIDATE = 0x01;
const P2_LAST_APDU = 0x00;
const P2_MORE_APDU = 0x80;
const P2_NO_CONFIRM = 0x00;
const P2_CONFIRM = 0x01;
const MESSAGE_FLAG_PREFER_DISPLAY_TYPE_HEX = 1 << 0; // eslint-disable-line no-bitwise
const MESSAGE_FLAG_PREFER_DISPLAY_TYPE_HASH = 1 << 1; // eslint-disable-line no-bitwise
// Definition of common status words:
// - https://github.com/LedgerHQ/ledger-secure-sdk/blob/master/include/errors.h
// - https://github.com/LedgerHQ/app-bitcoin-new/blob/master/src/boilerplate/sw.h
// - https://github.com/LedgerHQ/app-bitcoin/blob/master/include/btchip_apdu_constants.h
// - https://ledgerhq.github.io/btchip-doc/bitcoin-technical-beta.html#_status_words
const SW_OK = 0x9000;
const SW_CANCEL = 0x6985;
const SW_KEEP_ALIVE = 0x6e02;
const U2F_SCRAMBLE_KEY = 'w0w';
/**
 * Nimiq API
 *
 * Low level api for communication with the Ledger wallet Nimiq app. This lib is compatible with all @ledgerhq/transport
 * libraries but does on the other hand not include optimizations for specific transport types and returns raw bytes.
 *
 * This library is in nature similar to other hw-app packages in @ledgerhq/ledgerjs and partially based on their code,
 * licenced under the Apache 2.0 licence.
 *
 * @example
 * const nim = new LowLevelApi(transport)
 */
class LowLevelApi {
    _transport;
    constructor(transport) {
        this._transport = transport;
        // Note that getAppNameAndVersion does not need to be decorated, as we're decorating it manually. Also note that
        // the registered methods here do not intersect with the methods of the Bitcoin api, therefore, we can re-use
        // the same transport instance for both, NIM and BTC apis (as long as a switch between NIM and BTC apps doesn't
        // cause a disconnect).
        transport.decorateAppAPIMethods(this, ['getPublicKey', 'signTransaction'], U2F_SCRAMBLE_KEY);
    }
    get transport() {
        return this._transport;
    }
    /**
     * Close the transport instance. Note that this does not emit a disconnect. Disconnects are only emitted when the
     * device actually disconnects (or switches it's descriptor which happens when switching to the dashboard or apps).
     */
    async close() {
        try {
            await this._transport.close();
        }
        catch (e) {
            // Ignore. Transport might already be closed.
        }
    }
    /**
     * Get the name of the connected app and the app version.
     * @returns An object with the name and version.
     * @example
     * nim.getAppNameAndVersion().then(o => o.version)
     */
    async getAppNameAndVersion() {
        return getAppNameAndVersion(this._transport, U2F_SCRAMBLE_KEY);
    }
    /**
     * Get Nimiq address for a given BIP 32 path.
     * @param path - A path in BIP 32 format.
     * @param [boolValidate] - Optionally enable key pair validation.
     * @param [boolDisplay] - Optionally display the address on the ledger.
     * @param [nimiqVersion] - Optionally choose which Nimiq library version to use for internal computations.
     * @returns An object with the address.
     * @example
     * nim.getAddress("44'/242'/0'/0'").then(o => o.address)
     */
    async getAddress(path, boolValidate = true, boolDisplay = false, nimiqVersion = NimiqVersion.ALBATROSS) {
        // Start loading Nimiq core later needed for hashing public key to address and optional validation.
        loadNimiq(nimiqVersion, /* include cryptography */ true).catch(() => { });
        const { publicKey } = await this.getPublicKey(path, boolValidate, boolDisplay, nimiqVersion);
        const address = await publicKeyToAddress(Buffer.from(publicKey), nimiqVersion);
        return { address };
    }
    /**
     * Get Nimiq public key for a given BIP 32 path.
     * @param path - A path in BIP 32 format.
     * @param [boolValidate] - Optionally enable key pair validation.
     * @param [boolDisplay] - Optionally display the corresponding address on the ledger.
     * @param [nimiqVersion] - Optionally choose which Nimiq library version to use for internal computations.
     * @returns An object with the publicKey.
     * @example
     * nim.getPublicKey("44'/242'/0'/0'").then(o => o.publicKey)
     */
    async getPublicKey(path, boolValidate = true, boolDisplay = false, nimiqVersion = NimiqVersion.ALBATROSS) {
        if (boolValidate) {
            // Start loading Nimiq core later needed for validation.
            loadNimiq(nimiqVersion, /* include cryptography */ true).catch(() => { });
        }
        const pathBuffer = parsePath(path);
        // Validation message including prefix "dummy-data:" as required since app version 2.0 to avoid the risks of
        // blind signing.
        const validationMessage = Buffer.from('dummy-data:p=np?', 'ascii');
        const data = boolValidate ? Buffer.concat([pathBuffer, validationMessage]) : pathBuffer;
        let response;
        response = await this._transport.send(CLA, INS_GET_PK, boolValidate ? P1_VALIDATE : P1_NO_VALIDATE, boolDisplay ? P2_CONFIRM : P2_NO_CONFIRM, data, [SW_OK, SW_KEEP_ALIVE]);
        // handle heartbeat
        while (response.slice(response.length - 2).readUInt16BE(0) === SW_KEEP_ALIVE) {
            // eslint-disable-next-line no-await-in-loop
            response = await this._transport.send(CLA, INS_KEEP_ALIVE, 0, 0, undefined, [SW_OK, SW_KEEP_ALIVE]);
        }
        let offset = 0;
        const publicKey = response.slice(offset, offset + 32);
        offset += 32;
        if (boolValidate) {
            const signature = response.slice(offset, offset + 64);
            if (!await verifySignature(validationMessage, signature, publicKey, nimiqVersion)) {
                throw new Error('Bad signature. Keypair is invalid. Please report this.');
            }
        }
        return { publicKey };
    }
    async signTransaction(path, txContent, nimiqVersion = NimiqVersion.ALBATROSS, appVersion) {
        // The Nimiq version byte was added in app version 2. It supports both, legacy and Albatross transactions, and
        // is the first app version to support Albatross. Note that wrongly sending a legacy transaction without version
        // byte to the 2.0 app does no harm, as the app will reject it. Neither does sending an Albatross transaction,
        // with version byte, to a legacy app before 2.0 as the app will interpret the version byte of value 1 as the
        // first byte of the uint16 data length, resulting in a data length longer than the allowed max which will be
        // rejected.
        if (nimiqVersion === NimiqVersion.LEGACY && !appVersion) {
            ({ version: appVersion } = await getAppNameAndVersion(this._transport, U2F_SCRAMBLE_KEY, 
            /* withApiLock */ false));
        }
        const includeVersionByte = nimiqVersion === NimiqVersion.ALBATROSS || parseInt(appVersion || '') >= 2;
        const pathBuffer = parsePath(path);
        const versionByteBuffer = includeVersionByte
            ? new Uint8Array([nimiqVersion === NimiqVersion.ALBATROSS ? 1 : 0])
            : new Uint8Array();
        const transactionBuffer = Buffer.from(txContent);
        const apdus = [];
        let transactionChunkSize = APDU_MAX_SIZE - pathBuffer.length - versionByteBuffer.length;
        if (transactionBuffer.length <= transactionChunkSize) {
            // it fits in a single apdu
            apdus.push(Buffer.concat([pathBuffer, versionByteBuffer, transactionBuffer]));
        }
        else {
            // we need to send multiple apdus to transmit the entire transaction
            let transactionChunk = Buffer.alloc(transactionChunkSize);
            let offset = 0;
            transactionBuffer.copy(transactionChunk, 0, offset, transactionChunkSize);
            apdus.push(Buffer.concat([pathBuffer, versionByteBuffer, transactionChunk]));
            offset += transactionChunkSize;
            while (offset < transactionBuffer.length) {
                const remaining = transactionBuffer.length - offset;
                transactionChunkSize = remaining < APDU_MAX_SIZE ? remaining : APDU_MAX_SIZE;
                transactionChunk = Buffer.alloc(transactionChunkSize);
                transactionBuffer.copy(transactionChunk, 0, offset, offset + transactionChunkSize);
                offset += transactionChunkSize;
                apdus.push(transactionChunk);
            }
        }
        let isHeartbeat = false;
        let chunkIndex = 0;
        let status;
        let response;
        do {
            const data = apdus[chunkIndex];
            // eslint-disable-next-line no-await-in-loop
            response = await this._transport.send(CLA, isHeartbeat ? INS_KEEP_ALIVE : INS_SIGN_TX, chunkIndex === 0 ? P1_FIRST_APDU : P1_MORE_APDU, // note that for heartbeat p1, p2 and data are ignored
            chunkIndex === apdus.length - 1 ? P2_LAST_APDU : P2_MORE_APDU, data, [SW_OK, SW_CANCEL, SW_KEEP_ALIVE]);
            status = response.slice(response.length - 2).readUInt16BE(0);
            isHeartbeat = status === SW_KEEP_ALIVE;
            if (!isHeartbeat) {
                // we can continue sending data or end the loop when all data was sent
                ++chunkIndex;
            }
        } while (isHeartbeat || chunkIndex < apdus.length);
        if (status !== SW_OK)
            throw new Error('Transaction approval request was rejected');
        const signatureCount = (response.length - /* sw */ 2) / 64;
        if (signatureCount !== 1 && signatureCount !== 2) {
            throw new Error('Unexpected response length');
        }
        const signature = response.slice(0, 64);
        let stakerSignature;
        if (signatureCount === 2) {
            if (nimiqVersion === NimiqVersion.LEGACY) {
                throw new Error('Unexpected staker signature on legacy transaction');
            }
            stakerSignature = response.slice(64, 128);
        }
        return { signature, stakerSignature };
    }
    /* eslint-enable lines-between-class-members */
    /**
     * Sign a message with a Nimiq key.
     * @param path - A path in BIP 32 format.
     * @param message - Message to sign as utf8 string or arbitrary bytes.
     * @param [flags] - Flags to pass. Currently supported: `preferDisplayTypeHex` and `preferDisplayTypeHash`.
     * @returns An object with the signature.
     * @example
     * nim.signMessage("44'/242'/0'/0'", message).then(o => o.signature)
     */
    async signMessage(path, message, flags) {
        const pathBuffer = parsePath(path);
        const messageBuffer = typeof message === 'string'
            ? Buffer.from(message, 'utf8') // throws if invalid utf8
            : Buffer.from(message);
        flags = typeof flags === 'object'
            // eslint-disable-next-line no-bitwise
            ? (flags.preferDisplayTypeHex ? MESSAGE_FLAG_PREFER_DISPLAY_TYPE_HEX : 0)
                | (flags.preferDisplayTypeHash ? MESSAGE_FLAG_PREFER_DISPLAY_TYPE_HASH : 0)
            : flags || 0;
        const flagsBuffer = Buffer.from([flags]);
        if (messageBuffer.length >= 2 ** 32) {
            // the message length must fit an uint32
            throw new Error('Message too long');
        }
        const messageLengthBuffer = Buffer.alloc(4);
        messageLengthBuffer.writeUInt32BE(messageBuffer.length);
        const apdus = [];
        let messageChunkSize = Math.min(messageBuffer.length, APDU_MAX_SIZE - pathBuffer.length - flagsBuffer.length - messageLengthBuffer.length);
        let messageChunk = Buffer.alloc(messageChunkSize);
        let messageOffset = 0;
        messageBuffer.copy(messageChunk, 0, messageOffset, messageChunkSize);
        apdus.push(Buffer.concat([pathBuffer, flagsBuffer, messageLengthBuffer, messageChunk]));
        messageOffset += messageChunkSize;
        while (messageOffset < messageBuffer.length) {
            messageChunkSize = Math.min(messageBuffer.length - messageOffset, APDU_MAX_SIZE);
            messageChunk = Buffer.alloc(messageChunkSize);
            messageBuffer.copy(messageChunk, 0, messageOffset, messageOffset + messageChunkSize);
            messageOffset += messageChunkSize;
            apdus.push(messageChunk);
        }
        let isHeartbeat = false;
        let chunkIndex = 0;
        let status;
        let response;
        do {
            const data = apdus[chunkIndex];
            // eslint-disable-next-line no-await-in-loop
            response = await this._transport.send(CLA, isHeartbeat ? INS_KEEP_ALIVE : INS_SIGN_MESSAGE, chunkIndex === 0 ? P1_FIRST_APDU : P1_MORE_APDU, // note that for heartbeat p1, p2 and data are ignored
            chunkIndex === apdus.length - 1 ? P2_LAST_APDU : P2_MORE_APDU, data, [SW_OK, SW_CANCEL, SW_KEEP_ALIVE]);
            status = response.slice(response.length - 2).readUInt16BE(0);
            isHeartbeat = status === SW_KEEP_ALIVE;
            if (!isHeartbeat) {
                // we can continue sending data or end the loop when all data was sent
                ++chunkIndex;
            }
        } while (isHeartbeat || chunkIndex < apdus.length);
        if (status !== SW_OK)
            throw new Error('Message approval request was rejected');
        const signature = response.slice(0, response.length - 2);
        return { signature };
    }
}

export { LowLevelApi as default };
//# sourceMappingURL=low-level-api.es.js.map
