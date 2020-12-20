// Use jsdelivr instead of nimiq cdn to avoid getting blocked by ad blockers.
const coreBasePath = 'https://cdn.jsdelivr.net/npm/@nimiq/core-web/';
let nimiqCorePromise = null;
let nimiqCryptographyPromise = null;
/**
 * Lazy-load the Nimiq core api from the cdn server if it's not loaded yet.
 */
async function loadNimiqCore(coreVariant = 'web-offline') {
    // @ts-ignore Return global Nimiq if already loaded.
    if (window.Nimiq)
        return window.Nimiq;
    nimiqCorePromise = nimiqCorePromise || new Promise((resolve, reject) => {
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
        $script.src = `${coreBasePath}${coreVariant}.js`;
        $head.appendChild($script);
    }).then(() => {
        // @ts-ignore Nimiq is global but to discourage usage as global var we did not declare a global type.
        const { Nimiq } = window;
        return Nimiq;
    }, (e) => {
        nimiqCorePromise = null;
        return Promise.reject(e);
    });
    return nimiqCorePromise;
}
/**
 * Load the WebAssembly and module for cryptographic functions. You will have to do this before calculating hashes,
 * deriving keys or addresses, signing transactions or messages, etc.
 */
async function loadNimiqCryptography() {
    nimiqCryptographyPromise = nimiqCryptographyPromise || (async () => {
        try {
            // preload wasm in parallel
            preloadAsset(`${coreBasePath}worker-wasm.wasm`, 'fetch', true);
            preloadAsset(`${coreBasePath}worker-wasm.js`, 'script');
            const Nimiq = await loadNimiqCore();
            await Nimiq.WasmHelper.doImport();
        }
        catch (e) {
            nimiqCryptographyPromise = null;
            throw e;
        }
    })();
    return nimiqCryptographyPromise;
}
function preloadAsset(asset, as, crossOrigin) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = as;
    link.href = asset;
    link.onload = link.onerror = () => document.head.removeChild(link); // eslint-disable-line no-multi-assign
    if (crossOrigin)
        link.crossOrigin = '';
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
async function publicKeyToAddress(publicKey) {
    const [Nimiq] = await Promise.all([
        loadNimiqCore(),
        loadNimiqCryptography(),
    ]);
    return Nimiq.PublicKey.unserialize(new Nimiq.SerialBuffer(publicKey)).toAddress().toUserFriendlyAddress();
}
async function verifySignature(data, signature, publicKey) {
    const [Nimiq] = await Promise.all([loadNimiqCore(), loadNimiqCryptography()]);
    const nimiqSignature = Nimiq.Signature.unserialize(new Nimiq.SerialBuffer(signature));
    const nimiqPublicKey = Nimiq.PublicKey.unserialize(new Nimiq.SerialBuffer(publicKey));
    return nimiqSignature.verify(nimiqPublicKey, data);
}

