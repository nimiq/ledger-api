import Request, { CoinAppConnection } from '../request';
import { Coin, RequestTypeNimiq } from '../../constants';
import { getAppAndVersion } from '../../ledger-utils';
import { getBip32Path } from '../../bip32-utils';
import ErrorState, { ErrorType } from '../../error-state';
import { loadNimiqCore, loadNimiqCryptography } from '../../../lib/load-nimiq';

type Nimiq = typeof import('@nimiq/core-web');
type Transport = import('@ledgerhq/hw-transport').default;
type LowLevelApiConstructor = typeof import('../../../low-level-api/low-level-api').default;

type LowLevelApi = InstanceType<LowLevelApiConstructor>;

export { RequestTypeNimiq };

export default abstract class RequestNimiq<T> extends Request<T> {
    private static _lowLevelApiPromise: Promise<LowLevelApi> | null = null;

    protected static async _getLowLevelApi(transport: Transport): Promise<LowLevelApi> {
        if (!RequestNimiq._lowLevelApiPromise || transport !== (await RequestNimiq._lowLevelApiPromise).transport) {
            // no low level api instantiated yet or transport / transport type changed in the meantime
            RequestNimiq._lowLevelApiPromise = RequestNimiq._loadLowLevelApi()
                .then(
                    (LowLevelApi: LowLevelApiConstructor) => new LowLevelApi(transport),
                    (e) => {
                        RequestNimiq._lowLevelApiPromise = null;
                        return Promise.reject(e);
                    },
                );
        }
        return RequestNimiq._lowLevelApiPromise;
    }

    private static async _loadLowLevelApi(): Promise<LowLevelApiConstructor> {
        try {
            // build the low-level-api from source instead of taking it from dist to create optimized chunks and to
            // avoid double bundling of dependencies like buffer.
            return (await import('../../../low-level-api/low-level-api')).default;
        } catch (e) {
            throw new ErrorState(
                ErrorType.LOADING_DEPENDENCIES_FAILED,
                `Failed loading dependencies: ${e.message || e}`,
            );
        }
    }

    protected static async _loadNimiq(): Promise<Nimiq> {
        // Note that we don't need to cache a promise here as loadNimiqCore and loadNimiqCryptography already do that.
        const [Nimiq] = await Promise.all([
            loadNimiqCore(),
            // needed for walletId hashing and pub key to address derivation in SignatureProof and BasicTransaction
            loadNimiqCryptography(),
        ]);
        return Nimiq;
    }

    protected constructor(type: RequestTypeNimiq, walletId?: string) {
        super(
            Coin.NIMIQ,
            type,
            'Nimiq',
            '1.4.2', // first version supporting web usb
            walletId,
        );
        // Preload dependencies. Ignore errors.
        Promise.all([
            RequestNimiq._loadLowLevelApi(),
            RequestNimiq._loadNimiq(),
        ]).catch(() => {});
    }

    public async checkCoinAppConnection(transport: Transport): Promise<CoinAppConnection> {
        const apiPromise = RequestNimiq._getLowLevelApi(transport);
        const nimiqPromise = RequestNimiq._loadNimiq();

        const { name: app, version: appVersion } = await getAppAndVersion(transport, 'w0w');
        if (app !== this.requiredApp) {
            // avoid potential uncaught promise rejections
            Promise.all([apiPromise, nimiqPromise]).catch(() => {});
            throw new ErrorState(
                ErrorType.WRONG_APP,
                `Wrong app connected: ${app}, required: ${this.requiredApp}`,
                this,
            );
        }
        if (!Request._isAppVersionSupported(appVersion, this.minRequiredAppVersion)) {
            // avoid potential uncaught promise rejections
            Promise.all([apiPromise, nimiqPromise]).catch(() => {});
            throw new ErrorState(
                ErrorType.APP_OUTDATED,
                `Ledger ${app} app is outdated: ${appVersion}, required: ${this.minRequiredAppVersion}`,
                this,
            );
        }

        // For calculating the wallet id. Set validate to false as otherwise the call is much slower. For U2F this can
        // also unfreeze the ledger app, see transport-comparison.md.
        const api = await apiPromise; // throws LOADING_DEPENDENCIES_FAILED on failure
        const { publicKey: firstAddressPubKeyBytes } = await api.getPublicKey(
            getBip32Path({ coin: Coin.NIMIQ, addressIndex: 0 }),
            false, // validate
            false, // display
        );

        let Nimiq: Nimiq;
        try {
            Nimiq = await nimiqPromise;
        } catch (e) {
            throw new ErrorState(
                ErrorType.LOADING_DEPENDENCIES_FAILED,
                `Failed loading dependencies: ${e.message || e}`,
                this,
            );
        }

        // Compute wallet id. Use sha256 as blake2b yields the nimiq address
        const walletId = Nimiq.Hash.sha256(firstAddressPubKeyBytes).toBase64();

        this._checkExpectedWalletId(walletId);
        return { coin: this.coin, walletId, app, appVersion };
    }
}
