import Request, { CoinAppConnection } from '../request';
import { AddressTypeBitcoin, Coin, Network, RequestTypeBitcoin } from '../../constants';
import { getAppAndVersion } from '../../ledger-utils';
import { getBip32Path } from '../../bip32-utils';
import ErrorState, { ErrorType } from '../../error-state';

type Transport = import('@ledgerhq/hw-transport').default;
type LowLevelApiConstructor = typeof import('@ledgerhq/hw-app-btc').default;
type LowLevelApi = InstanceType<LowLevelApiConstructor>;
type BitcoinLib = typeof import('./bitcoin-lib');

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

    protected static async _loadBitcoinLib(): Promise<BitcoinLib> {
        try {
            return await import('./bitcoin-lib');
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
            [1, 3, 8], // first version with WebUSB
            walletId,
        );
        // Preload dependencies. Do not preload bitcoin lib as it's not used by all requests. Ignore errors.
        Promise.all([
            RequestBitcoin._loadLowLevelApi(),
            import('sha.js/sha256'), // used for walletId calculation
        ]).catch(() => {});
    }

    public async checkCoinAppConnection(transport: Transport): Promise<CoinAppConnection> {
        const apiPromise = RequestBitcoin._getLowLevelApi(transport);
        // Note that loading sha here only for walletId calculation is not really wasteful as it's also imported by the
        // ledger api and bitcoinjs.
        const shaPromise = import('sha.js/sha256');

        const { name: app, version: appVersion } = await getAppAndVersion(transport, 'BTC');
        if (!/^Bitcoin(?: Test)?$/.test(app)) {
            // avoid potential uncaught promise rejections
            Promise.all([apiPromise, shaPromise]).catch(() => {});
            throw new ErrorState(
                ErrorType.WRONG_APP,
                `Wrong app connected: ${app}`,
                this,
            );
        }
        if (!Request._isAppVersionSupported(appVersion, this.minRequiredAppVersion)) {
            // avoid potential uncaught promise rejections
            Promise.all([apiPromise, shaPromise]).catch(() => {});
            throw new ErrorState(
                ErrorType.APP_OUTDATED,
                `Ledger ${app} app is outdated: ${appVersion}, required: ${this.minRequiredAppVersion}`,
                this,
            );
        }

        // TODO
        //  For u2f and WebAuthn, the Ledger displays a confirmation screen to get the public key if the user has this
        //  privacy setting enabled. The get public key functionality also supports setting a permission token which
        //  however is not implemented in @ledgerhq/hw-app-btc and therefore would need to be implemented manually.
        const api = await apiPromise;
        const { publicKey } = await api.getWalletPublicKey(getBip32Path({
            coin: Coin.BITCOIN,
            addressType: AddressTypeBitcoin.LEGACY,
            network: Network.MAINNET,
            accountIndex: 0,
            addressIndex: 0,
            isInternal: false,
        }));

        let Sha256: typeof import('sha.js/sha256').default;
        try {
            Sha256 = (await shaPromise).default;
        } catch (e) {
            throw new ErrorState(
                ErrorType.LOADING_DEPENDENCIES_FAILED,
                `Failed loading dependencies: ${e.message || e}`,
                this,
            );
        }

        const walletId = new Sha256().update(publicKey, 'hex').digest('base64');

        this._checkExpectedWalletId(walletId);
        return { coin: this.coin, walletId };
    }
}