const CLA = 0xe0;
const INS_GET_PK = 0x02;
const INS_SIGN_TX = 0x04;
const INS_GET_CONF = 0x06;
const INS_KEEP_ALIVE = 0x08;
const APDU_MAX_SIZE = 150;
const P1_FIRST_APDU = 0x00;
const P1_MORE_APDU = 0x80;
const P1_NO_VALIDATE = 0x00;
const P1_VALIDATE = 0x01;
const P2_LAST_APDU = 0x00;
const P2_MORE_APDU = 0x80;
const P2_NO_CONFIRM = 0x00;
const P2_CONFIRM = 0x01;
const SW_OK = 0x9000;
const SW_CANCEL = 0x6985;
const SW_KEEP_ALIVE = 0x6e02;
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
    constructor(transport) {
        this._transport = transport;
        // Note that the registered methods here do not intersect with the methods of the Bitcoin api, therefore, we can
        // re-use the same transport instance for both, NIM and BTC apis (as long as a switch between NIM and BTC apps
        // doesn't cause a disconnect).
        transport.decorateAppAPIMethods(this, ['getAppConfiguration', 'getPublicKey', 'signTransaction'], 'w0w');
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
     * Get the version of the connected Ledger Nimiq App. Note that some other apps like the Ethereum app also respond
     * to this call.
     */
    async getAppConfiguration() {
        // Note that no heartbeat is required here as INS_GET_CONF is not interactive but thus answers directly
        const [, major, minor, patch] = await this._transport.send(CLA, INS_GET_CONF, 0x00, 0x00);
        const version = `${major}.${minor}.${patch}`;
        return { version };
    }
    /**
     * Get Nimiq address for a given BIP 32 path.
     * @param path - A path in BIP 32 format.
     * @param boolValidate - Optionally enable key pair validation.
     * @param boolDisplay - Optionally display the address on the ledger.
     * @returns An object with the address.
     * @example
     * nim.getAddress("44'/242'/0'/0'").then(o => o.address)
     */
    async getAddress(path, boolValidate = true, boolDisplay = false) {
        // start loading Nimiq core later needed for transforming public key to address and optional validation
        loadNimiqCore();
        loadNimiqCryptography();
        const { publicKey } = await this.getPublicKey(path, boolValidate, boolDisplay);
        const address = await publicKeyToAddress(Buffer.from(publicKey));
        return { address };
    }
    /**
     * Get Nimiq public key for a given BIP 32 path.
     * @param path - A path in BIP 32 format.
     * @param boolValidate - Optionally enable key pair validation.
     * @param boolDisplay - Optionally display the corresponding address on the ledger.
     * @returns An object with the publicKey.
     * @example
     * nim.getPublicKey("44'/242'/0'/0'").then(o => o.publicKey)
     */
    async getPublicKey(path, boolValidate = true, boolDisplay = false) {
        if (boolValidate) {
            // start loading Nimiq core later needed for validation
            loadNimiqCore();
            loadNimiqCryptography();
        }
        const pathBuffer = parsePath(path);
        const verifyMsg = Buffer.from('p=np?', 'ascii');
        const data = Buffer.concat([pathBuffer, verifyMsg]);
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
            if (!await verifySignature(verifyMsg, signature, publicKey)) {
                throw new Error('Bad signature. Keypair is invalid. Please report this.');
            }
        }
        return { publicKey };
    }
    /**
     * Sign a Nimiq transaction.
     * @param path - A path in BIP 32 format.
     * @param txContent - Transaction content in serialized form.
     * @returns An object with the signature.
     * @example
     * nim.signTransaction("44'/242'/0'/0'", signatureBase).then(o => o.signature)
     */
    async signTransaction(path, txContent) {
        const pathBuffer = parsePath(path);
        const transaction = Buffer.from(txContent);
        const apdus = [];
        let chunkSize = APDU_MAX_SIZE - pathBuffer.length;
        if (transaction.length <= chunkSize) {
            // it fits in a single apdu
            apdus.push(Buffer.concat([pathBuffer, transaction]));
        }
        else {
            // we need to send multiple apdus to transmit the entire transaction
            let chunk = Buffer.alloc(chunkSize);
            let offset = 0;
            transaction.copy(chunk, 0, offset, chunkSize);
            apdus.push(Buffer.concat([pathBuffer, chunk]));
            offset += chunkSize;
            while (offset < transaction.length) {
                const remaining = transaction.length - offset;
                chunkSize = remaining < APDU_MAX_SIZE ? remaining : APDU_MAX_SIZE;
                chunk = Buffer.alloc(chunkSize);
                transaction.copy(chunk, 0, offset, offset + chunkSize);
                offset += chunkSize;
                apdus.push(chunk);
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
        const signature = Buffer.from(response.slice(0, response.length - 2));
        return {
            signature: Uint8Array.from(signature),
        };
    }
}

export default LowLevelApi;
//# sourceMappingURL=low-level-api.es.js.map
