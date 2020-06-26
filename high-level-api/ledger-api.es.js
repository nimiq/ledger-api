import { B as Buffer } from './lazy-chunk-buffer.es.js';

// Use jsdelivr instead of nimiq cdn to avoid getting blocked by ad blockers.
const coreBasePath = 'https://cdn.jsdelivr.net/npm/@nimiq/core-web/';
let nimiqCorePromise = null;
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
    // Note that there is no need to cache a promise like in loadNimiqCore for this call, as loadNimiqCore and doImport
    // already do that themselves.
    const Nimiq = await loadNimiqCore();
    await Nimiq.WasmHelper.doImport();
}
//# sourceMappingURL=load-nimiq.js.map

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
        transport.decorateAppAPIMethods(this, ['getAppConfiguration', 'getPublicKey', 'signTransaction'], 'w0w');
    }
    /**
     * Close the transport instance. Note that this does not emit a disconnect. Disconnects are only emitted when the
     * device actually disconnects (or switches it's descriptor which happens when switching to the dashboard or apps).
     */
    close() {
        try {
            this._transport.close();
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

class Observable {
    constructor() {
        this._listeners = new Map();
    }
    on(eventType, listener) {
        if (!this._listeners.has(eventType)) {
            this._listeners.set(eventType, [listener]);
        }
        else {
            this._listeners.get(eventType).push(listener);
        }
    }
    off(eventType, listener) {
        const listenersForEvent = this._listeners.get(eventType);
        if (!listenersForEvent)
            return;
        const index = listenersForEvent.indexOf(listener);
        if (index === -1)
            return;
        listenersForEvent.splice(index, 1);
    }
    once(eventType, listener) {
        const onceListener = ((...args) => {
            this.off(eventType, onceListener);
            listener(...args);
        });
        this.on(eventType, onceListener);
    }
    fire(eventName, ...args) {
        // Let current micro task finish before invoking listeners
        setTimeout(() => {
            const listenersForEvent = this._listeners.get(eventName);
            if (!listenersForEvent)
                return;
            for (const listener of listenersForEvent) {
                listener(...args);
            }
        }, 0);
    }
}

var TransportType;
(function (TransportType) {
    TransportType["WEB_HID"] = "web-hid";
    TransportType["WEB_USB"] = "web-usb";
    TransportType["WEB_BLE"] = "web-ble";
    TransportType["U2F"] = "u2f";
})(TransportType || (TransportType = {}));
function isSupported(transportType) {
    if (window.location.protocol !== 'https:')
        return false;
    if (!transportType)
        return !!autoDetectTransportTypeToUse();
    // inspired by @ledgerhq/hw-transport libs
    switch (transportType) {
        case TransportType.WEB_HID:
            return 'hid' in window.navigator;
        case TransportType.WEB_USB:
            // @ts-ignore
            return 'usb' in window.navigator && typeof window.navigator.usb.getDevices === 'function';
        case TransportType.WEB_BLE:
            return 'bluetooth' in window.navigator;
        case TransportType.U2F:
            // Note that Chrome, Opera and Edge use an internal, hidden cryptotoken extension to handle u2f
            // (https://github.com/google/u2f-ref-code/blob/master/u2f-gae-demo/war/js/u2f-api.js) which does not
            // expose the u2f api on window. Support via that extension is not detected by this check. However, as
            // these browsers support WebUSB, this is acceptable and we don't use a more elaborate check like the one
            // in the 'u2f-api' package to avoid bundling it and also because it's async, complicating the code.
            // @ts-ignore
            return 'u2f' in window && typeof window.u2f.sign === 'function';
        default:
            return false;
    }
}
function autoDetectTransportTypeToUse() {
    // Determine the best available transport type. Exclude WebBle as it's only suitable for Nano X.
    let transportTypesByPreference;
    // HID has better compatibility on Windows due to driver issues for WebUSB for the Nano X (see
    // https://github.com/LedgerHQ/ledgerjs/issues/456 and https://github.com/WICG/webusb/issues/143). On other
    // platforms however, WebUSB is preferable for multiple reasons (Chrome):
    // - Currently HID permission is only valid until device is disconnected while WebUSB remembers a granted
    //   permission. This results in a device selection popup every time the Ledger is reconnected (or changes to
    //   another app or the dashboard, where Ledger reports different device descriptors, i.e. appears as a
    //   different device). This also requires a user gesture every time.
    // - HID device selection popup does not update on changes, for example on switch from Ledger dashboard to app
    //   or when Ledger gets connected.
    // - HID does not emit disconnects immediately but only at next request.
    // TODO this situation needs to be re-evaluated once WebHID is stable
    const isWindows = /Win/.test(window.navigator.platform); // see https://stackoverflow.com/a/38241481
    if (isWindows) {
        transportTypesByPreference = [TransportType.WEB_HID, TransportType.WEB_USB];
    }
    else {
        transportTypesByPreference = [TransportType.WEB_USB, TransportType.WEB_HID];
    }
    // U2F as legacy fallback. The others are preferred as U2F can time out and causes native Windows security popups
    // in Windows and additionally Firefox internal popups in Firefox on all platforms.
    transportTypesByPreference.push(TransportType.U2F);
    return transportTypesByPreference.find(isSupported) || null;
}
/**
 * Create a new transport to a connected Ledger device. All transport types but U2F must be invoked on user interaction.
 * If an already known device is connected, a transport instance to that device is established. Otherwise, a browser
 * popup with a selector is opened.
 * @param transportType
 */
async function createTransport(transportType) {
    switch (transportType) {
        case TransportType.WEB_HID:
            return (await import('./lazy-chunk-TransportWebHID.es.js')).default.create();
        case TransportType.WEB_USB:
            return (await import('./lazy-chunk-TransportWebUSB.es.js')).default.create();
        case TransportType.WEB_BLE:
            return (await import('./lazy-chunk-TransportWebBLE.es.js')).default.create();
        case TransportType.U2F:
            return (await import('./lazy-chunk-TransportU2F.es.js')).default.create();
        default:
            throw new Error(`Unknown transport type ${transportType}`);
    }
}

var RequestType;
(function (RequestType) {
    RequestType["GET_WALLET_ID"] = "get-wallet-id";
    RequestType["DERIVE_ADDRESSES"] = "derive-addresses";
    RequestType["GET_PUBLIC_KEY"] = "get-public-key";
    RequestType["GET_ADDRESS"] = "get-address";
    RequestType["CONFIRM_ADDRESS"] = "confirm-address";
    RequestType["SIGN_TRANSACTION"] = "sign-transaction";
})(RequestType || (RequestType = {}));
let LedgerApiRequest = /** @class */ (() => {
    class LedgerApiRequest extends Observable {
        constructor(type, call, params) {
            super();
            this._cancelled = false;
            this.type = type;
            this._call = call;
            this.params = params;
        }
        get cancelled() {
            return this._cancelled;
        }
        async call(api) {
            return this._call.call(this, api, this.params);
        }
        cancel() {
            this._cancelled = true;
            this.fire(LedgerApiRequest.EVENT_CANCEL);
        }
        on(type, callback) {
            if (type === LedgerApiRequest.EVENT_CANCEL && this._cancelled) {
                // trigger callback directly
                callback();
            }
            return super.on(type, callback);
        }
    }
    LedgerApiRequest.EVENT_CANCEL = 'cancel';
    return LedgerApiRequest;
})();

// Some notes about the behaviour of the ledger:
// events appear at a single point of time while states reflect the current state of the api for a timespan ranging
// into the future. E.g. if a request was cancelled, a REQUEST_CANCELLED event gets thrown and the state changes to
// IDLE. Errors trigger an error state (e.g. when app outdated) and thus are a state, not an event.
var EventType;
(function (EventType) {
    EventType["STATE_CHANGE"] = "state-change";
    EventType["REQUEST_SUCCESSFUL"] = "request-successful";
    EventType["REQUEST_CANCELLED"] = "request-cancelled";
    EventType["CONNECTED"] = "connected";
})(EventType || (EventType = {}));
var StateType;
(function (StateType) {
    StateType["IDLE"] = "idle";
    StateType["LOADING"] = "loading";
    StateType["CONNECTING"] = "connecting";
    StateType["REQUEST_PROCESSING"] = "request-processing";
    StateType["REQUEST_CANCELLING"] = "request-cancelling";
    StateType["ERROR"] = "error";
})(StateType || (StateType = {}));
var ErrorType;
(function (ErrorType) {
    ErrorType["LEDGER_BUSY"] = "ledger-busy";
    ErrorType["LOADING_DEPENDENCIES_FAILED"] = "loading-dependencies-failed";
    ErrorType["USER_INTERACTION_REQUIRED"] = "user-interaction-required";
    ErrorType["CONNECTION_ABORTED"] = "connection-aborted";
    ErrorType["NO_BROWSER_SUPPORT"] = "no-browser-support";
    ErrorType["APP_OUTDATED"] = "app-outdated";
    ErrorType["WRONG_LEDGER"] = "wrong-ledger";
    ErrorType["REQUEST_ASSERTION_FAILED"] = "request-specific-error";
})(ErrorType || (ErrorType = {}));
let LedgerApi = /** @class */ (() => {
    class LedgerApi {
        static get currentState() {
            return LedgerApi._currentState;
        }
        static get currentRequest() {
            return LedgerApi._currentRequest;
        }
        static get isBusy() {
            return !!LedgerApi._currentRequest;
        }
        static get transportType() {
            return LedgerApi._transportType;
        }
        /**
         * Check for general support or support of a specific transport type. Note that isSupported is additionally exported
         * as separate export that doesn't require bundling the whole api.
         * @param [transportType] - Transport type for which to test for support. If omitted test for support of any type.
         */
        static isSupported(transportType) {
            return isSupported(transportType);
        }
        /**
         * Set a specific transport type. Note that an already connected ongoing request will still use the previous
         * transport type.
         * @param transportType - Transport type to use for connections to Ledger devices.
         */
        static setTransportType(transportType) {
            if (!isSupported(transportType))
                throw new Error('Unsupported transport type.');
            if (transportType === LedgerApi._transportType)
                return;
            LedgerApi._transportType = transportType;
            // Close api for current transport to create a new one for specified transport type on next request.
            LedgerApi.disconnect(/* cancelRequest */ false);
        }
        static resetTransportType() {
            const transportType = autoDetectTransportTypeToUse();
            if (!transportType)
                return;
            LedgerApi.setTransportType(transportType);
        }
        /**
         * Manually connect to a Ledger. Typically, this is not required as all requests establish a connection themselves.
         * However, if that connection fails due to a required user interaction / user gesture, you can manually connect in
         * the context of a user interaction, for example a click.
         * @returns Whether connecting to the Ledger succeeded.
         */
        static async connect() {
            LedgerApi._connectionAborted = false; // reset aborted flag on manual connection
            try {
                // Initialize the api again if it failed previously, for example due to missing user interaction.
                await LedgerApi._initializeLowLevelApi();
            }
            catch (e) {
                // Silently continue on errors, same as the other API methods. Error was reported by _initializeLowLevelApi
                // as error state instead. Only if user aborted the connection or browser is not supported, don't continue.
                if (/connection aborted|not supported/i.test(e.message || e))
                    return false;
            }
            try {
                // Use getWalletId to detect when the ledger is connected.
                await LedgerApi.getWalletId();
                return true;
            }
            catch (e) {
                return false;
            }
        }
        /**
         * Disconnect the api and clean up.
         * @param cancelRequest - Whether to cancel an ongoing request.
         * @param requestTypeToDisconnect - If specified, only disconnect if no request is going on or if the ongoing
         *  request is of the specified type.
         */
        static async disconnect(cancelRequest = true, requestTypeToDisconnect) {
            const { currentRequest } = LedgerApi;
            if (currentRequest) {
                if (requestTypeToDisconnect !== undefined && currentRequest.type !== requestTypeToDisconnect)
                    return;
                if (cancelRequest) {
                    currentRequest.cancel();
                }
            }
            const apiPromise = LedgerApi._lowLevelApiPromise;
            LedgerApi._lowLevelApiPromise = null;
            LedgerApi._currentlyConnectedWalletId = null;
            if (!apiPromise)
                return;
            try {
                const api = await apiPromise;
                await api.close();
            }
            catch (e) {
                // Ignore.
            }
        }
        /**
         * Get the 32 byte walletId of the currently connected ledger as base64.
         * If no ledger is connected, it waits for one to be connected.
         * Throws, if the request is cancelled.
         *
         * If currently a request to the ledger is in process, this call does not require an additional
         * request to the Ledger. Thus, if you want to know the walletId in conjunction with another
         * request, try to call this method after initiating the other request but before it finishes.
         *
         * @returns The walletId of the currently connected ledger as base 64.
         */
        static async getWalletId() {
            if (LedgerApi._currentlyConnectedWalletId)
                return LedgerApi._currentlyConnectedWalletId;
            // we have to wait for connection of ongoing request or initiate a call ourselves
            if (LedgerApi.isBusy) {
                // already a request going on. Just wait for it to connect.
                return new Promise((resolve, reject) => {
                    const onConnect = (walletId) => {
                        LedgerApi.off(EventType.CONNECTED, onConnect);
                        LedgerApi.off(EventType.REQUEST_CANCELLED, onCancel);
                        resolve(walletId);
                    };
                    const onCancel = () => {
                        LedgerApi.off(EventType.CONNECTED, onConnect);
                        LedgerApi.off(EventType.REQUEST_CANCELLED, onCancel);
                        reject(new Error('Request cancelled'));
                    };
                    LedgerApi.on(EventType.CONNECTED, onConnect);
                    LedgerApi.on(EventType.REQUEST_CANCELLED, onCancel);
                });
            }
            // We have to send a request ourselves
            const request = new LedgerApiRequest(RequestType.GET_WALLET_ID, 
            // we're connected when the request get's executed
            () => Promise.resolve(LedgerApi._currentlyConnectedWalletId), {});
            return LedgerApi._callLedger(request);
        }
        static on(eventType, listener) {
            LedgerApi._observable.on(eventType, listener);
        }
        static off(eventType, listener) {
            LedgerApi._observable.off(eventType, listener);
        }
        static once(eventType, listener) {
            LedgerApi._observable.once(eventType, listener);
        }
        /**
         * Convert an address's index / keyId to the full Nimiq bip32 path.
         * @param keyId - The address's index.
         * @returns The full bip32 path.
         */
        static getBip32PathForKeyId(keyId) {
            return `${LedgerApi.BIP32_BASE_PATH}${keyId}'`;
        }
        /**
         * Extract an address's index / keyId from its bip32 path.
         * @param path - The address's bip32 path.
         * @returns The address's index or null if the provided path is not a valid Nimiq key bip32 path.
         */
        static getKeyIdForBip32Path(path) {
            const pathMatch = LedgerApi.BIP32_PATH_REGEX.exec(path);
            if (!pathMatch)
                return null;
            return parseInt(pathMatch[pathMatch.length - 1], 10);
        }
        /**
         * Derive addresses for given bip32 key paths.
         * @param pathsToDerive - The paths for which to derive addresses.
         * @param [walletId] - Check that the connected wallet corresponds to the given walletId, otherwise throw. Optional.
         * @returns The derived addresses and their corresponding key paths.
         */
        static async deriveAddresses(pathsToDerive, walletId) {
            const request = new LedgerApiRequest(RequestType.DERIVE_ADDRESSES, async (api, params) => {
                const addressRecords = [];
                for (const keyPath of params.pathsToDerive) {
                    if (request.cancelled)
                        return addressRecords;
                    // eslint-disable-next-line no-await-in-loop
                    const { address } = await api.getAddress(keyPath, true, // validate
                    false);
                    addressRecords.push({ address, keyPath });
                }
                return addressRecords;
            }, {
                walletId,
                pathsToDerive,
            });
            // check paths outside of request to avoid endless loop in _callLedger if we'd throw for an invalid keyPath
            for (const keyPath of pathsToDerive) {
                if (LedgerApi.BIP32_PATH_REGEX.test(keyPath))
                    continue;
                this._throwError(ErrorType.REQUEST_ASSERTION_FAILED, `Invalid keyPath ${keyPath}`, request);
            }
            return LedgerApi._callLedger(request);
        }
        /**
         * Get the public key for a given bip32 key path.
         * @param keyPath - The path for which to derive the public key.
         * @param [walletId] - Check that the connected wallet corresponds to the given walletId, otherwise throw. Optional.
         * @returns The derived public key.
         */
        static async getPublicKey(keyPath, walletId) {
            const request = new LedgerApiRequest(RequestType.GET_PUBLIC_KEY, async (api, params) => {
                const { publicKey } = await api.getPublicKey(params.keyPath, true, // validate
                false);
                // Note that the actual load of the Nimiq core and cryptography is triggered in _connect, including
                // error handling. The call here is just used to get the reference to the Nimiq object and can not fail.
                const Nimiq = await this._loadNimiq();
                return new Nimiq.PublicKey(publicKey);
            }, {
                walletId,
                keyPath,
            });
            if (!LedgerApi.BIP32_PATH_REGEX.test(keyPath)) {
                this._throwError(ErrorType.REQUEST_ASSERTION_FAILED, `Invalid keyPath ${keyPath}`, request);
            }
            return LedgerApi._callLedger(request);
        }
        /**
         * Get the address for a given bip32 key path.
         * @param keyPath - The path for which to derive the address.
         * @param [walletId] - Check that the connected wallet corresponds to the given walletId, otherwise throw. Optional.
         * @returns The derived address.
         */
        static async getAddress(keyPath, walletId) {
            const request = new LedgerApiRequest(RequestType.GET_ADDRESS, async (api, params) => {
                const { address } = await api.getAddress(params.keyPath, true, // validate
                false);
                return address;
            }, {
                walletId,
                keyPath,
            });
            if (!LedgerApi.BIP32_PATH_REGEX.test(keyPath)) {
                this._throwError(ErrorType.REQUEST_ASSERTION_FAILED, `Invalid keyPath ${keyPath}`, request);
            }
            return LedgerApi._callLedger(request);
        }
        /**
         * Confirm that an address belongs to the connected Ledger and display the address to the user on the Ledger screen.
         * @param userFriendlyAddress - The address to check.
         * @param keyPath - The address's bip32 key path.
         * @param [walletId] - Check that the connected wallet corresponds to the given walletId, otherwise throw. Optional.
         * @returns The confirmed address.
         */
        static async confirmAddress(userFriendlyAddress, keyPath, walletId) {
            const request = new LedgerApiRequest(RequestType.CONFIRM_ADDRESS, async (api, params) => {
                const { address: confirmedAddress } = await api.getAddress(params.keyPath, true, // validate
                true);
                if (params.addressToConfirm.replace(/ /g, '').toUpperCase()
                    !== confirmedAddress.replace(/ /g, '').toUpperCase()) {
                    LedgerApi._throwError(ErrorType.REQUEST_ASSERTION_FAILED, 'Address mismatch', request);
                }
                return confirmedAddress;
            }, {
                walletId,
                keyPath,
                addressToConfirm: userFriendlyAddress,
            });
            if (!LedgerApi.BIP32_PATH_REGEX.test(keyPath)) {
                this._throwError(ErrorType.REQUEST_ASSERTION_FAILED, `Invalid keyPath ${keyPath}`, request);
            }
            return LedgerApi._callLedger(request);
        }
        /**
         * Utility function that combines getAddress and confirmAddress to directly get a confirmed address.
         * @param keyPath - The bip32 key path for which to get and confirm the address.
         * @param [walletId] - Check that the connected wallet corresponds to the given walletId, otherwise throw. Optional.
         * @returns The confirmed address.
         */
        static async getConfirmedAddress(keyPath, walletId) {
            const address = await LedgerApi.getAddress(keyPath, walletId);
            return this.confirmAddress(address, keyPath, walletId);
        }
        /**
         * Sign a transaction for a signing key specified by its bip32 key path. Note that the signing key / corresponding
         * address does not necessarily need to be the transaction's sender address for example for transactions sent from
         * vesting contracts.
         * @param transaction - Transaction details, see interface TransactionInfo.
         * @param keyPath - The signing address's bip32 key path.
         * @param [walletId] - Check that the connected wallet corresponds to the given walletId, otherwise throw. Optional.
         * @returns The signed transaction.
         */
        static async signTransaction(transaction, keyPath, walletId) {
            const request = new LedgerApiRequest(RequestType.SIGN_TRANSACTION, async (api, params) => {
                // Note: We make api calls outside of try...catch blocks to let the exceptions fall through such that
                // _callLedger can decide how to behave depending on the api error. All other errors are converted to
                // REQUEST_ASSERTION_FAILED errors which stop the execution of the request.
                const { publicKey: signerPubKeyBytes } = await api.getPublicKey(params.keyPath, true, // validate
                false);
                // Note that the actual load of the Nimiq core and cryptography is triggered in _connect, including
                // error handling. The call here is just used to get the reference to the Nimiq object and can not fail.
                const Nimiq = await this._loadNimiq();
                let nimiqTx;
                let signerPubKey;
                try {
                    const tx = params.transaction;
                    signerPubKey = new Nimiq.PublicKey(signerPubKeyBytes);
                    const senderType = tx.senderType !== undefined && tx.senderType !== null
                        ? tx.senderType
                        : Nimiq.Account.Type.BASIC;
                    const recipientType = tx.recipientType !== undefined && tx.recipientType !== null
                        ? tx.recipientType
                        : Nimiq.Account.Type.BASIC;
                    let { network } = tx;
                    if (!network) {
                        try {
                            network = Nimiq.GenesisConfig.NETWORK_NAME;
                        }
                        catch (e) {
                            // Genesis config not initialized
                            network = 'main';
                        }
                    }
                    const genesisConfig = Nimiq.GenesisConfig.CONFIGS[network];
                    const networkId = genesisConfig.NETWORK_ID;
                    const flags = tx.flags !== undefined && tx.flags !== null
                        ? tx.flags
                        : Nimiq.Transaction.Flag.NONE;
                    const fee = tx.fee || 0;
                    if ((tx.extraData && tx.extraData.length !== 0)
                        || senderType !== Nimiq.Account.Type.BASIC
                        || recipientType !== Nimiq.Account.Type.BASIC
                        || flags !== Nimiq.Transaction.Flag.NONE) {
                        const extraData = tx.extraData ? tx.extraData : new Uint8Array(0);
                        nimiqTx = new Nimiq.ExtendedTransaction(tx.sender, senderType, tx.recipient, recipientType, tx.value, fee, tx.validityStartHeight, flags, extraData, 
                        /* proof */ undefined, networkId);
                    }
                    else {
                        nimiqTx = new Nimiq.BasicTransaction(signerPubKey, tx.recipient, tx.value, fee, tx.validityStartHeight, /* signature */ undefined, networkId);
                    }
                }
                catch (e) {
                    this._throwError(ErrorType.REQUEST_ASSERTION_FAILED, e, request);
                }
                const { signature: signatureBytes } = await api.signTransaction(params.keyPath, nimiqTx.serializeContent());
                try {
                    const signature = new Nimiq.Signature(signatureBytes);
                    if (nimiqTx instanceof Nimiq.BasicTransaction) {
                        nimiqTx.signature = signature;
                    }
                    else {
                        nimiqTx.proof = Nimiq.SignatureProof.singleSig(signerPubKey, signature).serialize();
                    }
                }
                catch (e) {
                    this._throwError(ErrorType.REQUEST_ASSERTION_FAILED, e, request);
                }
                return nimiqTx;
            }, {
                walletId,
                keyPath,
                transaction,
            });
            if (!LedgerApi.BIP32_PATH_REGEX.test(keyPath)) {
                this._throwError(ErrorType.REQUEST_ASSERTION_FAILED, `Invalid keyPath ${keyPath}`, request);
            }
            return LedgerApi._callLedger(request);
        }
        static async _callLedger(request) {
            if (LedgerApi.isBusy) {
                LedgerApi._throwError(ErrorType.LEDGER_BUSY, 'Only one call to Ledger at a time allowed', request);
            }
            LedgerApi._connectionAborted = false; // user is initiating a new request
            try {
                LedgerApi._currentRequest = request;
                /* eslint-disable no-await-in-loop, no-async-promise-executor */
                return await new Promise(async (resolve, reject) => {
                    let canCancelDirectly = false;
                    request.on(LedgerApiRequest.EVENT_CANCEL, () => {
                        // If we can, reject the call right away. Otherwise just notify that the request was requested to be
                        // cancelled such that the user can cancel the call on the ledger.
                        LedgerApi._setState(StateType.REQUEST_CANCELLING);
                        if (canCancelDirectly) {
                            LedgerApi._fire(EventType.REQUEST_CANCELLED, request);
                            reject(new Error('Request cancelled'));
                        }
                    });
                    while (!request.cancelled) {
                        try {
                            const api = await LedgerApi._connect(request.params.walletId);
                            if (request.cancelled)
                                break;
                            if (!request.cancelled) {
                                LedgerApi._setState(StateType.REQUEST_PROCESSING);
                            }
                            canCancelDirectly = false; // sending request which has to be resolved / cancelled by the Ledger
                            const result = await request.call(api);
                            if (request.cancelled)
                                break;
                            LedgerApi._fire(EventType.REQUEST_SUCCESSFUL, request, result);
                            resolve(result);
                            return;
                        }
                        catch (e) {
                            console.debug(e);
                            const message = (e.message || e || '').toLowerCase();
                            const isTimeout = /timeout|u2f device_ineligible|u2f other_error/i.test(message);
                            const isLocked = /locked|0x6804/i.test(message);
                            const isConnectedToDashboard = /incorrect length/i.test(message);
                            if (LedgerApi._transportType === TransportType.U2F || isLocked) {
                                // For u2f we don't get notified about disconnects therefore clear connection on every
                                // exception. When locked clear connection for all transport types as user might unlock with
                                // a different PIN for another wallet.
                                LedgerApi._currentlyConnectedWalletId = null;
                            }
                            if (isTimeout || isConnectedToDashboard)
                                canCancelDirectly = true;
                            // Test whether user cancelled call on ledger
                            if (message.indexOf('denied by the user') !== -1 // user rejected confirmAddress
                                || message.indexOf('request was rejected') !== -1) { // user rejected signTransaction
                                break; // continue after loop
                            }
                            // Errors that should end the request
                            if ((LedgerApi.currentState.error
                                && LedgerApi.currentState.error.type === ErrorType.REQUEST_ASSERTION_FAILED)
                                || message.indexOf('not supported') !== -1) { // no browser support
                                reject(e);
                                return;
                            }
                            // On other errors try again
                            if (!/busy|outdated|connection aborted|user gesture|dependencies|wrong ledger/i.test(message)
                                && !isTimeout && !isLocked && !isConnectedToDashboard) {
                                console.warn('Unknown Ledger Error', e);
                            }
                            // Wait a little when replacing a previous request (see notes at top).
                            const waitTime = isTimeout ? LedgerApi.WAIT_TIME_AFTER_TIMEOUT
                                // If the API tells us that the ledger is busy (see notes at top) use a longer wait time to
                                // reduce the chance that we hit unfortunate 1.5s window after timeout of cancelled call
                                : message.indexOf('busy') !== -1 ? 4 * LedgerApi.WAIT_TIME_AFTER_TIMEOUT
                                    // For other exceptions wait a little to avoid busy endless loop for some exceptions.
                                    : LedgerApi.WAIT_TIME_AFTER_ERROR;
                            await new Promise((resolve2) => setTimeout(resolve2, waitTime));
                        }
                    }
                    LedgerApi._fire(EventType.REQUEST_CANCELLED, request);
                    reject(new Error('Request cancelled'));
                });
                /* eslint-enable no-await-in-loop, no-async-promise-executor */
            }
            finally {
                LedgerApi._currentRequest = null;
                if (LedgerApi._transportType === TransportType.U2F) {
                    LedgerApi._currentlyConnectedWalletId = null; // reset as we don't note when Ledger gets disconnected
                }
                const errorType = LedgerApi.currentState.error ? LedgerApi.currentState.error.type : null;
                if (errorType !== ErrorType.NO_BROWSER_SUPPORT
                    && errorType !== ErrorType.REQUEST_ASSERTION_FAILED) {
                    LedgerApi._setState(StateType.IDLE);
                }
            }
        }
        static async _connect(walletId) {
            // Resolves when connected to unlocked ledger with open Nimiq app otherwise throws an exception after timeout,
            // in contrast to the public connect method which uses getWalletId to listen for a connection or to try to
            // connect repeatedly until success via _callLedger which uses the private _connect under the hood. Also this
            // method is not publicly exposed to avoid that it could be invoked multiple times in parallel which the ledger
            // requests called here do not allow. Additionally, this method exposes the low level api which is private.
            // If the Ledger is already connected and the library already loaded, the call typically takes < 500ms.
            if (LedgerApi._connectionAborted) {
                // When the connection was aborted, don't retry connecting until a manual connection is requested.
                throw new Error('Connection aborted');
            }
            try {
                const nimiqPromise = this._loadNimiq();
                const api = await LedgerApi._initializeLowLevelApi();
                if (!LedgerApi._currentlyConnectedWalletId) {
                    // Not connected yet.
                    LedgerApi._setState(StateType.CONNECTING);
                    // To check whether the connection to Nimiq app is established and to calculate the walletId. Set
                    // validate to false as otherwise the call is much slower. For U2F this can also unfreeze the ledger
                    // app, see notes at top. Using getPublicKey and not getAppConfiguration, as other apps also respond to
                    // getAppConfiguration (for example the Ethereum app).
                    const { publicKey: firstAddressPubKeyBytes } = await api.getPublicKey(LedgerApi.getBip32PathForKeyId(0), false, // validate
                    false);
                    const { version } = await api.getAppConfiguration();
                    if (!LedgerApi._isAppVersionSupported(version))
                        throw new Error('Ledger Nimiq App is outdated.');
                    try {
                        const Nimiq = await nimiqPromise;
                        // Use sha256 as blake2b yields the nimiq address
                        LedgerApi._currentlyConnectedWalletId = Nimiq.Hash.sha256(firstAddressPubKeyBytes).toBase64();
                    }
                    catch (e) {
                        LedgerApi._throwError(ErrorType.LOADING_DEPENDENCIES_FAILED, `Failed loading dependencies: ${e.message || e}`);
                    }
                }
                if (walletId !== undefined && LedgerApi._currentlyConnectedWalletId !== walletId) {
                    throw new Error('Wrong Ledger connected');
                }
                this._fire(EventType.CONNECTED, LedgerApi._currentlyConnectedWalletId);
                return api;
            }
            catch (e) {
                const message = (e.message || e || '').toLowerCase();
                if (message.indexOf('wrong ledger') !== -1) {
                    LedgerApi._throwError(ErrorType.WRONG_LEDGER, e);
                }
                LedgerApi._currentlyConnectedWalletId = null;
                if (message.indexOf('outdated') !== -1) {
                    LedgerApi._throwError(ErrorType.APP_OUTDATED, e);
                }
                else if (message.indexOf('busy') !== -1) {
                    LedgerApi._throwError(ErrorType.LEDGER_BUSY, e);
                }
                // Just rethrow the error and not fire an error state for _initializeDependencies errors which fires error
                // states itself and for other errors (like timeout, dongle locked) that just keep the API retrying.
                throw e;
            }
        }
        static async _initializeLowLevelApi() {
            const transportType = LedgerApi._transportType;
            LedgerApi._lowLevelApiPromise = LedgerApi._lowLevelApiPromise
                || (async () => {
                    const errorType = LedgerApi.currentState.error ? LedgerApi.currentState.error.type : null;
                    if (errorType !== ErrorType.CONNECTION_ABORTED
                        && errorType !== ErrorType.USER_INTERACTION_REQUIRED
                        && errorType !== ErrorType.LOADING_DEPENDENCIES_FAILED) {
                        // On LOADING_DEPENDENCIES_FAILED which repeatedly retries to initialize the api or exceptions which
                        // can only throw when the api was actually loaded successfully, don't reset the state to loading to
                        // avoid switching back and forth between loading and error state.
                        LedgerApi._setState(StateType.LOADING);
                    }
                    if (!transportType)
                        throw new Error('No browser support');
                    const transport = await createTransport(transportType);
                    const onDisconnect = () => {
                        console.debug('Ledger disconnected');
                        transport.off('disconnect', onDisconnect);
                        if (this._transportType !== transportType)
                            return;
                        // A disconnected transport can not be reconnected. Therefore reset the _lowLevelApiPromise.
                        LedgerApi._lowLevelApiPromise = null;
                        LedgerApi._currentlyConnectedWalletId = null;
                    };
                    transport.on('disconnect', onDisconnect);
                    return new LowLevelApi(transport);
                })();
            try {
                const api = await LedgerApi._lowLevelApiPromise;
                if (this._transportType === transportType)
                    return api;
                // Transport type changed while we were connecting; rerun.
                return LedgerApi._initializeLowLevelApi();
            }
            catch (e) {
                if (LedgerApi._transportType === transportType) {
                    LedgerApi._lowLevelApiPromise = null;
                    const message = (e.message || e).toLowerCase();
                    if (/no device selected|access denied/i.test(message)) {
                        if (LedgerApi._transportType === TransportType.WEB_HID) {
                            LedgerApi._connectionAborted = true;
                            LedgerApi._throwError(ErrorType.CONNECTION_ABORTED, `Connection aborted: ${message}`);
                        }
                        else {
                            // Fallback to u2f as the user might not have been able to select his device due to the Nano X
                            // currently not being discoverable via WebUSB in Windows.
                            // Not using setTransportType to bypass the simplified u2f support check (see
                            // transport-utils.ts) which reports missing u2f support on browsers that use an internal
                            // cryptotoken extension. Should u2f really not be supported, the appropriate exception gets
                            // triggered on transport creation.
                            // This fallback also temporarily servers users which have not updated their udev rules yet.
                            // TODO the fallback is just temporary and to be removed once WebUSB with Nano X works on
                            //  Windows or WebHID is more broadly available.
                            console.warn('LedgerApi: switching to u2f as fallback');
                            LedgerApi._transportType = TransportType.U2F;
                        }
                    }
                    else if (message.indexOf('user gesture') !== -1) {
                        LedgerApi._throwError(ErrorType.USER_INTERACTION_REQUIRED, e);
                    }
                    else if (message.indexOf('browser support') !== -1) {
                        LedgerApi._throwError(ErrorType.NO_BROWSER_SUPPORT, 'Ledger not supported by browser or support not enabled.');
                    }
                    else {
                        LedgerApi._throwError(ErrorType.LOADING_DEPENDENCIES_FAILED, `Failed loading dependencies: ${message}`);
                    }
                }
                // Transport type changed while we were connecting; ignore error and rerun
                return LedgerApi._initializeLowLevelApi();
            }
        }
        static async _loadNimiq() {
            // Small helper that throws a "Failed loading dependencies" exception on error. Note that we don't need to cache
            // a promise here as in _initializeLowLevelApi as loadNimiqCore and loadNimiqCryptography already do that.
            try {
                const [Nimiq] = await Promise.all([
                    loadNimiqCore(),
                    // needed for walletId hashing and pub key to address derivation in SignatureProof and BasicTransaction
                    loadNimiqCryptography(),
                ]);
                return Nimiq;
            }
            catch (e) {
                throw new Error(`Failed loading dependencies: ${e.message || e}`);
            }
        }
        static _isAppVersionSupported(versionString) {
            const version = versionString.split('.').map((part) => parseInt(part, 10));
            for (let i = 0; i < LedgerApi.MIN_REQUIRED_APP_VERSION.length; ++i) {
                if (typeof version[i] === 'undefined' || version[i] < LedgerApi.MIN_REQUIRED_APP_VERSION[i])
                    return false;
                if (version[i] > LedgerApi.MIN_REQUIRED_APP_VERSION[i])
                    return true;
            }
            return true;
        }
        static _setState(state) {
            if (typeof state === 'string') {
                // it's an entry from LedgerApi.StateType enum
                state = { type: state };
            }
            state.request = !state.request && LedgerApi._currentRequest ? LedgerApi._currentRequest : state.request;
            if (LedgerApi._currentState.type === state.type
                && (LedgerApi._currentState.error === state.error
                    || (!!LedgerApi._currentState.error && !!state.error
                        && LedgerApi._currentState.error.type === state.error.type))
                && LedgerApi._currentState.request === state.request)
                return;
            LedgerApi._currentState = state;
            LedgerApi._fire(EventType.STATE_CHANGE, state);
        }
        static _throwError(type, error, request) {
            const state = {
                type: StateType.ERROR,
                error: {
                    type,
                    message: typeof error === 'string' ? error : error.message,
                },
            };
            if (request)
                state.request = request;
            LedgerApi._setState(state);
            if (typeof error === 'string') {
                throw new Error(error);
            }
            else {
                throw error;
            }
        }
        static _fire(eventName, ...args) {
            LedgerApi._observable.fire(eventName, ...args);
        }
    }
    // public fields and methods
    LedgerApi.BIP32_BASE_PATH = '44\'/242\'/0\'/';
    LedgerApi.BIP32_PATH_REGEX = new RegExp(`^${LedgerApi.BIP32_BASE_PATH}(\\d+)'$`);
    LedgerApi.MIN_REQUIRED_APP_VERSION = [1, 4, 2];
    LedgerApi.WAIT_TIME_AFTER_TIMEOUT = 1500;
    LedgerApi.WAIT_TIME_AFTER_ERROR = 500;
    // private fields and methods
    LedgerApi._transportType = autoDetectTransportTypeToUse();
    LedgerApi._lowLevelApiPromise = null;
    LedgerApi._currentState = { type: StateType.IDLE };
    LedgerApi._currentRequest = null;
    LedgerApi._currentlyConnectedWalletId = null;
    LedgerApi._connectionAborted = false;
    LedgerApi._observable = new Observable();
    return LedgerApi;
})();
//# sourceMappingURL=ledger-api.js.map

export default LedgerApi;
export { ErrorType, EventType, RequestType, StateType, TransportType, isSupported };
//# sourceMappingURL=ledger-api.es.js.map
