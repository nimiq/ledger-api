import { EventListener } from '../lib/observable';
import { isSupported, TransportType } from './transport-utils';
import LedgerApiRequest, { RequestParams, RequestType } from './ledger-api-request';
declare type Address = import('@nimiq/core-web').Address;
declare type AccountType = import('@nimiq/core-web').Account.Type;
declare type Transaction = import('@nimiq/core-web').Transaction;
declare type PublicKey = import('@nimiq/core-web').PublicKey;
export { RequestType, RequestParams };
export { isSupported, TransportType };
export declare enum EventType {
    STATE_CHANGE = "state-change",
    REQUEST_SUCCESSFUL = "request-successful",
    REQUEST_CANCELLED = "request-cancelled",
    CONNECTED = "connected"
}
export declare enum StateType {
    IDLE = "idle",
    LOADING = "loading",
    CONNECTING = "connecting",
    REQUEST_PROCESSING = "request-processing",
    REQUEST_CANCELLING = "request-cancelling",
    ERROR = "error"
}
export declare enum ErrorType {
    LEDGER_BUSY = "ledger-busy",
    LOADING_DEPENDENCIES_FAILED = "loading-dependencies-failed",
    USER_INTERACTION_REQUIRED = "user-interaction-required",
    CONNECTION_ABORTED = "connection-aborted",
    NO_BROWSER_SUPPORT = "no-browser-support",
    APP_OUTDATED = "app-outdated",
    WRONG_LEDGER = "wrong-ledger",
    REQUEST_ASSERTION_FAILED = "request-specific-error"
}
export interface State {
    type: StateType;
    error?: {
        type: ErrorType;
        message: string;
    };
    request?: LedgerApiRequest<any>;
}
export interface TransactionInfo {
    sender: Address;
    senderType?: AccountType;
    recipient: Address;
    recipientType?: AccountType;
    value: number;
    fee?: number;
    validityStartHeight: number;
    network?: 'main' | 'test' | 'dev';
    flags?: number;
    extraData?: Uint8Array;
}
export default class LedgerApi {
    static readonly BIP32_BASE_PATH = "44'/242'/0'/";
    static readonly BIP32_PATH_REGEX: RegExp;
    static readonly MIN_REQUIRED_APP_VERSION: number[];
    static readonly WAIT_TIME_AFTER_TIMEOUT = 1500;
    static readonly WAIT_TIME_AFTER_ERROR = 500;
    static get currentState(): State;
    static get currentRequest(): LedgerApiRequest<any> | null;
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
     * @returns Whether connecting to the Ledger succeeded.
     */
    static connect(): Promise<boolean>;
    /**
     * Disconnect the api and clean up.
     * @param cancelRequest - Whether to cancel an ongoing request.
     * @param requestTypeToDisconnect - If specified, only disconnect if no request is going on or if the ongoing
     *  request is of the specified type.
     */
    static disconnect(cancelRequest?: boolean, requestTypeToDisconnect?: RequestType): Promise<void>;
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
    static getWalletId(): Promise<string>;
    static on(eventType: EventType, listener: EventListener): void;
    static off(eventType: EventType, listener: EventListener): void;
    static once(eventType: EventType, listener: EventListener): void;
    /**
     * Convert an address's index / keyId to the full Nimiq bip32 path.
     * @param keyId - The address's index.
     * @returns The full bip32 path.
     */
    static getBip32PathForKeyId(keyId: number): string;
    /**
     * Extract an address's index / keyId from its bip32 path.
     * @param path - The address's bip32 path.
     * @returns The address's index or null if the provided path is not a valid Nimiq key bip32 path.
     */
    static getKeyIdForBip32Path(path: string): number | null;
    /**
     * Derive addresses for given bip32 key paths.
     * @param pathsToDerive - The paths for which to derive addresses.
     * @param [walletId] - Check that the connected wallet corresponds to the given walletId, otherwise throw. Optional.
     * @returns The derived addresses and their corresponding key paths.
     */
    static deriveAddresses(pathsToDerive: Iterable<string>, walletId?: string): Promise<Array<{
        address: string;
        keyPath: string;
    }>>;
    /**
     * Get the public key for a given bip32 key path.
     * @param keyPath - The path for which to derive the public key.
     * @param [walletId] - Check that the connected wallet corresponds to the given walletId, otherwise throw. Optional.
     * @returns The derived public key.
     */
    static getPublicKey(keyPath: string, walletId?: string): Promise<PublicKey>;
    /**
     * Get the address for a given bip32 key path.
     * @param keyPath - The path for which to derive the address.
     * @param [walletId] - Check that the connected wallet corresponds to the given walletId, otherwise throw. Optional.
     * @returns The derived address.
     */
    static getAddress(keyPath: string, walletId?: string): Promise<string>;
    /**
     * Confirm that an address belongs to the connected Ledger and display the address to the user on the Ledger screen.
     * @param userFriendlyAddress - The address to check.
     * @param keyPath - The address's bip32 key path.
     * @param [walletId] - Check that the connected wallet corresponds to the given walletId, otherwise throw. Optional.
     * @returns The confirmed address.
     */
    static confirmAddress(userFriendlyAddress: string, keyPath: string, walletId?: string): Promise<string>;
    /**
     * Utility function that combines getAddress and confirmAddress to directly get a confirmed address.
     * @param keyPath - The bip32 key path for which to get and confirm the address.
     * @param [walletId] - Check that the connected wallet corresponds to the given walletId, otherwise throw. Optional.
     * @returns The confirmed address.
     */
    static getConfirmedAddress(keyPath: string, walletId?: string): Promise<string>;
    /**
     * Sign a transaction for a signing key specified by its bip32 key path. Note that the signing key / corresponding
     * address does not necessarily need to be the transaction's sender address for example for transactions sent from
     * vesting contracts.
     * @param transaction - Transaction details, see interface TransactionInfo.
     * @param keyPath - The signing address's bip32 key path.
     * @param [walletId] - Check that the connected wallet corresponds to the given walletId, otherwise throw. Optional.
     * @returns The signed transaction.
     */
    static signTransaction(transaction: TransactionInfo, keyPath: string, walletId?: string): Promise<Transaction>;
    private static _transportType;
    private static _lowLevelApiPromise;
    private static _currentState;
    private static _currentRequest;
    private static _currentlyConnectedWalletId;
    private static _connectionAborted;
    private static _observable;
    private static _callLedger;
    private static _connect;
    private static _initializeLowLevelApi;
    private static _loadNimiq;
    private static _isWebAuthnOrU2fCancellation;
    private static _isAppVersionSupported;
    private static _setState;
    private static _throwError;
    private static _fire;
}
