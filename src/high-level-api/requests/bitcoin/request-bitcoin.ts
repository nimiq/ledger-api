import Request, { CoinAppConnection } from '../request';
import { Coin, RequestTypeBitcoin } from '../../constants';
import ErrorState, { ErrorType } from '../../error-state';

type Transport = import('@ledgerhq/hw-transport').default;
type LowLevelApiConstructor = typeof import('@ledgerhq/hw-app-btc').default;

type LowLevelApi = InstanceType<LowLevelApiConstructor>;

export { RequestTypeBitcoin };

export default abstract class RequestBitcoin<T> extends Request<T> {
    private static _lowLevelApiPromise: Promise<LowLevelApi> | null = null;

    protected static async _getLowLevelApi(transport: Transport): Promise<LowLevelApi> {
        if (!RequestBitcoin._lowLevelApiPromise
            || transport !== (await RequestBitcoin._lowLevelApiPromise as any).transport) {
            // No low level api instantiated yet or transport / transport type changed in the meantime.
            // Note that property transport exists on AppBtc but is not defined in the types. Unfortunately we can't
            // use type augmentation as it's the default export and therefore we cast to any.
            RequestBitcoin._lowLevelApiPromise = RequestBitcoin._loadLowLevelApi()
                .then(
                    (LowLevelApi: LowLevelApiConstructor) => new LowLevelApi(transport),
                    (e) => {
                        RequestBitcoin._lowLevelApiPromise = null;
                        return Promise.reject(e);
                    },
                );
        }
        return RequestBitcoin._lowLevelApiPromise;
    }

    private static async _loadLowLevelApi(): Promise<LowLevelApiConstructor> {
        try {
            return (await import('@ledgerhq/hw-app-btc')).default;
        } catch (e) {
            throw new ErrorState(
                ErrorType.LOADING_DEPENDENCIES_FAILED,
                `Failed loading dependencies: ${e.message || e}`,
            );
        }
    }

    protected constructor(type: RequestTypeBitcoin, walletId?: string) {
        super(
            Coin.BITCOIN,
            type,
            [1, 4, 3], // first tested version
            walletId,
        );

        if (walletId) {
            // TODO remove in the future
            throw new ErrorState(
                ErrorType.REQUEST_ASSERTION_FAILED,
                'Expecting a specific wallet id is not implemented yet.',
                this,
            );
        }

        // Preload dependencies. Ignore errors.
        RequestBitcoin._loadLowLevelApi().catch(() => {});
    }

    public async checkCoinAppConnection(/* transport: Transport */): Promise<CoinAppConnection> {
        // TODO
        //  We could fetch a bitcoin public key here and hash it to a wallet id as we do for Nimiq. However, for u2f
        //  and WebAuthn, the Ledger displays a confirmation screen to get the public key if the user has this privacy
        //  setting enabled. So should we do it?
        //  For getting the app name and version we could use getAppAndVersion (see @ledgerhq/hw-app-btc) whcih is not
        //  exposed in the api though.
        //  Note that the get public key functionality also supports setting a permission token which however is also
        //  not implemented in @ledgerhq/hw-app-btc and therefore needs to be implemented manually.
        const walletId = 'dummy-bitcoin-wallet-id';

        // this._checkExpectedWalletId(walletId);
        return { coin: this.coin, walletId };
    }
}
