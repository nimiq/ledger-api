import Request, { CoinAppConnection } from '../request';
import { Coin, RequestTypeNimiq } from '../../constants';
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

    public readonly coin: Coin.NIMIQ = Coin.NIMIQ;
    public readonly requiredApp: string = 'Nimiq';
    public readonly minRequiredAppVersion: string = '1.4.2'; // first version supporting web usb

    protected constructor(expectedWalletId?: string) {
        super(expectedWalletId);

        // Preload dependencies. Nimiq lib is preloaded individually by request child classes that need it.
        // Ignore errors.
        Promise.all([
            this._loadLowLevelApi(), // needed by all requests
            this._isWalletIdDerivationRequired ? this._loadNimiq() : null,
        ]).catch(() => {});
    }

    public async checkCoinAppConnection(transport: Transport): Promise<CoinAppConnection> {
        const coinAppConnection = await super.checkCoinAppConnection(transport, 'w0w');
        if (!this._isWalletIdDerivationRequired) return coinAppConnection; // skip wallet id derivation

        // Note that api and Nimiq are preloaded in the constructor, therefore we don't need to optimize for load order
        // or execution order here.
        const api = await this._getLowLevelApi(transport); // throws LOADING_DEPENDENCIES_FAILED on failure
        // Set validate to false as otherwise the call is much slower. For U2F this can also unfreeze the ledger app,
        // see transport-comparison.md. However, not sure whether this is still true today and as it's less relevant now
        // with WebUsb being used by default, we ignore this side effect for !this._isWalletIdDerivationRequired case.
        const { publicKey: firstAddressPubKeyBytes } = await api.getPublicKey(
            getBip32Path({ coin: Coin.NIMIQ, addressIndex: 0 }),
            false, // validate
            false, // display
        );

        const Nimiq = await this._loadNimiq(); // throws LOADING_DEPENDENCIES_FAILED on failure

        // Compute wallet id. Use sha256 as blake2b yields the nimiq address
        const walletId = Nimiq.Hash.sha256(firstAddressPubKeyBytes).toBase64();
        coinAppConnection.walletId = walletId; // change the original object which equals _coinAppConnection
        this._checkExpectedWalletId(walletId);
        return coinAppConnection;
    }

    protected async _getLowLevelApi(transport: Transport): Promise<LowLevelApi> {
        if (!RequestNimiq._lowLevelApiPromise || transport !== (await RequestNimiq._lowLevelApiPromise).transport) {
            // no low level api instantiated yet or transport / transport type changed in the meantime
            RequestNimiq._lowLevelApiPromise = this._loadLowLevelApi()
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

    private async _loadLowLevelApi(): Promise<LowLevelApiConstructor> {
        try {
            // build the low-level-api from source instead of taking it from dist to create optimized chunks and to
            // avoid double bundling of dependencies like buffer.
            return (await import('../../../low-level-api/low-level-api')).default;
        } catch (e) {
            throw new ErrorState(
                ErrorType.LOADING_DEPENDENCIES_FAILED,
                `Failed loading dependencies: ${e.message || e}`,
                this,
            );
        }
    }

    protected async _loadNimiq(): Promise<Nimiq> {
        try {
            // Note that we don't need to cache a promise as loadNimiqCore and loadNimiqCryptography already do that.
            const [Nimiq] = await Promise.all([
                loadNimiqCore(),
                // needed for wallet id hashing and pub key to address derivation in SignatureProof and BasicTransaction
                loadNimiqCryptography(),
            ]);
            return Nimiq;
        } catch (e) {
            throw new ErrorState(
                ErrorType.LOADING_DEPENDENCIES_FAILED,
                `Failed loading dependencies: ${e.message || e}`,
                this,
            );
        }
    }
}
