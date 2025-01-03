import Observable, { EventListener } from '../lib/observable';
import { NimiqVersion } from '../lib/constants';
import type { NimiqPrimitive } from '../lib/load-nimiq';
import {
    autoDetectTransportTypeToUse,
    isSupported,
    getNetworkEndpoint,
    setNetworkEndpoint,
    loadTransportLibrary,
    TransportType,
} from './transport-utils';
import { isAppSupported } from './app-utils';
import { getBip32Path, parseBip32Path } from './bip32-utils';
import ErrorState, { ErrorType } from './error-state';
import {
    AccountTypeNimiq,
    AddressTypeBitcoin,
    Coin,
    Network,
    NetworkIdNimiq,
    REQUEST_EVENT_CANCEL,
    RequestTypeBitcoin,
    RequestTypeNimiq,
    TransactionFlagsNimiq,
} from './constants';

type TransportConstructor = typeof import('@ledgerhq/hw-transport').default;
type TransportWebUsbConstructor = typeof import('@ledgerhq/hw-transport-webusb').default;
type Transport = InstanceType<TransportConstructor | TransportWebUsbConstructor>;

type CoinAppConnection = import('./requests/request').CoinAppConnection;

type RequestType = RequestTypeNimiq | RequestTypeBitcoin;

type RequestGetWalletIdNimiqConstructor = typeof import('./requests/nimiq/request-get-wallet-id-nimiq').default;
type RequestGetPublicKeyNimiqConstructor = typeof import('./requests/nimiq/request-get-public-key-nimiq').default;
type RequestGetAddressNimiqConstructor = typeof import('./requests/nimiq/request-get-address-nimiq').default;
type RequestDeriveAddressesNimiqConstructor = typeof import('./requests/nimiq/request-derive-addresses-nimiq').default;
type RequestSignTransactionNimiqConstructor = typeof import('./requests/nimiq/request-sign-transaction-nimiq').default;
type RequestSignMessageNimiqConstructor = typeof import('./requests/nimiq/request-sign-message-nimiq').default;

type RequestGetWalletIdBitcoinConstructor = typeof import('./requests/bitcoin/request-get-wallet-id-bitcoin').default;
type RequestGetAddressAndPublicKeyBitcoinConstructor =
    typeof import('./requests/bitcoin/request-get-address-and-public-key-bitcoin').default;
type RequestGetExtendedPublicKeyBitcoinConstructor =
    typeof import('./requests/bitcoin/request-get-extended-public-key-bitcoin').default;
type RequestSignTransactionBitcoinConstructor =
    typeof import('./requests/bitcoin/request-sign-transaction-bitcoin').default;
type RequestSignMessageBitcoinConstructor = typeof import('./requests/bitcoin/request-sign-message-bitcoin').default;

// define Request type as actually defined request classes to be more specific than the abstract parent class
/* eslint-disable @typescript-eslint/indent */
type RequestConstructor = RequestGetWalletIdNimiqConstructor | RequestGetPublicKeyNimiqConstructor
    | RequestGetAddressNimiqConstructor | RequestDeriveAddressesNimiqConstructor
    | RequestSignTransactionNimiqConstructor | RequestSignMessageNimiqConstructor
    | RequestGetWalletIdBitcoinConstructor | RequestGetAddressAndPublicKeyBitcoinConstructor
    | RequestGetExtendedPublicKeyBitcoinConstructor | RequestSignTransactionBitcoinConstructor
    | RequestSignMessageBitcoinConstructor;
/* eslint-enable @typescript-eslint/indent */
type Request = InstanceType<RequestConstructor>;

type TransactionInfoNimiq<Version extends NimiqVersion> =
    import('./requests/nimiq/request-sign-transaction-nimiq').TransactionInfoNimiq<Version>;
type MessageSignatureInfoNimiq<Version extends NimiqVersion> =
    import('./requests/nimiq/request-sign-message-nimiq').MessageSignatureInfoNimiq<Version>;

type TransactionInfoBitcoin = import('./requests/bitcoin/request-sign-transaction-bitcoin').TransactionInfoBitcoin;

