import { EventListener } from '../lib/observable';
import { isSupported, TransportType } from './transport-utils';
import { getBip32Path, parseBip32Path } from './bip32-utils';
import ErrorState, { ErrorType } from './error-state';
import { AddressTypeBitcoin, Coin, Network, RequestTypeBitcoin, RequestTypeNimiq } from './constants';
declare type CoinAppConnection = import('./requests/request').CoinAppConnection;
declare type RequestType = RequestTypeNimiq | RequestTypeBitcoin;
declare type RequestGetWalletIdNimiqConstructor = typeof import('./requests/nimiq/request-get-wallet-id-nimiq').default;
declare type RequestGetPublicKeyNimiqConstructor = typeof import('./requests/nimiq/request-get-public-key-nimiq').default;
declare type RequestGetAddressNimiqConstructor = typeof import('./requests/nimiq/request-get-address-nimiq').default;
declare type RequestDeriveAddressesNimiqConstructor = typeof import('./requests/nimiq/request-derive-addresses-nimiq').default;
declare type RequestSignTransactionNimiqConstructor = typeof import('./requests/nimiq/request-sign-transaction-nimiq').default;
declare type RequestGetWalletIdBitcoinConstructor = typeof import('./requests/bitcoin/request-get-wallet-id-bitcoin').default;
declare type RequestGetAddressAndPublicKeyBitcoinConstructor = typeof import('./requests/bitcoin/request-get-address-and-public-key-bitcoin').default;
declare type RequestGetExtendedPublicKeyBitcoinConstructor = typeof import('./requests/bitcoin/request-get-extended-public-key-bitcoin').default;
declare type RequestSignTransactionBitcoinConstructor = typeof import('./requests/bitcoin/request-sign-transaction-bitcoin').default;
declare type RequestConstructor = RequestGetWalletIdNimiqConstructor | RequestGetPublicKeyNimiqConstructor | RequestGetAddressNimiqConstructor | RequestDeriveAddressesNimiqConstructor | RequestSignTransactionNimiqConstructor | RequestGetWalletIdBitcoinConstructor | RequestGetAddressAndPublicKeyBitcoinConstructor | RequestGetExtendedPublicKeyBitcoinConstructor | RequestSignTransactionBitcoinConstructor;
declare type Request = InstanceType<RequestConstructor>;
declare type PublicKeyNimiq = import('@nimiq/core-web').PublicKey;
declare type TransactionInfoNimiq = import('./requests/nimiq/request-sign-transaction-nimiq').TransactionInfoNimiq;
declare type TransactionNimiq = import('@nimiq/core-web').Transaction;
declare type TransactionInfoBitcoin = import('./requests/bitcoin/request-sign-transaction-bitcoin').TransactionInfoBitcoin;
export { isSupported, TransportType };
export { getBip32Path, parseBip32Path };
export { ErrorType, ErrorState };
export { Coin, AddressTypeBitcoin, Network };
export { CoinAppConnection, RequestTypeNimiq, RequestTypeBitcoin, RequestType, Request };
export { TransactionInfoNimiq, TransactionInfoBitcoin };
export declare enum StateType {
    IDLE = "idle",
    LOADING = "loading",
    CONNECTING = "connecting",
    REQUEST_PROCESSING = "request-processing",
    REQUEST_CANCELLING = "request-cancelling",
    ERROR = "error"
}
export declare enum EventType {
    STATE_CHANGE = "state-change",
    REQUEST_SUCCESSFUL = "request-successful",
    REQUEST_CANCELLED = "request-cancelled",
    CONNECTED = "connected"
}
export declare type State = {
    type: StateType.IDLE | StateType.LOADING | StateType.CONNECTING;
    request?: Request;
} | {
    type: StateType.REQUEST_PROCESSING | StateType.REQUEST_CANCELLING;
    request: Request;
} | ErrorState;
export default class LedgerApi {
    static readonly WAIT_TIME_AFTER_TIMEOUT = 1500;
    static readonly WAIT_TIME_AFTER_ERROR = 500;
    static readonly Nimiq: {
        /**
         * Get the 32 byte wallet id of the currently connected Nimiq wallet as base64.
         */
        getWalletId(): Promise<string>;
        /**
         * Get the public key for a given bip32 key path. Optionally expect a specific wallet id.
         */
        getPublicKey(keyPath: string, expectedWalletId?: string | undefined): Promise<PublicKeyNimiq>;
        /**
         * Get the address for a given bip32 key path. Optionally display the address on the Ledger screen for
         * verification, expect a specific address or expect a specific wallet id.
         */
        getAddress(keyPath: string, display?: boolean, expectedAddress?: string | undefined, expectedWalletId?: string | undefined): Promise<string>;
        /**
         * Utility function that directly gets a confirmed address.
         */
        getConfirmedAddress(keyPath: string, expectedWalletId?: string | undefined): Promise<string>;
        /**
         * Derive addresses for given bip32 key paths. Optionally expect a specific wallet id.
         */
        deriveAddresses(pathsToDerive: Iterable<string>, expectedWalletId?: string | undefined): Promise<Array<{
            address: string;
            keyPath: string;
        }>>;
        /**
         * Sign a transaction for a signing key specified by its bip32 key path. Note that the signing key /
         * corresponding address does not necessarily need to be the transaction's sender address for example for
         * transactions sent from vesting contracts. Optionally expect a specific wallet id.
         */
        signTransaction(transaction: TransactionInfoNimiq, keyPath: string, expectedWalletId?: string | undefined): Promise<TransactionNimiq>;
    };
    static readonly Bitcoin: {
        /**
         * Get the 32 byte wallet id of the currently connected Bitcoin wallet / app for a specific network as base64.
         */
        getWalletId(network: Network): Promise<string>;
        /**
         * Get the public key, address and bip32 chain code for a given bip32 key path. Optionally display the address
         * on the Ledger screen for verification, expect a specific address or expect a specific wallet id.
         */
        getAddressAndPublicKey(keyPath: string, display?: boolean, expectedAddress?: string | undefined, expectedWalletId?: string | undefined): Promise<{
            publicKey: string;
            address: string;
            chainCode: string;
        }>;
        /**
         * Utility function that directly gets a confirmed address.
         */
        getConfirmedAddressAndPublicKey(keyPath: string, expectedWalletId?: string | undefined): Promise<{
            publicKey: string;
            address: string;
            chainCode: string;
        }>;
        /**
         * Get the extended public key for a bip32 path from which addresses can be derived, encoded as specified in
         * bip32. The key path must follow the bip44 specification and at least be defined to the account level.
         * Optionally expect a specific wallet id.
         */
        getExtendedPublicKey(keyPath: string, expectedWalletId?: string | undefined): Promise<string>;
        /**
         * Sign a transaction. See type declaration of TransactionInfoBitcoin in request-sign-transaction-bitcoin.ts
         * for documentation of the transaction format. Optionally expect a specific wallet id. The signed transaction
         * is returned in hex-encoded serialized form ready to be broadcast to the network.
         */
        signTransaction(transaction: TransactionInfoBitcoin, expectedWalletId?: string | undefined): Promise<string>;
    };
    static get currentState(): State;
    static get currentRequest(): Request | null;
    static get isBusy(): boolean;
    static get transportType(): TransportType | null;
    /**
     * Check for general support or support of a specific transport type. Note that isSupported is additionally exported
     * as separate export that doesn't require bundling the whole api.
     * @param [transportType] - Transport type for which to test for support. If omitted test for support of any type.
     */
    static isSupported(transportType?: TransportType): boolean;
    /**
     * Set a specific transport type. Note that an already connected ongoing request will still use the previous
     * transport type.
     * @param transportType - Transport type to use for connections to Ledger devices.
     */
    static setTransportType(transportType: TransportType): void;
    static resetTransportType(): void;
    /**
     * Manually connect to a Ledger. Typically, this is not required as all requests establish a connection themselves.
     * However, if that connection fails due to a required user interaction / user gesture, you can manually connect in
     * the context of a user interaction, for example a click.
     * @param coin - Which Ledger coin app to connect to.
     * @param [network] - Only for Bitcoin: whether to connect to the mainnet or testnet app. Mainnet by default.
     * @returns Whether connecting to the Ledger succeeded.
     */
    static connect(coin: Coin): Promise<boolean>;
    static connect(coin: Coin.BITCOIN, network: Network): Promise<boolean>;
    /**
     * Disconnect the api and clean up.
     * @param cancelRequest - Whether to cancel an ongoing request.
     * @param requestTypesToDisconnect - If specified, only disconnect if no request is going on or if the ongoing
     *  request is of the specified type.
     */
    static disconnect(cancelRequest?: boolean, requestTypesToDisconnect?: RequestType | RequestType[]): Promise<void>;
    static on(eventType: EventType, listener: EventListener): void;
    static off(eventType: EventType, listener: EventListener): void;
    static once(eventType: EventType, listener: EventListener): void;
    private static _transportType;
    private static _transportPromise;
    private static _currentState;
    private static _currentRequest;
    private static _currentConnection;
    private static _connectionAborted;
    private static readonly _observable;
    private static _createRequest;
    private static _callLedger;
    private static _connect;
    private static _getTransport;
    private static _isWebAuthnOrU2fCancellation;
    private static _setState;
    private static _fire;
}
