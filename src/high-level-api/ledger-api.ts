import LowLevelApi from '../low-level-api/low-level-api';
import Observable, { EventListener } from '../lib/observable';
import { loadNimiqCore, loadNimiqCryptography } from '../lib/load-nimiq';
import { autoDetectTransportTypeToUse, createTransport, isSupported, TransportType } from './transport-utils';
import LedgerApiRequest, { RequestParams, RequestType } from './ledger-api-request';

type Nimiq = typeof import('@nimiq/core-web');
type Address = import('@nimiq/core-web').Address;
type AccountType = import('@nimiq/core-web').Account.Type;
type Transaction = import('@nimiq/core-web').Transaction;
type PublicKey = import('@nimiq/core-web').PublicKey;

export { RequestType, RequestParams };
export { isSupported, TransportType };

// events appear at a single point of time while states reflect the current state of the api for a timespan ranging
// into the future. E.g. if a request was cancelled, a REQUEST_CANCELLED event gets thrown and the state changes to
// IDLE. Errors trigger an error state (e.g. when app outdated) and thus are a state, not an event.
export enum EventType {
    STATE_CHANGE = 'state-change',
    REQUEST_SUCCESSFUL = 'request-successful',
    REQUEST_CANCELLED = 'request-cancelled',
    CONNECTED = 'connected',
}

export enum StateType {
    IDLE = 'idle',
    LOADING = 'loading',
    CONNECTING = 'connecting',
    REQUEST_PROCESSING = 'request-processing',
    REQUEST_CANCELLING = 'request-cancelling',
    ERROR = 'error',
}

export enum ErrorType {
    LEDGER_BUSY = 'ledger-busy',
    LOADING_DEPENDENCIES_FAILED = 'loading-dependencies-failed',
    USER_INTERACTION_REQUIRED = 'user-interaction-required',
    CONNECTION_ABORTED = 'connection-aborted',
    NO_BROWSER_SUPPORT = 'no-browser-support',
    APP_OUTDATED = 'app-outdated',
    WRONG_LEDGER = 'wrong-ledger',
    REQUEST_ASSERTION_FAILED = 'request-specific-error',
}

export interface State {
    type: StateType;
    error?: {
        type: ErrorType,
        message: string,
    };
    request?: LedgerApiRequest<any>;
}

export interface TransactionInfo {
    sender: Address;
    senderType?: AccountType;
    recipient: Address;
    recipientType?: AccountType;
    value: number; // In Luna
    fee?: number;
    validityStartHeight: number;
    network?: 'main' | 'test' | 'dev';
    flags?: number;
    extraData?: Uint8Array;
}

export default class LedgerApi {
    // public fields and methods
    public static readonly BIP32_BASE_PATH = '44\'/242\'/0\'/';
    public static readonly BIP32_PATH_REGEX = new RegExp(`^${LedgerApi.BIP32_BASE_PATH}(\\d+)'$`);
    public static readonly MIN_REQUIRED_APP_VERSION = [1, 4, 2];
    public static readonly WAIT_TIME_AFTER_TIMEOUT = 1500;
    public static readonly WAIT_TIME_AFTER_ERROR = 500;

    public static get currentState(): State {
        return LedgerApi._currentState;
    }

    public static get currentRequest(): LedgerApiRequest<any> | null {
        return LedgerApi._currentRequest;
    }

    public static get isBusy(): boolean {
        return !!LedgerApi._currentRequest;
    }

    public static get transportType(): TransportType | null {
        return LedgerApi._transportType;
    }

    /**
     * Check for general support or support of a specific transport type. Note that isSupported is additionally exported
     * as separate export that doesn't require bundling the whole api.
     * @param [transportType] - Transport type for which to test for support. If omitted test for support of any type.
     */
    public static isSupported(transportType?: TransportType): boolean {
        return isSupported(transportType);
    }

