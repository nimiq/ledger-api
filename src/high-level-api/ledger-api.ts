import Observable, { EventListener } from '../lib/observable';
import { autoDetectTransportTypeToUse, isSupported, loadTransportLibrary, TransportType } from './transport-utils';
import { getBip32Path, getKeyIdForBip32Path } from './bip32-utils';
import ErrorState, { ErrorType } from './error-state';
import { Coin, REQUEST_EVENT_CANCEL, RequestTypeNimiq } from './constants';

type TransportConstructor = typeof import('@ledgerhq/hw-transport').default;
type TransportWebUsbConstructor = typeof import('@ledgerhq/hw-transport-webusb').default;
type Transport = InstanceType<TransportConstructor | TransportWebUsbConstructor>;

type CoinAppConnection = import('./requests/request').CoinAppConnection;

type RequestType = RequestTypeNimiq;

type RequestGetWalletIdNimiq = import('./requests/nimiq/request-get-wallet-id-nimiq').default;
type RequestGetPublicKeyNimiq = import('./requests/nimiq/request-get-public-key-nimiq').default;
type RequestGetAddressNimiq = import('./requests/nimiq/request-get-address-nimiq').default;
type RequestConfirmAddressNimiq = import('./requests/nimiq/request-confirm-address-nimiq').default;
type RequestDeriveAddressesNimiq = import('./requests/nimiq/request-derive-addresses-nimiq').default;
type RequestSignTransactionNimiq = import('./requests/nimiq/request-sign-transaction-nimiq').default;

// define Request type as actually defined request classes to be more specific than the abstract parent class
type Request = RequestGetWalletIdNimiq | RequestGetPublicKeyNimiq | RequestGetAddressNimiq | RequestDeriveAddressesNimiq
    | RequestSignTransactionNimiq; // eslint-disable-line @typescript-eslint/indent

type PublicKeyNimiq = import('@nimiq/core-web').PublicKey;
type TransactionInfoNimiq = import('./requests/nimiq/request-sign-transaction-nimiq').TransactionInfoNimiq;
type TransactionNimiq = import('@nimiq/core-web').Transaction;

export { isSupported, TransportType };
export { ErrorType, ErrorState };
export { Coin };
export { CoinAppConnection, RequestTypeNimiq };

export enum StateType {
    IDLE = 'idle',
    LOADING = 'loading',
    CONNECTING = 'connecting',
    REQUEST_PROCESSING = 'request-processing',
    REQUEST_CANCELLING = 'request-cancelling',
    ERROR = 'error',
}

// events appear at a single point of time while states reflect the current state of the api for a timespan ranging
// into the future. E.g. if a request was cancelled, a REQUEST_CANCELLED event gets thrown and the state changes to
// IDLE. Errors trigger an error state (e.g. when app outdated) and thus are a state, not an event.
export enum EventType {
    STATE_CHANGE = 'state-change',
    REQUEST_SUCCESSFUL = 'request-successful',
    REQUEST_CANCELLED = 'request-cancelled',
    CONNECTED = 'connected',
}

export type State = {
    type: Exclude<StateType, StateType.ERROR>,
    request?: Request,
} | ErrorState;

export default class LedgerApi {
    // public fields and methods
    public static readonly WAIT_TIME_AFTER_TIMEOUT = 1500;
    public static readonly WAIT_TIME_AFTER_ERROR = 500;

