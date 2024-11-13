class Observable {
    _listeners = new Map();
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

// Constant shared between the low-level-api and the high-level-api.
// As a separate file to be able to use these constants in the main chunk without the need to import the entire lazy
// chunks of the low level api, and to avoid circular dependencies between main entry and other files.
var NimiqVersion;
(function (NimiqVersion) {
    NimiqVersion["ALBATROSS"] = "albatross";
    NimiqVersion["LEGACY"] = "legacy";
})(NimiqVersion || (NimiqVersion = {}));

/// <reference path="../lib/type-shims.d.ts" />
var TransportType;
(function (TransportType) {
    TransportType["WEB_HID"] = "web-hid";
    TransportType["WEB_USB"] = "web-usb";
    TransportType["WEB_BLE"] = "web-ble";
    TransportType["WEB_AUTHN"] = "web-authn";
    TransportType["U2F"] = "u2f";
    TransportType["NETWORK"] = "network";
})(TransportType || (TransportType = {}));
function isSupported(transportType) {
    if (!transportType)
        return !!autoDetectTransportTypeToUse();
    if (transportType !== TransportType.NETWORK && window.location.protocol !== 'https:')
        return false;
    // inspired by @ledgerhq/hw-transport libs
    switch (transportType) {
        case TransportType.WEB_HID:
            return 'hid' in window.navigator;
        case TransportType.WEB_USB:
            // @ts-ignore
            return 'usb' in window.navigator && typeof window.navigator.usb.getDevices === 'function';
        case TransportType.WEB_BLE:
            return 'bluetooth' in window.navigator;
        case TransportType.WEB_AUTHN:
            return !!navigator.credentials;
        case TransportType.U2F:
            // Note that Chrome, Opera and Edge use an internal, hidden cryptotoken extension to handle u2f
            // (https://github.com/google/u2f-ref-code/blob/master/u2f-gae-demo/war/js/u2f-api.js) which does not
            // expose the u2f api on window. Support via that extension is not detected by this check. However, as
            // these browsers support WebUSB, this is acceptable and we don't use a more elaborate check like the one
            // in the 'u2f-api' package to avoid bundling it and also because it's async, complicating the code.
            // @ts-ignore
            return 'u2f' in window && typeof window.u2f.sign === 'function';
        case TransportType.NETWORK:
            return 'fetch' in window && 'WebSocket' in window;
        default:
            return false;
    }
}
function autoDetectTransportTypeToUse() {
    // Determine the best available transport type. Exclude WebBle as it's only suitable for Nano X.
    // See transport-comparison.md for a more complete comparison of different transport types.
    // TODO once the Ledger Live WebSocket bridge is available to users, add TransportType.NETWORK
    const transportTypesByPreference = [
        // WebHID is preferable over WebUSB because Chrome 91 broke the WebUSB support. Also WebHID has better
        // compatibility on Windows due to driver issues for WebUSB for the Nano X.
        TransportType.WEB_HID,
        // If WebHID is not available, WebUSB generally also works well.
        TransportType.WEB_USB,
        // WebAuthn and U2F as fallbacks which are generally less stable though and can time out. They also cause native
        // Windows security prompts in Windows and additionally Firefox internal popups in Firefox on all platforms.
        // WebAuthn preferred over U2F, as compared to U2F better browser support and less quirky / not deprecated
        // and works better with Nano X. But causes a popup in Chrome which U2F does not.
        TransportType.WEB_AUTHN,
        // U2F as last resort.
        TransportType.U2F,
    ];
    return transportTypesByPreference.find(isSupported) || null;
}
let networkEndpoint = 'ws://127.0.0.1:8435'; // Ledger Live WebSocket bridge default endpoint
/**
 * Set the network endpoint for TransportType.NETWORK. Supported are http/https and ws/wss endpoints.
 * @param endpoint
 */
function setNetworkEndpoint(endpoint) {
    networkEndpoint = endpoint;
}
function getNetworkEndpoint() {
    return networkEndpoint;
}
/**
 * Lazy load the library for a transport type.
 * @param transportType
 */
async function loadTransportLibrary(transportType) {
    switch (transportType) {
        case TransportType.WEB_HID:
            return (await [import('./lazy-chunk-index.es.js'), import('./lazy-chunk-Transport.es.js'), import('./lazy-chunk-hid-framing.es.js'), import('./lazy-chunk-index.es2.js'), import('./lazy-chunk-index.es3.js'), import('./lazy-chunk-events.es.js'), import('./lazy-chunk-_commonjsHelpers.es.js'), import('./lazy-chunk-_virtual_process.es.js'), import('./lazy-chunk-index.es4.js'), import('./lazy-chunk-TransportWebHID.es.js')][9]).default;
        case TransportType.WEB_USB:
            return (await [import('./lazy-chunk-index.es.js'), import('./lazy-chunk-Transport.es.js'), import('./lazy-chunk-hid-framing.es.js'), import('./lazy-chunk-index.es2.js'), import('./lazy-chunk-index.es3.js'), import('./lazy-chunk-events.es.js'), import('./lazy-chunk-_commonjsHelpers.es.js'), import('./lazy-chunk-_virtual_process.es.js'), import('./lazy-chunk-index.es4.js'), import('./lazy-chunk-TransportWebUSB.es.js')][9]).default;
        case TransportType.WEB_BLE:
            return (await [import('./lazy-chunk-index.es.js'), import('./lazy-chunk-Transport.es.js'), import('./lazy-chunk-index.es2.js'), import('./lazy-chunk-index.es3.js'), import('./lazy-chunk-events.es.js'), import('./lazy-chunk-_commonjsHelpers.es.js'), import('./lazy-chunk-_virtual_process.es.js'), import('./lazy-chunk-index.es4.js'), import('./lazy-chunk-TransportWebBLE.es.js')][8]).default;
        case TransportType.WEB_AUTHN:
            return (await [import('./lazy-chunk-index.es.js'), import('./lazy-chunk-_commonjsHelpers.es.js'), import('./lazy-chunk-TransportWebAuthn.es.js')][2]).default;
        case TransportType.U2F:
            return (await [import('./lazy-chunk-index.es.js'), import('./lazy-chunk-_commonjsHelpers.es.js'), import('./lazy-chunk-TransportU2F.es.js')][2]).default;
        case TransportType.NETWORK:
            return (await [import('./lazy-chunk-index.es.js'), import('./lazy-chunk-Transport.es.js'), import('./lazy-chunk-index.es3.js'), import('./lazy-chunk-events.es.js'), import('./lazy-chunk-_commonjsHelpers.es.js'), import('./lazy-chunk-withStaticURLs.es.js')][5]).default([networkEndpoint]);
        default:
            throw new Error(`Unknown transport type ${transportType}`);
    }
}

function isAppSupported(app, requiredApp, allowLegacyApp, allowSpeculos) {
    return app === requiredApp
        || (allowLegacyApp && app === getLegacyApp(requiredApp))
        || (allowSpeculos && app === 'app'); // speculos reports 'app' as appName
}
function isAppVersionSupported(versionString, minRequiredVersion) {
    const version = versionString.split('.').map((part) => parseInt(part, 10));
    const parsedMinRequiredVersion = minRequiredVersion.split('.').map((part) => parseInt(part, 10));
    for (let i = 0; i < minRequiredVersion.length; ++i) {
        if (typeof version[i] === 'undefined' || version[i] < parsedMinRequiredVersion[i])
            return false;
        if (version[i] > parsedMinRequiredVersion[i])
            return true;
    }
    return true;
}
function isLegacyApp(app) {
    return app.endsWith(' Legacy');
}
function getLegacyApp(app) {
    // Add ' Legacy' suffix to the app name, or preserve it if it already exists.
    return app.replace(/(?: Legacy)?$/, ' Legacy');
}

// Constants for the high-level-api needed in lazy chunks and the main chunk.
// As a separate file to be able to use these constants in the main chunk without the need to import the entire lazy
// chunks and to avoid circular dependencies between main entry and other files.
var Coin;
(function (Coin) {
    Coin["NIMIQ"] = "Nimiq";
    Coin["BITCOIN"] = "Bitcoin";
})(Coin || (Coin = {}));
var Network;
(function (Network) {
    Network["MAINNET"] = "main";
    Network["TESTNET"] = "test";
    Network["DEVNET"] = "dev";
})(Network || (Network = {}));
// See https://github.com/nimiq/core-rs-albatross/blob/albatross/primitives/src/networks.rs
const NetworkIdNimiq = {
    [Network.MAINNET]: 24,
    [Network.TESTNET]: 5,
    [Network.DEVNET]: 6,
    [NimiqVersion.LEGACY]: {
        [Network.MAINNET]: 42,
        [Network.TESTNET]: 1,
        [Network.DEVNET]: 2,
    },
};
// See https://github.com/nimiq/core-rs-albatross/blob/albatross/primitives/src/account.rs
// We redefine this enum, to avoid Nimiq core being bundled, or parts of it.
var AccountTypeNimiq;
(function (AccountTypeNimiq) {
    AccountTypeNimiq[AccountTypeNimiq["BASIC"] = 0] = "BASIC";
    AccountTypeNimiq[AccountTypeNimiq["VESTING"] = 1] = "VESTING";
    AccountTypeNimiq[AccountTypeNimiq["HTLC"] = 2] = "HTLC";
    AccountTypeNimiq[AccountTypeNimiq["STAKING"] = 3] = "STAKING";
})(AccountTypeNimiq || (AccountTypeNimiq = {}));
// See https://github.com/nimiq/core-rs-albatross/blob/albatross/primitives/transaction/src/lib.rs
var TransactionFlagsNimiq;
(function (TransactionFlagsNimiq) {
    TransactionFlagsNimiq[TransactionFlagsNimiq["NONE"] = 0] = "NONE";
    TransactionFlagsNimiq[TransactionFlagsNimiq["CONTRACT_CREATION"] = 1] = "CONTRACT_CREATION";
    TransactionFlagsNimiq[TransactionFlagsNimiq["SIGNALING"] = 2] = "SIGNALING";
})(TransactionFlagsNimiq || (TransactionFlagsNimiq = {}));
var AddressTypeBitcoin;
(function (AddressTypeBitcoin) {
    AddressTypeBitcoin["LEGACY"] = "legacy-bitcoin";
    AddressTypeBitcoin["P2SH_SEGWIT"] = "p2sh-segwit-bitcoin";
    AddressTypeBitcoin["NATIVE_SEGWIT"] = "native-segwit-bitcoin";
})(AddressTypeBitcoin || (AddressTypeBitcoin = {}));
const LedgerAddressFormatMapBitcoin = {
    [AddressTypeBitcoin.LEGACY]: 'legacy',
    [AddressTypeBitcoin.P2SH_SEGWIT]: 'p2sh',
    [AddressTypeBitcoin.NATIVE_SEGWIT]: 'bech32',
};
const REQUEST_EVENT_CANCEL = 'cancel';
var RequestTypeNimiq;
(function (RequestTypeNimiq) {
    RequestTypeNimiq["GET_WALLET_ID"] = "get-wallet-id-nimiq";
    RequestTypeNimiq["DERIVE_ADDRESSES"] = "derive-addresses-nimiq";
    RequestTypeNimiq["GET_PUBLIC_KEY"] = "get-public-key-nimiq";
    RequestTypeNimiq["GET_ADDRESS"] = "get-address-nimiq";
    RequestTypeNimiq["SIGN_TRANSACTION"] = "sign-transaction-nimiq";
    RequestTypeNimiq["SIGN_MESSAGE"] = "sign-message-nimiq";
})(RequestTypeNimiq || (RequestTypeNimiq = {}));
var RequestTypeBitcoin;
(function (RequestTypeBitcoin) {
    RequestTypeBitcoin["GET_WALLET_ID"] = "get-wallet-id-bitcoin";
    RequestTypeBitcoin["GET_ADDRESS_AND_PUBLIC_KEY"] = "get-address-and-public-key-bitcoin";
    RequestTypeBitcoin["GET_EXTENDED_PUBLIC_KEY"] = "get-extended-public-key-bitcoin";
    RequestTypeBitcoin["SIGN_TRANSACTION"] = "sign-transaction-bitcoin";
    RequestTypeBitcoin["SIGN_MESSAGE"] = "sign-message-bitcoin";
})(RequestTypeBitcoin || (RequestTypeBitcoin = {}));

// See BIP44
const PATH_REGEX = new RegExp('^'
    + '(?:m/)?' // optional m/ prefix
    + '(\\d+)\'/' // purpose id; BIP44 (BTC legacy or Nimiq) / BIP49 (BTC nested SegWit) / BIP84 (BTC native SegWit)
    + '(\\d+)\'/' // coin type; 0 for Bitcoin Mainnet, 1 for Bitcoin Testnet, 242 for Nimiq
    + '(\\d+)\'/' // account index
    + '(?:(\\d+)/)?' // 0 for external or 1 for internal address (change); non-hardened; unset for Nimiq
    + '(\\d+)(\'?)' // address index; non-hardened for BTC, hardened for Nimiq
    + '$');
const PURPOSE_ID_MAP_BITCOIN = new Map([
    [AddressTypeBitcoin.LEGACY, 44],
    [AddressTypeBitcoin.P2SH_SEGWIT, 49],
    [AddressTypeBitcoin.NATIVE_SEGWIT, 84],
]);
/**
 * Generate a bip32 path according to path layout specified in bip44 for the specified parameters.
 */
function getBip32Path(params) {
    // set defaults
    params = {
        accountIndex: 0,
        ...params,
    };
    switch (params.coin) {
        case Coin.NIMIQ:
            return `44'/242'/${params.accountIndex}'/${params.addressIndex}'`; // Nimiq paths are fully hardened
        case Coin.BITCOIN: {
            // set bitcoin specific defaults
            params = {
                addressType: AddressTypeBitcoin.NATIVE_SEGWIT,
                network: Network.MAINNET,
                isInternal: false,
                ...params,
            };
            const purposeId = PURPOSE_ID_MAP_BITCOIN.get(params.addressType);
            const coinType = params.network === Network.TESTNET ? 1 : 0;
            const changeType = params.isInternal ? 1 : 0;
            return `${purposeId}'/${coinType}'/${params.accountIndex}'/${changeType}/${params.addressIndex}`;
        }
        default:
            throw new Error(`Unsupported coin: ${params.coin}`);
    }
}
/**
 * Parse bip32 path according to path layout specified in bip44.
 */
function parseBip32Path(path) {
    const pathMatch = path.match(PATH_REGEX);
    if (!pathMatch)
        throw new Error(`${path} is not a supported bip32 path.`);
    const purposeId = parseInt(pathMatch[1], 10);
    const coinType = parseInt(pathMatch[2], 10);
    const accountIndex = parseInt(pathMatch[3], 10);
    const changeType = pathMatch[4];
    const addressIndex = parseInt(pathMatch[5], 10);
    const isAddressIndexHardened = !!pathMatch[6];
    // Check indices for validity according to bip32. No need to check for negative or fractional numbers, as these are
    // not accepted by the regex.
    if (accountIndex >= 2 ** 31 || addressIndex >= 2 ** 31)
        throw new Error('Invalid index');
    const accountPath = `${purposeId}'/${coinType}'/${accountIndex}'`;
    switch (coinType) {
        case 242:
            // Nimiq
            if (purposeId !== 44)
                throw new Error('Purpose id must be 44 for Nimiq');
            if (changeType !== undefined)
                throw new Error('Specifying a change type is not supported for Nimiq');
            if (!isAddressIndexHardened)
                throw new Error('Address index must be hardened for Nimiq');
            return {
                coin: Coin.NIMIQ,
                accountIndex,
                addressIndex,
                accountPath,
            };
        case 0:
        case 1: {
            // Bitcoin
            const knownPurposeIds = [...PURPOSE_ID_MAP_BITCOIN.values()];
            if (!knownPurposeIds.includes(purposeId))
                throw new Error('Purpose id must be 44, 49 or 84 for Bitcoin');
            if (changeType === undefined)
                throw new Error('Specifying a change type is required for Bitcoin');
            if (changeType !== '0' && changeType !== '1')
                throw new Error('Invalid change type for Bitcoin');
            if (isAddressIndexHardened)
                throw new Error('Address index must not be hardened for Bitcoin');
            const addressType = [...PURPOSE_ID_MAP_BITCOIN.entries()].find(([, pId]) => pId === purposeId)[0];
            const network = coinType === 0 ? Network.MAINNET : Network.TESTNET;
            const isInternal = changeType === '1';
            return {
                coin: Coin.BITCOIN,
                accountIndex,
                addressIndex,
                addressType,
                network,
                isInternal,
                accountPath,
            };
        }
        default:
            throw new Error(`Unsupported coin type ${coinType}`);
    }
}

var ErrorType;
(function (ErrorType) {
    ErrorType["LEDGER_BUSY"] = "ledger-busy";
    ErrorType["LOADING_DEPENDENCIES_FAILED"] = "loading-dependencies-failed";
    ErrorType["USER_INTERACTION_REQUIRED"] = "user-interaction-required";
    ErrorType["CONNECTION_ABORTED"] = "connection-aborted";
    ErrorType["BROWSER_UNSUPPORTED"] = "browser-unsupported";
    ErrorType["APP_OUTDATED"] = "app-outdated";
    ErrorType["WRONG_WALLET"] = "wrong-wallet";
    ErrorType["WRONG_APP"] = "wrong-app";
    ErrorType["REQUEST_ASSERTION_FAILED"] = "request-specific-error";
})(ErrorType || (ErrorType = {}));
class ErrorState extends Error {
    type = 'error'; // state type
    errorType;
    // request specified as SpecificRequest instead of RequestBase such that an app using the api knows what request
    // types to expect here.
    request;
    constructor(errorType, messageOrError, 
    // request specified as RequestBase here to allow simple throwing from a SpecificRequest parent class.
    request) {
        super(messageOrError.toString());
        if (messageOrError instanceof Error && messageOrError.stack) {
            this.stack = messageOrError.stack;
        }
        else if (Error.captureStackTrace) {
            // Maintains proper stack trace for where our error was thrown (only available on V8), see
            // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error#Custom_Error_Types
            Error.captureStackTrace(this, ErrorState);
        }
        this.name = 'LedgerErrorState';
        this.errorType = errorType;
        this.request = request;
    }
}

var StateType;
(function (StateType) {
    StateType["IDLE"] = "idle";
    StateType["LOADING"] = "loading";
    StateType["CONNECTING"] = "connecting";
    StateType["REQUEST_PROCESSING"] = "request-processing";
    StateType["REQUEST_CANCELLING"] = "request-cancelling";
    StateType["ERROR"] = "error";
})(StateType || (StateType = {}));
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
class LedgerApi {
    // public fields and methods
    static WAIT_TIME_AFTER_TIMEOUT = 1500;
    static WAIT_TIME_AFTER_ERROR = 500;
    static Nimiq = {
        /**
         * Get the 32 byte wallet id of the currently connected Nimiq wallet as base64.
         */
        async getWalletId(nimiqVersion = NimiqVersion.ALBATROSS) {
            return LedgerApi._callLedger(await LedgerApi._createRequest([import('./lazy-chunk-request-nimiq.es.js'), import('./lazy-chunk-request.es.js'), import('./lazy-chunk-request-get-wallet-id-nimiq.es.js')][2], nimiqVersion));
        },
        /**
         * Get the public key for a given bip32 key path. Optionally expect a specific wallet id.
         */
        async getPublicKey(keyPath, expectedWalletId, nimiqVersion = NimiqVersion.ALBATROSS) {
            return LedgerApi._callLedger(await LedgerApi._createRequest([import('./lazy-chunk-request-with-key-path-nimiq.es.js'), import('./lazy-chunk-request-nimiq.es.js'), import('./lazy-chunk-request.es.js'), import('./lazy-chunk-request-get-public-key-nimiq.es.js')][3], nimiqVersion, keyPath, expectedWalletId));
        },
        /**
         * Get the address for a given bip32 key path. Optionally display the address on the Ledger screen for
         * verification, expect a specific address or expect a specific wallet id.
         */
        async getAddress(keyPath, display = false, expectedAddress, expectedWalletId, nimiqVersion = NimiqVersion.ALBATROSS) {
            return LedgerApi._callLedger(await LedgerApi._createRequest([import('./lazy-chunk-request-with-key-path-nimiq.es.js'), import('./lazy-chunk-request-nimiq.es.js'), import('./lazy-chunk-request.es.js'), import('./lazy-chunk-request-get-address-nimiq.es.js')][3], nimiqVersion, keyPath, display, expectedAddress, expectedWalletId));
        },
        /**
         * Utility function that directly gets a confirmed address.
         */
        async getConfirmedAddress(keyPath, expectedWalletId, nimiqVersion = NimiqVersion.ALBATROSS) {
            const address = await LedgerApi.Nimiq.getAddress(keyPath, false, undefined, expectedWalletId, nimiqVersion);
            return LedgerApi.Nimiq.getAddress(keyPath, true, address, expectedWalletId, nimiqVersion);
        },
        /**
         * Derive addresses for given bip32 key paths. Optionally expect a specific wallet id.
         */
        async deriveAddresses(pathsToDerive, expectedWalletId, nimiqVersion = NimiqVersion.ALBATROSS) {
            return LedgerApi._callLedger(await LedgerApi._createRequest([import('./lazy-chunk-request-nimiq.es.js'), import('./lazy-chunk-request.es.js'), import('./lazy-chunk-request-derive-addresses-nimiq.es.js')][2], nimiqVersion, pathsToDerive, expectedWalletId));
        },
        /**
         * Sign a transaction for a signing key specified by its bip32 key path. Note that the signing key /
         * corresponding address does not necessarily need to be the transaction's sender address for example for
         * transactions sent from vesting contracts. Optionally expect a specific wallet id.
         */
        async signTransaction(transaction, keyPath, expectedWalletId, nimiqVersion = NimiqVersion.ALBATROSS) {
            return LedgerApi._callLedger(await LedgerApi._createRequest([import('./lazy-chunk-request-with-key-path-nimiq.es.js'), import('./lazy-chunk-request-nimiq.es.js'), import('./lazy-chunk-request.es.js'), import('./lazy-chunk-request-sign-transaction-nimiq.es.js')][3], nimiqVersion, keyPath, transaction, expectedWalletId));
        },
        /**
         * Sign a message for a signing key specified by its bip32 key path. The message can be either an
         * utf8 string or an Uint8Array of arbitrary data. Optionally request the message to preferably be displayed as
         * hex or hash instead of as ascii, or expect a specific wallet id. If no preference for the display type is
         * specified, the message is by default tried to be displayed as ascii, hex or hash, in that order.
         */
        async signMessage(message, keyPath, flags, expectedWalletId, nimiqVersion = NimiqVersion.ALBATROSS) {
            return await LedgerApi._callLedger(await LedgerApi._createRequest([import('./lazy-chunk-index.es.js'), import('./lazy-chunk-request-with-key-path-nimiq.es.js'), import('./lazy-chunk-request-nimiq.es.js'), import('./lazy-chunk-request.es.js'), import('./lazy-chunk-request-sign-message-nimiq.es.js')][4], nimiqVersion, keyPath, message, flags, expectedWalletId));
        },
    };
    static Bitcoin = {
        /**
         * Get the 32 byte wallet id of the currently connected Bitcoin wallet / app for a specific network as base64.
         */
        async getWalletId(network) {
            return LedgerApi._callLedger(await LedgerApi._createRequest([import('./lazy-chunk-request-bitcoin.es.js'), import('./lazy-chunk-request.es.js'), import('./lazy-chunk-request-get-wallet-id-bitcoin.es.js')][2], network));
        },
        /**
         * Get the public key, address and bip32 chain code for a given bip32 key path. Optionally display the address
         * on the Ledger screen for verification, expect a specific address or expect a specific wallet id.
         */
        async getAddressAndPublicKey(keyPath, display = false, expectedAddress, expectedWalletId) {
            return LedgerApi._callLedger(await LedgerApi._createRequest([import('./lazy-chunk-request-bitcoin.es.js'), import('./lazy-chunk-request.es.js'), import('./lazy-chunk-request-get-address-and-public-key-bitcoin.es.js')][2], keyPath, display, expectedAddress, expectedWalletId));
        },
        /**
         * Utility function that directly gets a confirmed address.
         */
        async getConfirmedAddressAndPublicKey(keyPath, expectedWalletId) {
            const { address } = await LedgerApi.Bitcoin.getAddressAndPublicKey(keyPath, false, undefined, expectedWalletId);
            return LedgerApi.Bitcoin.getAddressAndPublicKey(keyPath, true, address, expectedWalletId);
        },
        /**
         * Get the extended public key for a bip32 path from which addresses can be derived, encoded as specified in
         * bip32. The key path must follow the bip44 specification and at least be defined to the account level.
         * Optionally expect a specific wallet id.
         */
        async getExtendedPublicKey(keyPath, expectedWalletId) {
            return LedgerApi._callLedger(await LedgerApi._createRequest([import('./lazy-chunk-index.es.js'), import('./lazy-chunk-request-bitcoin.es.js'), import('./lazy-chunk-request.es.js'), import('./lazy-chunk-request-get-extended-public-key-bitcoin.es.js')][3], keyPath, expectedWalletId));
        },
        /**
         * Sign a transaction. See type declaration of TransactionInfoBitcoin in request-sign-transaction-bitcoin.ts
         * for documentation of the transaction format. Optionally expect a specific wallet id. The signed transaction
         * is returned in hex-encoded serialized form ready to be broadcast to the network.
         */
        async signTransaction(transaction, expectedWalletId) {
            return LedgerApi._callLedger(await LedgerApi._createRequest([import('./lazy-chunk-index.es.js'), import('./lazy-chunk-request-bitcoin.es.js'), import('./lazy-chunk-request.es.js'), import('./lazy-chunk-request-sign-transaction-bitcoin.es.js')][3], transaction, expectedWalletId));
        },
        /**
         * Sign a message according to bip137 with the key specified via its bip32 path. The message can be either an
         * utf8 string or an Uint8Array of arbitrary data. Optionally expect a specific wallet id. The resulting
         * signature is base64 encoded.
         */
        async signMessage(message, keyPath, expectedWalletId) {
            return LedgerApi._callLedger(await LedgerApi._createRequest([import('./lazy-chunk-index.es.js'), import('./lazy-chunk-request-bitcoin.es.js'), import('./lazy-chunk-request.es.js'), import('./lazy-chunk-request-sign-message-bitcoin.es.js')][3], keyPath, message, expectedWalletId));
        },
    };
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
    static setTransportType(transportType, networkEndpoint) {
        if (!isSupported(transportType))
            throw new Error('Unsupported transport type.');
        if (transportType === LedgerApi._transportType
            && (!networkEndpoint || networkEndpoint === getNetworkEndpoint()))
            return;
        LedgerApi._transportType = transportType;
        if (transportType === TransportType.NETWORK && networkEndpoint) {
            setNetworkEndpoint(networkEndpoint);
        }
        // Close api for current transport to create a new one for specified transport type on next request.
        LedgerApi.disconnect(/* cancelRequest */ false);
    }
    static resetTransportType() {
        const transportType = autoDetectTransportTypeToUse();
        if (!transportType)
            return;
        LedgerApi.setTransportType(transportType);
    }
    static async connect(coin, nimiqVersionOrBitcoinNetwork) {
        const nimiqVersion = nimiqVersionOrBitcoinNetwork === NimiqVersion.LEGACY
            ? NimiqVersion.LEGACY
            : NimiqVersion.ALBATROSS;
        const bitcoinNetwork = nimiqVersionOrBitcoinNetwork === Network.TESTNET
            ? Network.TESTNET
            : Network.MAINNET;
        LedgerApi._connectionAborted = false; // reset aborted flag on manual connection
        try {
            const { currentRequest, _currentConnection: currentConnection } = LedgerApi;
            const expectedApp = coin === Coin.NIMIQ
                ? 'Nimiq'
                : `Bitcoin${bitcoinNetwork === Network.TESTNET ? ' Test' : ''}`;
            if (currentConnection && currentConnection.coin === coin && isAppSupported(currentConnection.app, expectedApp, 
            /* allowLegacy */ coin === Coin.BITCOIN, 
            /* allowSpeculos */ true)) {
                // Already connected.
                return true;
            }
            if (currentRequest && currentRequest.coin === coin
                && (!('network' in currentRequest) || currentRequest.network === bitcoinNetwork)) {
                // Wait for the ongoing request for coin to connect.
                // Initialize the transport again if it failed previously, for example due to missing user interaction.
                await LedgerApi._getTransport(currentRequest);
                await new Promise((resolve, reject) => {
                    const onConnect = () => {
                        LedgerApi.off(EventType.CONNECTED, onConnect);
                        LedgerApi.off(EventType.REQUEST_CANCELLED, onCancel);
                        resolve();
                    };
                    const onCancel = () => {
                        LedgerApi.off(EventType.CONNECTED, onConnect);
                        LedgerApi.off(EventType.REQUEST_CANCELLED, onCancel);
                        reject(new Error('Request cancelled')); // request cancelled via api before ledger connected
                    };
                    LedgerApi.on(EventType.CONNECTED, onConnect);
                    LedgerApi.on(EventType.REQUEST_CANCELLED, onCancel);
                });
                return true;
            }
            // Send a request to establish a connection and detect when the ledger is connected.
            // Note that if the api is already busy with a request for another coin false will be returned.
            switch (coin) {
                case Coin.NIMIQ:
                    await LedgerApi.Nimiq.getWalletId(nimiqVersion);
                    return true;
                case Coin.BITCOIN:
                    await LedgerApi.Bitcoin.getWalletId(bitcoinNetwork);
                    return true;
                default:
                    throw new Error(`Unsupported coin: ${coin}`);
            }
        }
        catch (e) {
            if (e instanceof ErrorState) {
                LedgerApi._setState(e);
            }
            return false;
        }
    }
    /**
     * Disconnect the api and clean up.
     * @param cancelRequest - Whether to cancel an ongoing request.
     * @param requestTypesToDisconnect - If specified, only disconnect if no request is going on or if the ongoing
     *  request is of the specified type.
     */
    static async disconnect(cancelRequest = true, requestTypesToDisconnect) {
        const { currentRequest } = LedgerApi;
        if (currentRequest) {
            if (requestTypesToDisconnect !== undefined) {
                requestTypesToDisconnect = Array.isArray(requestTypesToDisconnect)
                    ? requestTypesToDisconnect
                    : [requestTypesToDisconnect];
                if (!requestTypesToDisconnect.includes(currentRequest.type))
                    return;
            }
            if (cancelRequest) {
                currentRequest.cancel();
            }
        }
        const transportPromise = LedgerApi._transportPromise;
        LedgerApi._transportPromise = null;
        LedgerApi._currentConnection = null;
        if (!transportPromise)
            return;
        try {
            const api = await transportPromise;
            await api.close();
        }
        catch (e) {
            // Ignore.
        }
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
    // private fields and methods
    static _transportType = autoDetectTransportTypeToUse();
    static _transportPromise = null;
    static _currentState = { type: StateType.IDLE };
    static _currentRequest = null;
    static _currentConnection = null;
    static _connectionAborted = false;
    static _observable = new Observable();
    static async _createRequest(requestConstructor, ...params) {
        if (LedgerApi.transportType) {
            // Prepare transport dependency in parallel. Ignore errors as it's just a preparation.
            loadTransportLibrary(LedgerApi.transportType).catch(() => { });
        }
        if (requestConstructor instanceof Promise) {
            try {
                requestConstructor = (await requestConstructor).default;
            }
            catch (e) {
                const error = new ErrorState(ErrorType.LOADING_DEPENDENCIES_FAILED, `Failed loading dependencies: ${e instanceof Error ? e.message : e}`, undefined);
                LedgerApi._setState(error);
                throw error;
            }
        }
        try {
            // Note that the requestConstructor is typed as is instead of just RC | Promise<{ default: RC }> such that
            // typescript can determine which exact request is being created and returned.
            return new requestConstructor(...params); // eslint-disable-line new-cap
        }
        catch (e) {
            if (e instanceof ErrorState) {
                LedgerApi._setState(e);
            }
            throw e;
        }
    }
    static async _callLedger(request) {
        if (LedgerApi.isBusy) {
            const error = new ErrorState(ErrorType.LEDGER_BUSY, 'Only one call to Ledger at a time allowed', request);
            LedgerApi._setState(error);
            throw error;
        }
        LedgerApi._connectionAborted = false; // user is initiating a new request
        try {
            LedgerApi._currentRequest = request;
            /* eslint-disable no-await-in-loop, no-async-promise-executor */
            return await new Promise(async (resolve, reject) => {
                let lastRequestCallTime = -1;
                let canCancelDirectly = true;
                let cancelFired = false;
                request.on(REQUEST_EVENT_CANCEL, () => {
                    // If we can, reject the call right away. Otherwise just notify that the request was requested to be
                    // cancelled such that the user can cancel the call on the ledger.
                    if (canCancelDirectly) {
                        // Note that !!_currentConnection is not an indicator that we can cancel directly, as it's just
                        // an estimate and we might not actually be disconnected or the request might already have been
                        // sent before disconnecting.
                        if (!cancelFired) {
                            LedgerApi._fire(EventType.REQUEST_CANCELLED, request);
                            cancelFired = true;
                        }
                        reject(new Error('Request cancelled'));
                    }
                    else {
                        LedgerApi._setState(StateType.REQUEST_CANCELLING);
                    }
                });
                while (!request.cancelled) {
                    try {
                        const transport = await LedgerApi._getTransport(request);
                        if (request.cancelled)
                            break;
                        await LedgerApi._connect(transport, request);
                        if (request.cancelled)
                            break;
                        LedgerApi._setState(StateType.REQUEST_PROCESSING);
                        lastRequestCallTime = Date.now();
                        canCancelDirectly = false; // sending request which has to be resolved / cancelled by the Ledger
                        const result = await request.call(transport);
                        if (request.cancelled)
                            break;
                        LedgerApi._fire(EventType.REQUEST_SUCCESSFUL, request, result);
                        resolve(result);
                        return;
                    }
                    catch (e) {
                        console.debug(e);
                        if (e instanceof ErrorState) {
                            LedgerApi._setState(e);
                        }
                        const message = (e instanceof Error ? e.message : String(e)).toLowerCase();
                        // "timeout" used to happen for u2f, it's "device_ineligible" or "other_error" now (see
                        // transport-comparison.md). "timed out" is for Chrome WebAuthn timeout; "denied permission" for
                        // Firefox WebAuthn timeout.
                        const isTimeout = /timeout|timed out|denied permission|u2f device_ineligible|u2f other_error/i
                            .test(message);
                        const isLocked = /locked|0x6804/i.test(message);
                        const isConnectedToDashboard = /incorrect length/i.test(message);
                        canCancelDirectly = canCancelDirectly || isTimeout || isConnectedToDashboard;
                        if (LedgerApi._transportType === TransportType.U2F
                            || LedgerApi._transportType === TransportType.WEB_AUTHN
                            || isLocked) {
                            // For u2f / webauthn we don't get notified about disconnects therefore clear connection on
                            // every exception. When locked clear connection for all transport types as user might
                            // unlock with a different PIN for another wallet.
                            LedgerApi._currentConnection = null;
                        }
                        // Test whether user cancelled call on ledger device or in WebAuthn / U2F browser popup
                        if (message.indexOf('denied by the user') !== -1 // user rejected confirmAddress on device
                            || message.indexOf('request was rejected') !== -1 // user rejected signTransaction on device
                            || (LedgerApi._isWebAuthnOrU2fCancellation(message, lastRequestCallTime)
                                && !LedgerApi._connectionAborted)) {
                            // Note that on _isWebAuthnOrU2fCancellation we can cancel directly and don't need the user
                            // to cancel the request on the device as Ledger Nano S is now able to clean up old WebAuthn
                            // and U2F requests and the the Nano X lets the Nimiq App crash anyways after the WebAuthn /
                            // U2F host was lost. If the web authn / u2f cancellation was during connect and caused
                            // _connectionAborted, don't cancel the request.
                            canCancelDirectly = true;
                            request.cancel(); // in case the request was not marked as cancelled before
                            break; // continue after loop where the actual cancellation happens
                        }
                        // Errors that should end the request
                        if ((LedgerApi.currentState instanceof ErrorState
                            && LedgerApi.currentState.errorType === ErrorType.REQUEST_ASSERTION_FAILED)
                            || message.indexOf('not supported') !== -1) { // no browser support
                            reject(e);
                            return;
                        }
                        // On other errors try again
                        if (!/busy|outdated|connection aborted|user gesture|dependencies|wrong app|wrong wallet/i
                            .test(message)
                            && !isTimeout && !isLocked && !isConnectedToDashboard) {
                            console.warn('Unknown Ledger Error', e);
                        }
                        // Wait a little when replacing a previous U2F request (see transport-comparison.md).
                        const waitTime = isTimeout ? LedgerApi.WAIT_TIME_AFTER_TIMEOUT
                            // If the API tells us that the ledger is busy (see transport-comparison.md) use a longer
                            // wait time to reduce the chance that we hit unfortunate 1.5s window after timeout of
                            // cancelled call
                            : message.indexOf('busy') !== -1 ? 4 * LedgerApi.WAIT_TIME_AFTER_TIMEOUT
                                // For other exceptions wait a little to avoid busy endless loop for some exceptions.
                                : LedgerApi.WAIT_TIME_AFTER_ERROR;
                        await new Promise((resolve2) => setTimeout(resolve2, waitTime));
                    }
                }
                if (!cancelFired) {
                    LedgerApi._fire(EventType.REQUEST_CANCELLED, request);
                    cancelFired = true;
                }
                reject(new Error('Request cancelled'));
            });
            /* eslint-enable no-await-in-loop, no-async-promise-executor */
        }
        finally {
            LedgerApi._currentRequest = null;
            if (LedgerApi._transportType === TransportType.U2F
                || LedgerApi._transportType === TransportType.WEB_AUTHN) {
                LedgerApi._currentConnection = null; // reset as we don't note when Ledger gets disconnected
            }
            const errorType = LedgerApi._currentState instanceof ErrorState
                ? LedgerApi._currentState.errorType
                : null;
            if (errorType !== ErrorType.BROWSER_UNSUPPORTED
                && errorType !== ErrorType.REQUEST_ASSERTION_FAILED) {
                LedgerApi._setState(StateType.IDLE);
            }
        }
    }
    static async _connect(transport, request) {
        // Resolves when connected to unlocked ledger with open coin app otherwise throws an exception after timeout,
        // in contrast to the public connect method which just listens for a connection or uses getWalletId to try to
        // connect repeatedly until success via _callLedger which uses the private _connect under the hood. Also this
        // method is not publicly exposed to avoid that it could be invoked multiple times in parallel which the ledger
        // requests called here do not allow.
        // Establish / verify the connection.
        // This takes <300ms for a pre-authorized device via WebUSB, WebHID or WebBLE and <1s for WebAuthn or U2F.
        if (!LedgerApi._currentConnection || !request.canReuseCoinAppConnection(LedgerApi._currentConnection)) {
            const connectStart = Date.now();
            LedgerApi._setState(StateType.CONNECTING);
            LedgerApi._currentConnection = null;
            try {
                LedgerApi._currentConnection = await request.checkCoinAppConnection(transport);
            }
            catch (e) {
                const message = (e instanceof Error ? e.message : String(e)).toLowerCase();
                if (message.indexOf('busy') !== -1) {
                    throw new ErrorState(ErrorType.LEDGER_BUSY, 
                    // important to rethrow original message for handling of the 'busy' keyword in _callLedger
                    `Only one call to Ledger at a time allowed: ${e}`, request);
                }
                else if (LedgerApi._isWebAuthnOrU2fCancellation(message, connectStart)) {
                    LedgerApi._connectionAborted = true;
                    throw new ErrorState(ErrorType.CONNECTION_ABORTED, `Connection aborted: ${message}`, request);
                }
                // Rethrow other errors that just keep the API retrying (like timeout, dongle locked) or error states.
                throw e;
            }
        }
        LedgerApi._fire(EventType.CONNECTED, LedgerApi._currentConnection);
        return transport;
    }
    static async _getTransport(request) {
        if (LedgerApi._connectionAborted) {
            // When the connection was aborted, don't retry creating a transport until a manual connection is requested.
            // Throw as normal error and not as error state as error state had already been reported.
            throw new Error('Connection aborted');
        }
        // Create transport. Note that creating the transport has to happen in the context of a user interaction if
        // opening a device selector is required.
        const transportType = LedgerApi._transportType;
        LedgerApi._transportPromise = LedgerApi._transportPromise || (async () => {
            // Check browser support for current transport. Note that when transport changes during connect, we recurse.
            if (!transportType || !isSupported(transportType)) {
                throw new ErrorState(ErrorType.BROWSER_UNSUPPORTED, 'Ledger not supported by browser.', request);
            }
            // Load transport lib.
            let TransportLib;
            // Only set the loading state if the lib is not already loaded or fails instantly.
            const delayedLoadingStateTimeout = setTimeout(() => LedgerApi._setState(StateType.LOADING), 50);
            try {
                TransportLib = await loadTransportLibrary(transportType);
            }
            catch (e) {
                if (transportType === LedgerApi._transportType) {
                    throw new ErrorState(ErrorType.LOADING_DEPENDENCIES_FAILED, `Failed loading dependencies: ${e instanceof Error ? e.message : e}`, request);
                }
            }
            finally {
                clearTimeout(delayedLoadingStateTimeout);
            }
            if (transportType !== LedgerApi._transportType)
                throw new Error('Transport changed'); // caught locally
            let transport;
            // Only set the connecting state if it is not instantaneous because a device selector needs to be shown
            const delayedConnectingStateTimeout = setTimeout(() => LedgerApi._setState(StateType.CONNECTING), 50);
            try {
                transport = await TransportLib.create(undefined, // use default openTimeout
                // For network transport set a listenTimeout to avoid pinging the network endpoint indefinitely.
                // Others can be cancelled by the user when he wants or can not listen to devices getting connected
                // (u2f, WebAuthn) such that we don't have to put a timeout in place for other transport types.
                transportType === TransportType.NETWORK ? 3000 : undefined);
            }
            catch (e) {
                if (transportType === LedgerApi._transportType) {
                    const message = (e instanceof Error ? e.message : String(e)).toLowerCase();
                    if (/no device selected|access denied|cancelled the requestdevice/i.test(message)) {
                        LedgerApi._connectionAborted = true;
                        throw new ErrorState(ErrorType.CONNECTION_ABORTED, `Connection aborted: ${message}`, request);
                    }
                    else if (message.indexOf('user gesture') !== -1) {
                        throw new ErrorState(ErrorType.USER_INTERACTION_REQUIRED, e instanceof Error ? e : String(e), request);
                    }
                    else {
                        throw e; // rethrow unknown exception
                    }
                }
            }
            finally {
                clearTimeout(delayedConnectingStateTimeout);
            }
            if (transportType !== LedgerApi._transportType) {
                transport.close();
                throw new Error('Transport changed'); // caught locally
            }
            const onDisconnect = () => {
                console.debug('Ledger disconnected');
                transport.off('disconnect', onDisconnect);
                if (transportType === LedgerApi._transportType) {
                    // Disconnected transport cannot be reconnected. Thus also disconnect from our side for cleanup.
                    // If the transport switched, no additional cleanup is necessary as it already happened on switch.
                    LedgerApi.disconnect(/* cancelRequest */ false);
                }
            };
            transport.on('disconnect', onDisconnect);
            return transport;
        })();
        try {
            return await LedgerApi._transportPromise;
        }
        catch (e) {
            LedgerApi._transportPromise = null;
            if (transportType === LedgerApi._transportType)
                throw e;
            // Transport type changed while we were connecting; ignore error and rerun
            return LedgerApi._getTransport(request);
        }
    }
    static _isWebAuthnOrU2fCancellation(errorMessage, requestStart) {
        // Try to detect a WebAuthn or U2F cancellation. In Firefox, we can detect a WebAuthn cancellation for the
        // Firefox internal popup. However, Firefox U2F cancellations, Firefox WebAuthn cancellations via Window's
        // native popup and Chrome WebAuthn cancellations are not distinguishable from timeouts, therefore we check
        // how likely it is a timeout by the passed time since request start.
        return /operation was aborted/i.test(errorMessage) // WebAuthn cancellation in Firefox internal popup
            || (/timed out|denied permission|u2f other_error/i.test(errorMessage) && Date.now() - requestStart < 20000);
    }
    static _setState(state) {
        if (typeof state === 'string') {
            // it's an entry from LedgerApi.StateType enum
            state = { type: state };
        }
        state.request = !state.request && LedgerApi._currentRequest ? LedgerApi._currentRequest : state.request;
        const currentState = LedgerApi._currentState;
        const currentErrorType = currentState instanceof ErrorState ? currentState.errorType : null;
        const errorType = state instanceof ErrorState ? state.errorType : null;
        if (currentState.type === state.type
            && currentErrorType === errorType
            && LedgerApi._currentState.request === state.request)
            return;
        LedgerApi._currentState = state;
        LedgerApi._fire(EventType.STATE_CHANGE, state);
    }
    static _fire(eventName, ...args) {
        LedgerApi._observable.fire(eventName, ...args);
    }
}

export { AccountTypeNimiq, AddressTypeBitcoin, Coin, ErrorState, ErrorType, EventType, LedgerAddressFormatMapBitcoin as L, Network, NetworkIdNimiq, NimiqVersion, Observable as O, REQUEST_EVENT_CANCEL as R, RequestTypeBitcoin, RequestTypeNimiq, StateType, TransactionFlagsNimiq, TransportType, isLegacyApp as a, isAppSupported as b, LedgerApi as default, getLegacyApp as g, getBip32Path, isAppVersionSupported as i, isSupported, parseBip32Path };
//# sourceMappingURL=ledger-api.es.js.map
