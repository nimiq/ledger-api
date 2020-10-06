import Request, { CoinAppConnection } from '../request';
import { Coin, RequestTypeNimiq } from '../../constants';
import { getBip32Path } from '../../bip32-utils';
import ErrorState, { ErrorType } from '../../error-state';
import LowLevelApi from '../../../low-level-api/low-level-api';
import { loadNimiqCore, loadNimiqCryptography } from '../../../lib/load-nimiq';

type Nimiq = typeof import('@nimiq/core-web');
type Transport = import('@ledgerhq/hw-transport').default;

export { RequestTypeNimiq };

export default abstract class RequestNimiq<P, R> extends Request<P, R> {
    private static _lowLevelApi: LowLevelApi | null = null;

    protected static _getLowLevelApi(transport: Transport): LowLevelApi {
        if (!RequestNimiq._lowLevelApi || transport !== RequestNimiq._lowLevelApi.transport) {
            // no low level api instantiated yet or transport / transport type changed in the meantime
            RequestNimiq._lowLevelApi = new LowLevelApi(transport);
        }
        return RequestNimiq._lowLevelApi;
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

    protected readonly _minRequiredAppVersion: number[] = [1, 4, 2]; // first version supporting web usb

    constructor(type: RequestTypeNimiq, params: P) {
        super(Coin.NIMIQ, type, params);
    }

    public async checkCoinAppConnection(transport: Transport): Promise<CoinAppConnection> {
        const nimiqPromise = RequestNimiq._loadNimiq();
        const api = RequestNimiq._getLowLevelApi(transport);

        // To check whether the connection to Nimiq app is established and to calculate the wallet id. Set
        // validate to false as otherwise the call is much slower. For U2F this can also unfreeze the ledger
        // app, see transport-comparison.md. Using getPublicKey and not getAppConfiguration, as other apps also
        // respond to getAppConfiguration (for example the Ethereum app).
        const { publicKey: firstAddressPubKeyBytes } = await api.getPublicKey(
            getBip32Path(Coin.NIMIQ, 0),
            false, // validate
            false, // display
        );
        const { version } = await api.getAppConfiguration();

        if (!this._isAppVersionSupported(version)) {
            throw new ErrorState(ErrorType.APP_OUTDATED, 'Ledger Nimiq App is outdated.');
        }

        let Nimiq: Nimiq;
        try {
            Nimiq = await nimiqPromise;
        } catch (e) {
            throw new ErrorState(
                ErrorType.LOADING_DEPENDENCIES_FAILED,
                `Failed loading dependencies: ${e.message || e}`,
            );
        }

        // Compute wallet id. Use sha256 as blake2b yields the nimiq address
        const walletId = Nimiq.Hash.sha256(firstAddressPubKeyBytes).toBase64();

        this._checkExpectedWalletId(walletId);
        return { coin: this.coin, walletId };
    }
}