    public static readonly Nimiq = {
        /**
         * Get the 32 byte walletId of the currently connected wallet / coin app as base64. See documentation of
         * _getWalletId for more details.
         */
        async getWalletId(): Promise<string> {
            return LedgerApi._getWalletId(Coin.NIMIQ);
        },

        /**
         * Convert an address's index / keyId to the full Nimiq bip32 path.
         */
        getBip32PathForKeyId(keyId: number): string {
            return getBip32Path(Coin.NIMIQ, keyId);
        },

        /**
         * Extract an address's index / keyId from its bip32 path.
         */
        getKeyIdForBip32Path(path: string): number {
            return getKeyIdForBip32Path(Coin.NIMIQ, path);
        },

        /**
         * Get the public key for a given bip32 key path. Optionally expect a specific walletId.
         */
        async getPublicKey(keyPath: string, walletId?: string): Promise<PublicKeyNimiq> {
            return LedgerApi._callLedger(await LedgerApi._createRequest<RequestGetPublicKeyNimiq>(
                import('./requests/nimiq/request-get-public-key-nimiq'),
                { keyPath, walletId },
            ));
        },

        /**
         * Get the address for a given bip32 key path. Optionally expect a specific walletId.
         */
        async getAddress(keyPath: string, walletId?: string): Promise<string> {
            return LedgerApi._callLedger(await LedgerApi._createRequest<RequestGetAddressNimiq>(
                import('./requests/nimiq/request-get-address-nimiq'),
                { keyPath, walletId },
            ));
        },

        /**
         * Confirm that an address belongs to the connected Ledger and display the address to the user on the Ledger
         * screen. Optionally expect a specific walletId.
         */
        async confirmAddress(userFriendlyAddress: string, keyPath: string, walletId?: string): Promise<string> {
            return LedgerApi._callLedger(await LedgerApi._createRequest<RequestConfirmAddressNimiq>(
                import('./requests/nimiq/request-confirm-address-nimiq'),
                { keyPath, walletId, addressToConfirm: userFriendlyAddress },
            ));
        },

        /**
         * Utility function that combines getAddress and confirmAddress to directly get a confirmed address.
         */
        async getConfirmedAddress(keyPath: string, walletId?: string): Promise<string> {
            const address = await LedgerApi.Nimiq.getAddress(keyPath, walletId);
            return LedgerApi.Nimiq.confirmAddress(address, keyPath, walletId);
        },

        /**
         * Derive addresses for given bip32 key paths. Optionally expect a specific walletId.
         */
        async deriveAddresses(pathsToDerive: Iterable<string>, walletId?: string)
            : Promise<Array<{ address: string, keyPath: string }>> {
            return LedgerApi._callLedger(await LedgerApi._createRequest<RequestDeriveAddressesNimiq>(
                import('./requests/nimiq/request-derive-addresses-nimiq'),
                { pathsToDerive, walletId },
            ));
        },

        /**
         * Sign a transaction for a signing key specified by its bip32 key path. Note that the signing key /
         * corresponding address does not necessarily need to be the transaction's sender address for example for
         * transactions sent from vesting contracts. Optionally expect a specific walletId.
         */
        async signTransaction(transaction: TransactionInfoNimiq, keyPath: string, walletId?: string)
            : Promise<TransactionNimiq> {
            return LedgerApi._callLedger(await LedgerApi._createRequest<RequestSignTransactionNimiq>(
                import('./requests/nimiq/request-sign-transaction-nimiq'),
                { transaction, keyPath, walletId },
            ));
        },
    };

    public static get currentState(): State {
        return LedgerApi._currentState;
    }

