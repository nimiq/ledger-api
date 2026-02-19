import Request, { CoinAppConnection } from '../request';
import { Coin, RequestTypeNimiq } from '../../constants';
import { getBip32Path } from '../../bip32-utils';
import { NimiqVersion } from '../../../lib/constants';

type Transport = import('@ledgerhq/hw-transport').default;
type LowLevelApiConstructor = typeof import('../../../low-level-api/low-level-api').default;

type LowLevelApi = InstanceType<LowLevelApiConstructor>;

export { RequestTypeNimiq };

export default abstract class RequestNimiq<Version extends NimiqVersion, T>
    extends Request<T> {
    private static _lowLevelApiPromise: Promise<LowLevelApi> | null = null;

    public readonly coin: Coin.NIMIQ = Coin.NIMIQ;
    public readonly requiredApp: string = 'Nimiq';
    public readonly nimiqVersion: Version;

    public get minRequiredAppVersion(): string {
        return '1.4.2'; // first version supporting web usb
    }

    protected constructor(nimiqVersion: Version, expectedWalletId?: string) {
        super(expectedWalletId);
        this.nimiqVersion = nimiqVersion;
    }

    public async checkCoinAppConnection(transport: Transport): Promise<CoinAppConnection> {
        const coinAppConnection = await super.checkCoinAppConnection(transport, 'w0w');
        if (!this._isWalletIdDerivationRequired) return coinAppConnection; // skip wallet id derivation

        const api = await this._getLowLevelApi(transport); // throws LOADING_DEPENDENCIES_FAILED on failure

        // Set validate to false as otherwise the call is much slower. For U2F this can also unfreeze the ledger app,
        // see transport-comparison.md. However, not sure whether this is still true today and as it's less relevant now
        // with WebUsb being used by default, we ignore this side effect for !this._isWalletIdDerivationRequired case.
        const { publicKey: firstAddressPubKeyBytes } = await api.getPublicKey(
            getBip32Path({ coin: Coin.NIMIQ, addressIndex: 0 }),
            false, // validate
            false, // display
            this.nimiqVersion,
        );

        // Compute base64 wallet id. Use sha256 as blake2b yields the nimiq address
        const walletIdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', firstAddressPubKeyBytes));
        const walletId = btoa(String.fromCodePoint(...walletIdHash));
        coinAppConnection.walletId = walletId; // change the original object which equals _coinAppConnection
        this._checkExpectedWalletId(walletId);
        return coinAppConnection;
    }

    protected async _getLowLevelApi(transport: Transport): Promise<LowLevelApi> {
        if (!RequestNimiq._lowLevelApiPromise || transport !== (await RequestNimiq._lowLevelApiPromise).transport) {
            // no low level api instantiated yet or transport / transport type changed in the meantime
            RequestNimiq._lowLevelApiPromise = this._loadDependencies()
                .then(({ LowLevelApi }) => new LowLevelApi(transport))
                .catch((e) => {
                    RequestNimiq._lowLevelApiPromise = null;
                    return Promise.reject(e);
                });
        }
        return RequestNimiq._lowLevelApiPromise;
    }

    protected async _loadDependencies(): Promise<{
        LowLevelApi: LowLevelApiConstructor,
    } & Awaited<ReturnType<Request<T>['_loadDependencies']>>> {
        const [parentDependencies, LowLevelApi] = await Promise.all([
            super._loadDependencies(),
            // Build the low-level-api from source instead of taking it from dist to create optimized chunks and to
            // avoid potential double bundling of dependencies.
            this._loadDependency(import('../../../low-level-api/low-level-api').then((module) => module.default)),
        ]);
        return { ...parentDependencies, LowLevelApi };
    }
}