export { isSupported, TransportType };
export { getBip32Path, parseBip32Path };
export { ErrorType, ErrorState };
export { Coin, Network, NimiqVersion, NetworkIdNimiq, AccountTypeNimiq, TransactionFlagsNimiq, AddressTypeBitcoin };
export { CoinAppConnection, RequestTypeNimiq, RequestTypeBitcoin, RequestType, Request };
export { TransactionInfoNimiq, TransactionInfoBitcoin };
export { MessageSignatureInfoNimiq };

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
    type: StateType.IDLE | StateType.LOADING | StateType.CONNECTING,
    request?: Request,
} | {
    type: StateType.REQUEST_PROCESSING | StateType.REQUEST_CANCELLING,
    request: Request,
} | ErrorState;

export default class LedgerApi {
    // public fields and methods
    public static readonly WAIT_TIME_AFTER_TIMEOUT = 1500;
    public static readonly WAIT_TIME_AFTER_ERROR = 500;

    public static readonly Nimiq = {
        /**
         * Get the 32 byte wallet id of the currently connected Nimiq wallet as base64.
         */
        async getWalletId(nimiqVersion: NimiqVersion = NimiqVersion.ALBATROSS): Promise<string> {
            return LedgerApi._callLedger(await LedgerApi._createRequest<RequestGetWalletIdNimiqConstructor>(
                import('./requests/nimiq/request-get-wallet-id-nimiq'),
                nimiqVersion,
            ));
        },

        /**
         * Get the public key for a given bip32 key path. Optionally expect a specific wallet id.
         */
        async getPublicKey<Version extends NimiqVersion = NimiqVersion.ALBATROSS>(
            keyPath: string,
            expectedWalletId?: string,
            nimiqVersion: Version = NimiqVersion.ALBATROSS as Version,
        ): Promise<NimiqPrimitive<'PublicKey', Version>> {
            return LedgerApi._callLedger(await LedgerApi._createRequest<RequestGetPublicKeyNimiqConstructor>(
                import('./requests/nimiq/request-get-public-key-nimiq'),
                nimiqVersion, keyPath, expectedWalletId,
            )) as Promise<NimiqPrimitive<'PublicKey', Version>>;
        },

        /**
         * Get the address for a given bip32 key path. Optionally display the address on the Ledger screen for
         * verification, expect a specific address or expect a specific wallet id.
         */
        async getAddress(
            keyPath: string,
            display = false,
            expectedAddress?: string,
            expectedWalletId?: string,
            nimiqVersion: NimiqVersion = NimiqVersion.ALBATROSS,
        ): Promise<string> {
            return LedgerApi._callLedger(await LedgerApi._createRequest<RequestGetAddressNimiqConstructor>(
                import('./requests/nimiq/request-get-address-nimiq'),
                nimiqVersion, keyPath, display, expectedAddress, expectedWalletId,
            ));
        },

        /**
         * Utility function that directly gets a confirmed address.
         */
        async getConfirmedAddress(
            keyPath: string,
            expectedWalletId?: string,
            nimiqVersion: NimiqVersion = NimiqVersion.ALBATROSS,
        ): Promise<string> {
            const address = await LedgerApi.Nimiq.getAddress(keyPath, false, undefined, expectedWalletId, nimiqVersion);
            return LedgerApi.Nimiq.getAddress(keyPath, true, address, expectedWalletId, nimiqVersion);
        },

        /**
         * Derive addresses for given bip32 key paths. Optionally expect a specific wallet id.
         */
        async deriveAddresses(
            pathsToDerive: Iterable<string>,
            expectedWalletId?: string,
            nimiqVersion: NimiqVersion = NimiqVersion.ALBATROSS,
        ): Promise<Array<{ address: string, keyPath: string }>> {
            return LedgerApi._callLedger(await LedgerApi._createRequest<RequestDeriveAddressesNimiqConstructor>(
                import('./requests/nimiq/request-derive-addresses-nimiq'),
                nimiqVersion, pathsToDerive, expectedWalletId,
            ));
        },

        /**
         * Sign a transaction for a signing key specified by its bip32 key path. Note that the signing key /
         * corresponding address does not necessarily need to be the transaction's sender address for example for
         * transactions sent from vesting contracts. Optionally expect a specific wallet id.
         */
        async signTransaction<Version extends NimiqVersion = NimiqVersion.ALBATROSS>(
            transaction: TransactionInfoNimiq<Version>,
            keyPath: string,
            expectedWalletId?: string,
            nimiqVersion: Version = NimiqVersion.ALBATROSS as Version,
        ): Promise<NimiqPrimitive<'Transaction', Version>> {
            return LedgerApi._callLedger(await LedgerApi._createRequest<RequestSignTransactionNimiqConstructor>(
                import('./requests/nimiq/request-sign-transaction-nimiq'),
                nimiqVersion, keyPath, transaction, expectedWalletId,
            )) as Promise<NimiqPrimitive<'Transaction', Version>>;
        },

        /**
         * Sign a message for a signing key specified by its bip32 key path. The message can be either an
         * utf8 string or an Uint8Array of arbitrary data. Optionally request the message to preferably be displayed as
         * hex or hash instead of as ascii, or expect a specific wallet id. If no preference for the display type is
         * specified, the message is by default tried to be displayed as ascii, hex or hash, in that order.
         */
        async signMessage<Version extends NimiqVersion = NimiqVersion.ALBATROSS>(
            message: string | Uint8Array,
            keyPath: string,
            flags?: { preferDisplayTypeHex: boolean, preferDisplayTypeHash: boolean } | number,
            expectedWalletId?: string,
            nimiqVersion: Version = NimiqVersion.ALBATROSS as Version,
        ): Promise<MessageSignatureInfoNimiq<Version>> {
            return await LedgerApi._callLedger(await LedgerApi._createRequest<RequestSignMessageNimiqConstructor>(
                import('./requests/nimiq/request-sign-message-nimiq'),
                nimiqVersion, keyPath, message, flags, expectedWalletId,
            )) as MessageSignatureInfoNimiq<Version>;
        },
    };