    public static get currentRequest(): Request | null {
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
     * @param coin - Which Ledger coin app to connect to.
     * @returns Whether connecting to the Ledger succeeded.
     */
    public static async connect(coin: Coin): Promise<boolean> {
        LedgerApi._connectionAborted = false; // reset aborted flag on manual connection
        try {
            // Initialize the transport again if it failed previously, for example due to missing user interaction.
            await LedgerApi._getTransport();
        } catch (e) {
            // Silently continue on errors, same as the other API methods. Error was reported by _getTransport as error
            // state instead. Only if user aborted the connection or browser is not supported, don't continue.
            if (/connection aborted|not supported/i.test(e.message || e)) return false;
        }
        try {
            // Use _getWalletId to detect when the ledger is connected.
            await LedgerApi._getWalletId(coin);
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

        const transportPromise = LedgerApi._transportPromise;
        LedgerApi._transportPromise = null;
        LedgerApi._currentConnection = null;

        if (!transportPromise) return;
        try {
            const api = await transportPromise;
            await api.close();
        } catch (e) {
            // Ignore.
        }
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

    // private fields and methods
    private static _transportType: TransportType | null = autoDetectTransportTypeToUse();
    private static _transportPromise: Promise<Transport> | null = null;
    private static _currentState: State = { type: StateType.IDLE };
    private static _currentRequest: Request | null = null;
    private static _currentConnection: CoinAppConnection | null = null;
    private static _connectionAborted: boolean = false;
    private static readonly _observable = new Observable();

    /**
     * Get the 32 byte walletId of the currently connected wallet / coin app as base64.
     * If no ledger is connected, it waits for one to be connected.
     * Throws, if the request is cancelled or the wrong coin wallet connected.
     *
     * If currently a request to the ledger is in process, this call does not require an additional
     * request to the Ledger. Thus, if you want to know the walletId in conjunction with another
     * request, try to call this method after initiating the other request but before it finishes.
     *
     * @returns The walletId of the currently connected ledger as base 64.
     */
    private static async _getWalletId(coin: Coin): Promise<string> {
        if (LedgerApi._currentConnection && LedgerApi._currentConnection.coin === coin) {
            return LedgerApi._currentConnection.walletId;
        }
        // we have to wait for connection of ongoing request or initiate a call ourselves
        if (LedgerApi._currentRequest && LedgerApi._currentRequest.coin === coin) {
            // already a request for coin going on. Just wait for it to connect.
            return new Promise<string>((resolve, reject) => {
                const onConnect = (connection: CoinAppConnection) => {
                    LedgerApi.off(EventType.CONNECTED, onConnect);
                    LedgerApi.off(EventType.REQUEST_CANCELLED, onCancel);
                    resolve(connection.walletId);
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
        // We have to send a request ourselves.
        // Note that if the api is already busy with a request for another coin, a LEDGER_BUSY error will be thrown.
        switch (coin) {
            case Coin.NIMIQ:
                return LedgerApi._callLedger(await LedgerApi._createRequest<RequestGetWalletIdNimiq>(
                    import('./requests/nimiq/request-get-wallet-id-nimiq'),
                    {},
                ));
            default:
                throw new Error(`Unsupported coin: ${coin}`);
        }
    }

    private static async _createRequest<R extends Request>(
        requestConstructor: (new (params: R['params']) => R) | Promise<{ default: new (params: R['params']) => R }>,
        params: R['params'],
        prepareDependencies: boolean = true,
    ): Promise<R> {
        if (prepareDependencies && LedgerApi.transportType) {
            // Prepare dependencies in parallel. Ignore errors as it's just a preparation.
            loadTransportLibrary(LedgerApi.transportType).catch(() => {});
        }

        if (requestConstructor instanceof Promise) {
            try {
                requestConstructor = (await requestConstructor).default;
            } catch (e) {
                const error = new ErrorState(
                    ErrorType.LOADING_DEPENDENCIES_FAILED,
                    `Failed loading dependencies: ${e.message || e}`,
                );
                LedgerApi._setState(error);
                throw error;
            }
        }

        try {
            return new requestConstructor(params); // eslint-disable-line new-cap
        } catch (e) {
            if (e instanceof ErrorState) {
                LedgerApi._setState(e);
            }
            throw e;
        }
    }

    private static async _callLedger<R extends Request>(request: R): Promise<ReturnType<R['call']>> {
        if (LedgerApi.isBusy) {
            const error = new ErrorState(ErrorType.LEDGER_BUSY, 'Only one call to Ledger at a time allowed', request);
            LedgerApi._setState(error);
            throw error;
        }
        LedgerApi._connectionAborted = false; // user is initiating a new request
        try {
            LedgerApi._currentRequest = request;
            /* eslint-disable no-await-in-loop, no-async-promise-executor */
            return await new Promise<ReturnType<R['call']>>(async (resolve, reject) => {
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
                    } else {
                        LedgerApi._setState(StateType.REQUEST_CANCELLING);
                    }
                });
                while (!request.cancelled) {
                    try {
                        const transport = await LedgerApi._getTransport();
                        if (request.cancelled) break;
                        await LedgerApi._connect(transport, request);
                        if (request.cancelled) break;
                        LedgerApi._setState(StateType.REQUEST_PROCESSING);
                        lastRequestCallTime = Date.now();
                        canCancelDirectly = false; // sending request which has to be resolved / cancelled by the Ledger
                        const result = await request.call(transport);
                        if (request.cancelled) break;
                        LedgerApi._fire(EventType.REQUEST_SUCCESSFUL, request, result);
                        resolve(result as any);
                        return;
                    } catch (e) {
                        console.debug(e);
                        if (e instanceof ErrorState) {
                            LedgerApi._setState(e);
                        }

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
                            LedgerApi._currentConnection = null;
                        }
                        // Test whether user cancelled call on ledger device or in WebAuthn / U2F browser popup
                        if (message.indexOf('denied by the user') !== -1 // user rejected confirmAddress on device
                            || message.indexOf('request was rejected') !== -1 // user rejected signTransaction on device
                            || (LedgerApi._isWebAuthnOrU2fCancellation(message, lastRequestCallTime)
                                && !LedgerApi._connectionAborted)
                        ) {
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

    private static async _connect(transport: Transport, request: Request): Promise<Transport> {
        // Resolves when connected to unlocked ledger with open coin app otherwise throws an exception after timeout,
        // in contrast to the public connect method which uses _getWalletId to listen for a connection or to try to
        // connect repeatedly until success via _callLedger which uses the private _connect under the hood. Also this
        // method is not publicly exposed to avoid that it could be invoked multiple times in parallel which the ledger
        // requests called here do not allow.

        // Establish / verify the connection.
        // This takes <300ms for a pre-authorized device via WebUSB, WebHID or WebBLE and <1s for WebAuthn or U2F.
        if (!LedgerApi._currentConnection || LedgerApi._currentConnection.coin !== request.coin) {
            const connectStart = Date.now();
            LedgerApi._setState(StateType.CONNECTING);
            LedgerApi._currentConnection = null;

            try {
                LedgerApi._currentConnection = await request.checkCoinAppConnection(transport);
            } catch (e) {
                const message = (e.message || e || '').toLowerCase();
                if (e instanceof ErrorState) {
                    LedgerApi._setState(e);
                } else if (message.indexOf('busy') !== -1) {
                    const error = new ErrorState(ErrorType.LEDGER_BUSY, `Only one call to Ledger at a time allowed: ${
                        e}`); // important to rethrow original message for handling of the 'busy' keyword in _callLedger
                    LedgerApi._setState(error);
                    throw error;
                } else if (LedgerApi._isWebAuthnOrU2fCancellation(message, connectStart)) {
                    LedgerApi._connectionAborted = true;
                    const error = new ErrorState(ErrorType.CONNECTION_ABORTED, `Connection aborted: ${message}`);
                    LedgerApi._setState(error);
                    throw error;
                }

                // Just rethrow other errors that just keep the API retrying (like timeout, dongle locked).
                throw e;
            }
        }

        LedgerApi._fire(EventType.CONNECTED, LedgerApi._currentConnection);
        return transport;
    }

    private static async _getTransport(): Promise<Transport> {
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
                const error = new ErrorState(ErrorType.BROWSER_UNSUPPORTED, 'Ledger not supported by browser.');
                LedgerApi._setState(error);
                throw error;
            }

            // Load transport lib.
            let TransportLib: TransportWebUsbConstructor | TransportConstructor;
            // Only set the loading state if the lib is not already loaded or fails instantly.
            const delayedLoadingStateTimeout = setTimeout(() => LedgerApi._setState(StateType.LOADING), 50);
            try {
                TransportLib = await loadTransportLibrary(transportType!);
            } catch (e) {
                if (transportType === LedgerApi._transportType) {
                    const error = new ErrorState(
                        ErrorType.LOADING_DEPENDENCIES_FAILED,
                        `Failed loading dependencies: ${e.message || e}`,
                    );
                    LedgerApi._setState(error);
                    throw error;
                }
            } finally {
                clearTimeout(delayedLoadingStateTimeout);
            }
            if (transportType !== LedgerApi._transportType) throw new Error('Transport changed'); // caught locally

            let transport: Transport;
            // Only set the connecting state if it is not instantaneous because a device selector needs to be shown
            const delayedConnectingStateTimeout = setTimeout(() => LedgerApi._setState(StateType.CONNECTING), 50);
            try {
                transport = await TransportLib!.create();
            } catch (e) {
                if (transportType === LedgerApi._transportType) {
                    const message = (e.message || e).toLowerCase();
                    if (/no device selected|access denied|cancelled the requestdevice/i.test(message)) {
                        if (LedgerApi._transportType === TransportType.WEB_USB) {
                            // Use a fallback as the user might not have been able to select his device due to the Nano
                            // X currently not being discoverable via WebUSB in Windows.
                            // This fallback also temporarily serves Linux users which have not updated their udev rules
                            // TODO the fallback is just temporary and to be removed once WebUSB with Nano X works on
                            //  Windows or WebHID is more broadly available.
                            const fallback = [TransportType.WEB_AUTHN, TransportType.U2F].find(isSupported);
                            if (!fallback) {
                                const error = new ErrorState(
                                    ErrorType.BROWSER_UNSUPPORTED,
                                    'Ledger not supported by browser.',
                                );
                                LedgerApi._setState(error);
                                throw error;
                            }
                            console.warn(`LedgerApi: switching to ${fallback} as fallback`);
                            LedgerApi.setTransportType(fallback!);
                        } else {
                            LedgerApi._connectionAborted = true;
                            const error = new ErrorState(
                                ErrorType.CONNECTION_ABORTED,
                                `Connection aborted: ${message}`,
                            );
                            LedgerApi._setState(error);
                            throw error;
                        }
                    } else if (message.indexOf('user gesture') !== -1) {
                        const error = new ErrorState(ErrorType.USER_INTERACTION_REQUIRED, e);
                        LedgerApi._setState(error);
                        throw error;
                    } else {
                        throw e; // rethrow unknown exception
                    }
                }
            } finally {
                clearTimeout(delayedConnectingStateTimeout);
            }
            if (transportType !== LedgerApi._transportType) {
                transport!.close();
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
            transport!.on('disconnect', onDisconnect);

            return transport!;
        })();

        try {
            return await LedgerApi._transportPromise;
        } catch (e) {
            LedgerApi._transportPromise = null;
            if (transportType === LedgerApi._transportType) throw e;
            // Transport type changed while we were connecting; ignore error and rerun
            return LedgerApi._getTransport();
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

    private static _setState(state: State | Exclude<StateType, StateType.ERROR>): void {
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
            && LedgerApi._currentState.request === state.request) return;
        LedgerApi._currentState = state;
        LedgerApi._fire(EventType.STATE_CHANGE, state);
    }

    private static _fire(eventName: EventType, ...args: any[]): void {
        LedgerApi._observable.fire(eventName, ...args);
    }
}