    /**
     * Set a specific transport type. Note that an already connected ongoing request will still use the previous
     * transport type.
     * @param transportType - Transport type to use for connections to Ledger devices.
     */
    public static setTransportType(transportType: TransportType) {
        if (!isSupported(transportType)) throw new Error('Unsupported transport type.');
        if (transportType === LedgerApi._transportType) return;
        LedgerApi._transportType = transportType;
        // Close api for current transport to create a new one for specified transport type on next request.
        LedgerApi.disconnect(/* cancelRequest */ false);
    }

    public static resetTransportType() {
        const transportType = autoDetectTransportTypeToUse();
        if (!transportType) return;
        LedgerApi.setTransportType(transportType);
    }

    /**
     * Manually connect to a Ledger. Typically, this is not required as all requests establish a connection themselves.
     * However, if that connection fails due to a required user interaction / user gesture, you can manually connect in
     * the context of a user interaction, for example a click.
     * @returns Whether connecting to the Ledger succeeded.
     */
    public static async connect(): Promise<boolean> {
        LedgerApi._connectionAborted = false; // reset aborted flag on manual connection
        try {
            // Initialize the api again if it failed previously, for example due to missing user interaction.
            await LedgerApi._initializeLowLevelApi();
        } catch (e) {
            // Silently continue on errors, same as the other API methods. Error was reported by _initializeLowLevelApi
            // as error state instead. Only if user aborted the connection or browser is not supported, don't continue.
            if (/connection aborted|not supported/i.test(e.message || e)) return false;
        }
        try {
            // Use getWalletId to detect when the ledger is connected.
            await LedgerApi.getWalletId();
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Disconnect the api and clean up.
     * @param cancelRequest - Whether to cancel an ongoing request.
     * @param requestTypeToDisconnect - If specified, only disconnect if no request is going on or if the ongoing
     *  request is of the specified type.
     */
    public static async disconnect(cancelRequest = true, requestTypeToDisconnect?: RequestType) {
        const { currentRequest } = LedgerApi;
        if (currentRequest) {
            if (requestTypeToDisconnect !== undefined && currentRequest.type !== requestTypeToDisconnect) return;
            if (cancelRequest) {
                currentRequest.cancel();
            }
        }

        const apiPromise = LedgerApi._lowLevelApiPromise;
        LedgerApi._lowLevelApiPromise = null;
        LedgerApi._currentlyConnectedWalletId = null;

        if (!apiPromise) return;
        try {
            const api = await apiPromise;
            await api.close();
        } catch (e) {
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
    public static async getWalletId(): Promise<string> {
        if (LedgerApi._currentlyConnectedWalletId) return LedgerApi._currentlyConnectedWalletId;
        // we have to wait for connection of ongoing request or initiate a call ourselves
        if (LedgerApi.isBusy) {
            // already a request going on. Just wait for it to connect.
            return new Promise<string>((resolve, reject) => {
                const onConnect = (walletId: string) => {
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
        const request = new LedgerApiRequest(
            RequestType.GET_WALLET_ID,
            // we're connected when the request get's executed
            (): Promise<string> => Promise.resolve(LedgerApi._currentlyConnectedWalletId!),
            {},
        );
        return LedgerApi._callLedger(request);
    }

    public static on(eventType: EventType, listener: EventListener): void {
        LedgerApi._observable.on(eventType, listener);
    }

    public static off(eventType: EventType, listener: EventListener): void {
        LedgerApi._observable.off(eventType, listener);
    }

    public static once(eventType: EventType, listener: EventListener): void {
        LedgerApi._observable.once(eventType, listener);
    }

    /**
     * Convert an address's index / keyId to the full Nimiq bip32 path.
     * @param keyId - The address's index.
     * @returns The full bip32 path.
     */
    public static getBip32PathForKeyId(keyId: number): string {
        return `${LedgerApi.BIP32_BASE_PATH}${keyId}'`;
    }

    /**
     * Extract an address's index / keyId from its bip32 path.
     * @param path - The address's bip32 path.
     * @returns The address's index or null if the provided path is not a valid Nimiq key bip32 path.
     */
    public static getKeyIdForBip32Path(path: string): number | null {
        const pathMatch = LedgerApi.BIP32_PATH_REGEX.exec(path);
        if (!pathMatch) return null;
        return parseInt(pathMatch[pathMatch.length - 1], 10);
    }

    /**
     * Derive addresses for given bip32 key paths.
     * @param pathsToDerive - The paths for which to derive addresses.
     * @param [walletId] - Check that the connected wallet corresponds to the given walletId, otherwise throw. Optional.
     * @returns The derived addresses and their corresponding key paths.
     */
    public static async deriveAddresses(pathsToDerive: Iterable<string>, walletId?: string)
        : Promise<Array<{ address: string, keyPath: string }>> {
        const request = new LedgerApiRequest(RequestType.DERIVE_ADDRESSES,
            async (api, params): Promise<Array<{ address: string, keyPath: string }>> => {
                const addressRecords = [];
                for (const keyPath of params.pathsToDerive!) {
                    if (request.cancelled) return addressRecords;
                    // eslint-disable-next-line no-await-in-loop
                    const { address } = await api.getAddress(
                        keyPath,
                        true, // validate
                        false, // display
                    );
                    addressRecords.push({ address, keyPath });
                }
                return addressRecords;
            },
            {
                walletId,
                pathsToDerive,
            },
        );
        // check paths outside of request to avoid endless loop in _callLedger if we'd throw for an invalid keyPath
        for (const keyPath of pathsToDerive) {
            if (LedgerApi.BIP32_PATH_REGEX.test(keyPath)) continue;
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
    public static async getPublicKey(keyPath: string, walletId?: string): Promise<PublicKey> {
        const request = new LedgerApiRequest(RequestType.GET_PUBLIC_KEY,
            async (api, params): Promise<PublicKey> => {
                const { publicKey } = await api.getPublicKey(
                    params.keyPath!,
                    true, // validate
                    false, // display
                );

                // Note that the actual load of the Nimiq core and cryptography is triggered in _connect, including
                // error handling. The call here is just used to get the reference to the Nimiq object and can not fail.
                const Nimiq = await this._loadNimiq();

                return new Nimiq.PublicKey(publicKey);
            },
            {
                walletId,
                keyPath,
            },
        );
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
    public static async getAddress(keyPath: string, walletId?: string): Promise<string> {
        const request = new LedgerApiRequest(RequestType.GET_ADDRESS,
            async (api, params): Promise<string> => {
                const { address } = await api.getAddress(
                    params.keyPath!,
                    true, // validate
                    false, // display
                );
                return address;
            },
            {
                walletId,
                keyPath,
            },
        );
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
    public static async confirmAddress(userFriendlyAddress: string, keyPath: string, walletId?: string)
        : Promise<string> {
        const request = new LedgerApiRequest(RequestType.CONFIRM_ADDRESS,
            async (api, params): Promise<string> => {
                const { address: confirmedAddress } = await api.getAddress(
                    params.keyPath!,
                    true, // validate
                    true, // display
                );

                if (params.addressToConfirm!.replace(/ /g, '').toUpperCase()
                    !== confirmedAddress.replace(/ /g, '').toUpperCase()) {
                    LedgerApi._throwError(ErrorType.REQUEST_ASSERTION_FAILED, 'Address mismatch', request);
                }

                return confirmedAddress;
            },
            {
                walletId,
                keyPath,
                addressToConfirm: userFriendlyAddress,
            },
        );
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
    public static async getConfirmedAddress(keyPath: string, walletId?: string): Promise<string> {
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
    public static async signTransaction(transaction: TransactionInfo, keyPath: string, walletId?: string)
        : Promise<Transaction> {
        const request = new LedgerApiRequest(RequestType.SIGN_TRANSACTION,
            async (api, params): Promise<Transaction> => {
                // Note: We make api calls outside of try...catch blocks to let the exceptions fall through such that
                // _callLedger can decide how to behave depending on the api error. All other errors are converted to
                // REQUEST_ASSERTION_FAILED errors which stop the execution of the request.
                const { publicKey: signerPubKeyBytes } = await api.getPublicKey(
                    params.keyPath!,
                    true, // validate
                    false, // display
                );

                // Note that the actual load of the Nimiq core and cryptography is triggered in _connect, including
                // error handling. The call here is just used to get the reference to the Nimiq object and can not fail.
                const Nimiq = await this._loadNimiq();

                let nimiqTx: Transaction;
                let signerPubKey: PublicKey;
                try {
                    const tx = params.transaction!;
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
                            network = Nimiq.GenesisConfig.NETWORK_NAME as 'main' | 'test' | 'dev';
                        } catch (e) {
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
                        || flags !== Nimiq.Transaction.Flag.NONE
                    ) {
                        const extraData = tx.extraData ? tx.extraData : new Uint8Array(0);
                        nimiqTx = new Nimiq.ExtendedTransaction(tx.sender, senderType, tx.recipient,
                            recipientType, tx.value, fee, tx.validityStartHeight, flags, extraData,
                            /* proof */ undefined, networkId);
                    } else {
                        nimiqTx = new Nimiq.BasicTransaction(signerPubKey, tx.recipient, tx.value,
                            fee, tx.validityStartHeight, /* signature */ undefined, networkId);
                    }
                } catch (e) {
                    this._throwError(ErrorType.REQUEST_ASSERTION_FAILED, e, request);
                }

                const { signature: signatureBytes } = await api.signTransaction(
                    params.keyPath!,
                    nimiqTx!.serializeContent(),
                );

                try {
                    const signature = new Nimiq.Signature(signatureBytes);

                    if (nimiqTx! instanceof Nimiq.BasicTransaction) {
                        nimiqTx.signature = signature;
                    } else {
                        nimiqTx!.proof = Nimiq.SignatureProof.singleSig(signerPubKey!, signature).serialize();
                    }
                } catch (e) {
                    this._throwError(ErrorType.REQUEST_ASSERTION_FAILED, e, request);
                }

                return nimiqTx!;
            },
            {
                walletId,
                keyPath,
                transaction,
            },
        );

        if (!LedgerApi.BIP32_PATH_REGEX.test(keyPath)) {
            this._throwError(ErrorType.REQUEST_ASSERTION_FAILED, `Invalid keyPath ${keyPath}`, request);
        }
        return LedgerApi._callLedger(request);
    }

    // private fields and methods
    private static _transportType: TransportType | null = autoDetectTransportTypeToUse();
    private static _lowLevelApiPromise: Promise<LowLevelApi> | null = null;
    private static _currentState: State = { type: StateType.IDLE };
    private static _currentRequest: LedgerApiRequest<any> | null = null;
    private static _currentlyConnectedWalletId: string | null = null;
    private static _connectionAborted: boolean = false;
    private static _observable = new Observable();

    private static async _callLedger<T>(request: LedgerApiRequest<T>): Promise<T> {
        if (LedgerApi.isBusy) {
            LedgerApi._throwError(ErrorType.LEDGER_BUSY, 'Only one call to Ledger at a time allowed',
                request);
        }
        LedgerApi._connectionAborted = false; // user is initiating a new request
        try {
            LedgerApi._currentRequest = request;
            /* eslint-disable no-await-in-loop, no-async-promise-executor */
            return await new Promise<T>(async (resolve, reject) => {
                let lastRequestCallTime = -1;
                let canCancelDirectly = true;
                let cancelFired = false;
                request.on(LedgerApiRequest.EVENT_CANCEL, () => {
                    // If we can, reject the call right away. Otherwise just notify that the request was requested to be
                    // cancelled such that the user can cancel the call on the ledger.
                    if (canCancelDirectly) {
                        // Note that !!_currentlyConnectedWalletId is not an indicator that we can cancel directly, as
                        // it's just an estimate and we might not actually be disconnected or the request might already
                        // have been sent before disconnecting.
                        if (!cancelFired) {
                            LedgerApi._fire(EventType.REQUEST_CANCELLED, request);
                            cancelFired = true;
                        }
                        reject(new Error('Request cancelled'));
                    } else {
                        LedgerApi._setState(StateType.REQUEST_CANCELLING);
                    }
                });
                while (!request.cancelled) {
                    try {
                        const api = await LedgerApi._connect(request.params.walletId);
                        if (request.cancelled) break;
                        LedgerApi._setState(StateType.REQUEST_PROCESSING);
                        lastRequestCallTime = Date.now();
                        canCancelDirectly = false; // sending request which has to be resolved / cancelled by the Ledger
                        const result = await request.call(api);
                        if (request.cancelled) break;
                        LedgerApi._fire(EventType.REQUEST_SUCCESSFUL, request, result);
                        resolve(result);
                        return;
                    } catch (e) {
                        console.debug(e);
                        const message = (e.message || e || '').toLowerCase();
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
                            LedgerApi._currentlyConnectedWalletId = null;
                        }
                        // Test whether user cancelled call on ledger device or in WebAuthn / U2F browser popup
                        if (message.indexOf('denied by the user') !== -1 // user rejected confirmAddress on device
                            || message.indexOf('request was rejected') !== -1 // user rejected signTransaction on device
                            || LedgerApi._isWebAuthnOrU2fCancellation(message, lastRequestCallTime)) {
                            // Note that on _isWebAuthnOrU2fCancellation we can cancel directly and don't need the user
                            // to cancel the request on the device as Ledger Nano S is now able to clean up old WebAuthn
                            // and U2F requests and the the Nano X lets the Nimiq App crash anyways after the WebAuthn /
                            // U2F host was lost.
                            canCancelDirectly = true;
                            request.cancel(); // in case the request was not marked as cancelled before
                            break; // continue after loop where the actual cancellation happens
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
        } finally {
            LedgerApi._currentRequest = null;
            if (LedgerApi._transportType === TransportType.U2F
                || LedgerApi._transportType === TransportType.WEB_AUTHN) {
                LedgerApi._currentlyConnectedWalletId = null; // reset as we don't note when Ledger gets disconnected
            }
            const errorType = LedgerApi.currentState.error ? LedgerApi.currentState.error.type : null;
            if (errorType !== ErrorType.NO_BROWSER_SUPPORT
                && errorType !== ErrorType.REQUEST_ASSERTION_FAILED) {
                LedgerApi._setState(StateType.IDLE);
            }
        }
    }

    private static async _connect(walletId?: string): Promise<LowLevelApi> {
        // Resolves when connected to unlocked ledger with open Nimiq app otherwise throws an exception after timeout,
        // in contrast to the public connect method which uses getWalletId to listen for a connection or to try to
        // connect repeatedly until success via _callLedger which uses the private _connect under the hood. Also this
        // method is not publicly exposed to avoid that it could be invoked multiple times in parallel which the ledger
        // requests called here do not allow. Additionally, this method exposes the low level api which is private.
        if (LedgerApi._connectionAborted) {
            // When the connection was aborted, don't retry connecting until a manual connection is requested.
            throw new Error('Connection aborted');
        }
        const connectStart = Date.now();
        try {
            const nimiqPromise = this._loadNimiq();
            const api = await LedgerApi._initializeLowLevelApi();
            if (!LedgerApi._currentlyConnectedWalletId) {
                // Not connected yet. Connecting a pre-authorized device via WebUSB, WebHID or WebBLE takes <300ms.
                // Connecting via WebAuthn or U2F takes <1s.
                LedgerApi._setState(StateType.CONNECTING);
                // To check whether the connection to Nimiq app is established and to calculate the walletId. Set
                // validate to false as otherwise the call is much slower. For U2F this can also unfreeze the ledger
                // app, see transport-comparison.md. Using getPublicKey and not getAppConfiguration, as other apps also
                // respond to getAppConfiguration (for example the Ethereum app).
                const { publicKey: firstAddressPubKeyBytes } = await api.getPublicKey(
                    LedgerApi.getBip32PathForKeyId(0),
                    false, // validate
                    false, // display
                );
                const { version } = await api.getAppConfiguration();
                if (!LedgerApi._isAppVersionSupported(version)) throw new Error('Ledger Nimiq App is outdated.');

                try {
                    const Nimiq = await nimiqPromise;
                    // Use sha256 as blake2b yields the nimiq address
                    LedgerApi._currentlyConnectedWalletId = Nimiq.Hash.sha256(firstAddressPubKeyBytes).toBase64();
                } catch (e) {
                    LedgerApi._throwError(ErrorType.LOADING_DEPENDENCIES_FAILED,
                        `Failed loading dependencies: ${e.message || e}`);
                }
            }
            if (walletId !== undefined && LedgerApi._currentlyConnectedWalletId !== walletId) {
                throw new Error('Wrong Ledger connected');
            }
            this._fire(EventType.CONNECTED, LedgerApi._currentlyConnectedWalletId);
            return api;
        } catch (e) {
            const message = (e.message || e || '').toLowerCase();
            if (message.indexOf('wrong ledger') !== -1) {
                LedgerApi._throwError(ErrorType.WRONG_LEDGER, e);
            }
            LedgerApi._currentlyConnectedWalletId = null;
            if (message.indexOf('outdated') !== -1) {
                LedgerApi._throwError(ErrorType.APP_OUTDATED, e);
            } else if (message.indexOf('busy') !== -1) {
                LedgerApi._throwError(ErrorType.LEDGER_BUSY, e);
            } else if (LedgerApi._isWebAuthnOrU2fCancellation(message, connectStart)) {
                LedgerApi._connectionAborted = true;
                LedgerApi._throwError(ErrorType.CONNECTION_ABORTED, `Connection aborted: ${message}`);
            }

            // Just rethrow the error and not fire an error state for _initializeDependencies errors which fires error
            // states itself and for other errors (like timeout, dongle locked) that just keep the API retrying.
            throw e;
        }
    }

    private static async _initializeLowLevelApi(): Promise<LowLevelApi> {
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
                if (!transportType) throw new Error('No browser support');
                const transport = await createTransport(transportType);
                const onDisconnect = () => {
                    console.debug('Ledger disconnected');
                    transport.off('disconnect', onDisconnect);
                    if (this._transportType !== transportType) return;
                    // A disconnected transport can not be reconnected. Therefore reset the _lowLevelApiPromise.
                    LedgerApi._lowLevelApiPromise = null;
                    LedgerApi._currentlyConnectedWalletId = null;
                };
                transport.on('disconnect', onDisconnect);
                return new LowLevelApi(transport);
            })();
        try {
            const api = await LedgerApi._lowLevelApiPromise;
            if (this._transportType === transportType) return api;
            // Transport type changed while we were connecting; rerun.
            return LedgerApi._initializeLowLevelApi();
        } catch (e) {
            if (LedgerApi._transportType === transportType) {
                LedgerApi._lowLevelApiPromise = null;
                const message = (e.message || e).toLowerCase();
                if (/no device selected|access denied|cancelled the requestdevice/i.test(message)) {
                    if (LedgerApi._transportType === TransportType.WEB_USB) {
                        // Use a fallback as the user might not have been able to select his device due to the Nano X
                        // currently not being discoverable via WebUSB in Windows.
                        // This fallback also temporarily serves Linux users which have not updated their udev rules.
                        // TODO the fallback is just temporary and to be removed once WebUSB with Nano X works on
                        //  Windows or WebHID is more broadly available.
                        const fallback = [TransportType.WEB_AUTHN, TransportType.U2F].find(isSupported);
                        if (!fallback) {
                            LedgerApi._throwError(ErrorType.NO_BROWSER_SUPPORT,
                                'Ledger not supported by browser or support not enabled.');
                        }
                        console.warn(`LedgerApi: switching to ${fallback} as fallback`);
                        LedgerApi.setTransportType(fallback!);
                    } else {
                        LedgerApi._connectionAborted = true;
                        LedgerApi._throwError(ErrorType.CONNECTION_ABORTED, `Connection aborted: ${message}`);
                    }
                } else if (message.indexOf('user gesture') !== -1) {
                    LedgerApi._throwError(ErrorType.USER_INTERACTION_REQUIRED, e);
                } else if (message.indexOf('browser support') !== -1) {
                    LedgerApi._throwError(ErrorType.NO_BROWSER_SUPPORT,
                        'Ledger not supported by browser or support not enabled.');
                } else {
                    LedgerApi._throwError(ErrorType.LOADING_DEPENDENCIES_FAILED,
                        `Failed loading dependencies: ${message}`);
                }
            }
            // Transport type changed while we were connecting; ignore error and rerun
            return LedgerApi._initializeLowLevelApi();
        }
    }

    private static async _loadNimiq(): Promise<Nimiq> {
        // Small helper that throws a "Failed loading dependencies" exception on error. Note that we don't need to cache
        // a promise here as in _initializeLowLevelApi as loadNimiqCore and loadNimiqCryptography already do that.
        try {
            const [Nimiq] = await Promise.all([
                loadNimiqCore(),
                // needed for walletId hashing and pub key to address derivation in SignatureProof and BasicTransaction
                loadNimiqCryptography(),
            ]);
            return Nimiq;
        } catch (e) {
            throw new Error(`Failed loading dependencies: ${e.message || e}`);
        }
    }

    private static _isWebAuthnOrU2fCancellation(errorMessage: string, requestStart: number) {
        // Try to detect a WebAuthn or U2F cancellation. In Firefox, we can detect a WebAuthn cancellation for the
        // Firefox internal popup. However, Firefox U2F cancellations, Firefox WebAuthn cancellations via Window's
        // native popup and Chrome WebAuthn cancellations are not distinguishable from timeouts, therefore we check
        // how likely it is a timeout by the passed time since request start.
        return /operation was aborted/i.test(errorMessage) // WebAuthn cancellation in Firefox internal popup
            || (/timed out|denied permission|u2f other_error/i.test(errorMessage) && Date.now() - requestStart < 20000);
    }

    private static _isAppVersionSupported(versionString: string): boolean {
        const version = versionString.split('.').map((part) => parseInt(part, 10));
        for (let i = 0; i < LedgerApi.MIN_REQUIRED_APP_VERSION.length; ++i) {
            if (typeof version[i] === 'undefined' || version[i] < LedgerApi.MIN_REQUIRED_APP_VERSION[i]) return false;
            if (version[i] > LedgerApi.MIN_REQUIRED_APP_VERSION[i]) return true;
        }
        return true;
    }

    private static _setState(state: State | StateType): void {
        if (typeof state === 'string') {
            // it's an entry from LedgerApi.StateType enum
            state = { type: state };
        }
        state.request = !state.request && LedgerApi._currentRequest ? LedgerApi._currentRequest : state.request;

        if (LedgerApi._currentState.type === state.type
            && (LedgerApi._currentState.error === state.error
                || (!!LedgerApi._currentState.error && !!state.error
                    && LedgerApi._currentState.error.type === state.error.type))
            && LedgerApi._currentState.request === state.request) return;
        LedgerApi._currentState = state;
        LedgerApi._fire(EventType.STATE_CHANGE, state);
    }

    private static _throwError(
        type: ErrorType,
        error: Error | string,
        request?: LedgerApiRequest<any>,
    ): void {
        const state: State = {
            type: StateType.ERROR,
            error: {
                type,
                message: typeof error === 'string' ? error : error.message,
            },
        };
        if (request) state.request = request;
        LedgerApi._setState(state);
        if (typeof error === 'string') {
            throw new Error(error);
        } else {
            throw error;
        }
    }

    private static _fire(eventName: EventType, ...args: any[]): void {
        LedgerApi._observable.fire(eventName, ...args);
    }
}