    public static readonly Bitcoin = {
        /**
         * Get the 32 byte wallet id of the currently connected Bitcoin wallet / app for a specific network as base64.
         */
        async getWalletId(network: Exclude<Network, Network.DEVNET>): Promise<string> {
            return LedgerApi._callLedger(await LedgerApi._createRequest<RequestGetWalletIdBitcoinConstructor>(
                import('./requests/bitcoin/request-get-wallet-id-bitcoin'),
                network,
            ));
        },

        /**
         * Get the public key, address and bip32 chain code for a given bip32 key path. Optionally display the address
         * on the Ledger screen for verification, expect a specific address or expect a specific wallet id.
         */
        async getAddressAndPublicKey(
            keyPath: string,
            display = false,
            expectedAddress?: string,
            expectedWalletId?: string,
        ): Promise<{ publicKey: string, address: string, chainCode: string }> {
            return LedgerApi._callLedger(
                await LedgerApi._createRequest<RequestGetAddressAndPublicKeyBitcoinConstructor>(
                    import('./requests/bitcoin/request-get-address-and-public-key-bitcoin'),
                    keyPath, display, expectedAddress, expectedWalletId,
                ),
            );
        },

        /**
         * Utility function that directly gets a confirmed address.
         */
        async getConfirmedAddressAndPublicKey(keyPath: string, expectedWalletId?: string)
            : Promise<{ publicKey: string, address: string, chainCode: string }> {
            const { address } = await LedgerApi.Bitcoin.getAddressAndPublicKey(
                keyPath,
                false,
                undefined,
                expectedWalletId,
            );
            return LedgerApi.Bitcoin.getAddressAndPublicKey(keyPath, true, address, expectedWalletId);
        },

        /**
         * Get the extended public key for a bip32 path from which addresses can be derived, encoded as specified in
         * bip32. The key path must follow the bip44 specification and at least be defined to the account level.
         * Optionally expect a specific wallet id.
         */
        async getExtendedPublicKey(keyPath: string, expectedWalletId?: string): Promise<string> {
            return LedgerApi._callLedger(await LedgerApi._createRequest<RequestGetExtendedPublicKeyBitcoinConstructor>(
                import('./requests/bitcoin/request-get-extended-public-key-bitcoin'),
                keyPath, expectedWalletId,
            ));
        },

        /**
         * Sign a transaction. See type declaration of TransactionInfoBitcoin in request-sign-transaction-bitcoin.ts
         * for documentation of the transaction format. Optionally expect a specific wallet id. The signed transaction
         * is returned in hex-encoded serialized form ready to be broadcast to the network.
         */
        async signTransaction(transaction: TransactionInfoBitcoin, expectedWalletId?: string): Promise<string> {
            return LedgerApi._callLedger(await LedgerApi._createRequest<RequestSignTransactionBitcoinConstructor>(
                import('./requests/bitcoin/request-sign-transaction-bitcoin'),
                transaction, expectedWalletId,
            ));
        },

        /**
         * Sign a message according to bip137 with the key specified via its bip32 path. The message can be either an
         * utf8 string or an Uint8Array of arbitrary data. Optionally expect a specific wallet id. The resulting
         * signature is base64 encoded.
         */
        async signMessage(message: string | Uint8Array, keyPath: string, expectedWalletId?: string)
            : Promise<{ signerAddress: string, signature: string }> {
            return LedgerApi._callLedger(await LedgerApi._createRequest<RequestSignMessageBitcoinConstructor>(
                import('./requests/bitcoin/request-sign-message-bitcoin'),
                keyPath, message, expectedWalletId,
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
     * @param [networkEndpoint] - Custom network endpoint to use for TransportType.NETWORK. Optional.
     */
    public static setTransportType(transportType: TransportType): void;
    public static setTransportType(transportType: TransportType.NETWORK, networkEndpoint?: string): void;
    public static setTransportType(transportType: TransportType, networkEndpoint?: string) {
        if (!isSupported(transportType)) throw new Error('Unsupported transport type.');
        if (transportType === LedgerApi._transportType
            && (!networkEndpoint || networkEndpoint === getNetworkEndpoint())) return;
        LedgerApi._transportType = transportType;
        if (transportType === TransportType.NETWORK && networkEndpoint) {
            setNetworkEndpoint(networkEndpoint);
        }
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
     * @param [nimiqVersion] - Only for Nimiq: which Nimiq library version to use internally. Albatross by default.
     * @param [network] - Only for Bitcoin: whether to connect to the mainnet or testnet app. Mainnet by default.
     * @returns Whether connecting to the Ledger succeeded.
     */
    public static async connect(coin: Coin): Promise<boolean>;
    public static async connect(coin: Coin.NIMIQ, nimiqVersion: NimiqVersion): Promise<boolean>;
    public static async connect(coin: Coin.BITCOIN, network: Exclude<Network, Network.DEVNET>): Promise<boolean>;
    public static async connect(
        coin: Coin,
        nimiqVersionOrBitcoinNetwork?: NimiqVersion | Exclude<Network, Network.DEVNET>,
    ): Promise<boolean> {
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
            if (currentConnection && currentConnection.coin === coin && isAppSupported(
                currentConnection.app,
                expectedApp,
                /* allowLegacy */ coin === Coin.BITCOIN,
                /* allowSpeculos */ true,
            )) {
                // Already connected.
                return true;
            }
            if (currentRequest && currentRequest.coin === coin
                && (!('network' in currentRequest) || currentRequest.network === bitcoinNetwork)) {
                // Wait for the ongoing request for coin to connect.
                // Initialize the transport again if it failed previously, for example due to missing user interaction.
                await LedgerApi._getTransport(currentRequest);
                await new Promise<void>((resolve, reject) => {
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
        } catch (e) {
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
    public static async disconnect(cancelRequest = true, requestTypesToDisconnect?: RequestType | RequestType[]) {
        const { currentRequest } = LedgerApi;
        if (currentRequest) {
            if (requestTypesToDisconnect !== undefined) {
                requestTypesToDisconnect = Array.isArray(requestTypesToDisconnect)
                    ? requestTypesToDisconnect
                    : [requestTypesToDisconnect];
                if (!requestTypesToDisconnect.includes(currentRequest.type)) return;
            }
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

    private static async _createRequest<RC extends RequestConstructor>(
        requestConstructor: (new (...params: ConstructorParameters<RC>) => InstanceType<RC>)
        | Promise<{ default: new (...params: ConstructorParameters<RC>) => InstanceType<RC> }>,
        ...params: ConstructorParameters<RC>
    ): Promise<InstanceType<RC>> {
        if (LedgerApi.transportType) {
            // Prepare transport dependency in parallel. Ignore errors as it's just a preparation.
            loadTransportLibrary(LedgerApi.transportType).catch(() => {});
        }

        if (requestConstructor instanceof Promise) {
            try {
                requestConstructor = (await requestConstructor).default;
            } catch (e) {
                const error = new ErrorState(
                    ErrorType.LOADING_DEPENDENCIES_FAILED,
                    `Failed loading dependencies: ${e instanceof Error ? e.message : e}`,
                    undefined,
                );
                LedgerApi._setState(error);
                throw error;
            }
        }

        try {
            // Note that the requestConstructor is typed as is instead of just RC | Promise<{ default: RC }> such that
            // typescript can determine which exact request is being created and returned.
            return new requestConstructor(...params); // eslint-disable-line new-cap
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
                        const transport = await LedgerApi._getTransport(request);
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
            } catch (e) {
                const message = (e instanceof Error ? e.message : String(e)).toLowerCase();
                if (message.indexOf('busy') !== -1) {
                    throw new ErrorState(
                        ErrorType.LEDGER_BUSY,
                        // important to rethrow original message for handling of the 'busy' keyword in _callLedger
                        `Only one call to Ledger at a time allowed: ${e}`,
                        request,
                    );
                } else if (LedgerApi._isWebAuthnOrU2fCancellation(message, connectStart)) {
                    LedgerApi._connectionAborted = true;
                    throw new ErrorState(
                        ErrorType.CONNECTION_ABORTED,
                        `Connection aborted: ${message}`,
                        request,
                    );
                }

                // Rethrow other errors that just keep the API retrying (like timeout, dongle locked) or error states.
                throw e;
            }
        }

        LedgerApi._fire(EventType.CONNECTED, LedgerApi._currentConnection);
        return transport;
    }

    private static async _getTransport(request: Request): Promise<Transport> {
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
                throw new ErrorState(
                    ErrorType.BROWSER_UNSUPPORTED,
                    'Ledger not supported by browser.',
                    request,
                );
            }

            // Load transport lib.
            let TransportLib: TransportWebUsbConstructor | TransportConstructor;
            // Only set the loading state if the lib is not already loaded or fails instantly.
            const delayedLoadingStateTimeout = setTimeout(() => LedgerApi._setState(StateType.LOADING), 50);
            try {
                TransportLib = await loadTransportLibrary(transportType!);
            } catch (e) {
                if (transportType === LedgerApi._transportType) {
                    throw new ErrorState(
                        ErrorType.LOADING_DEPENDENCIES_FAILED,
                        `Failed loading dependencies: ${e instanceof Error ? e.message : e}`,
                        request,
                    );
                }
            } finally {
                clearTimeout(delayedLoadingStateTimeout);
            }
            if (transportType !== LedgerApi._transportType) throw new Error('Transport changed'); // caught locally

            let transport: Transport;
            // Only set the connecting state if it is not instantaneous because a device selector needs to be shown
            const delayedConnectingStateTimeout = setTimeout(() => LedgerApi._setState(StateType.CONNECTING), 50);
            try {
                transport = await TransportLib!.create(
                    undefined, // use default openTimeout
                    // For network transport set a listenTimeout to avoid pinging the network endpoint indefinitely.
                    // Others can be cancelled by the user when he wants or can not listen to devices getting connected
                    // (u2f, WebAuthn) such that we don't have to put a timeout in place for other transport types.
                    transportType === TransportType.NETWORK ? 3000 : undefined,
                );
            } catch (e) {
                if (transportType === LedgerApi._transportType) {
                    const message = (e instanceof Error ? e.message : String(e)).toLowerCase();
                    if (/no device selected|access denied|cancelled the requestdevice/i.test(message)) {
                        LedgerApi._connectionAborted = true;
                        throw new ErrorState(
                            ErrorType.CONNECTION_ABORTED,
                            `Connection aborted: ${message}`,
                            request,
                        );
                    } else if (message.indexOf('user gesture') !== -1) {
                        throw new ErrorState(
                            ErrorType.USER_INTERACTION_REQUIRED,
                            e instanceof Error ? e : String(e),
                            request,
                        );
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
            return LedgerApi._getTransport(request);
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
            state = { type: state } as State;
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
