import Request, { CoinAppConnection } from '../request';
import { AddressTypeBitcoin, Coin, Network, RequestTypeBitcoin } from '../../constants';
import { getBip32Path } from '../../bip32-utils';
import ErrorState, { ErrorType } from '../../error-state';

type Transport = import('@ledgerhq/hw-transport').default;
type LowLevelApiConstructor = typeof import('@ledgerhq/hw-app-btc').default;
type LowLevelApi = InstanceType<LowLevelApiConstructor>;
type BitcoinLib = typeof import('./bitcoin-lib');

export { RequestTypeBitcoin };

export default abstract class RequestBitcoin<T> extends Request<T> {
    private static _lowLevelApiPromise: Promise<LowLevelApi> | null = null;

    public readonly coin: Coin.BITCOIN = Coin.BITCOIN;
    public readonly minRequiredAppVersion: string = '1.3.8'; // first version supporting web usb
    public readonly abstract network: Network;

    public get requiredApp(): string {
        // Note that Ledger provides a separate Bitcoin testnet app which can be installed by enabling developer mode in
        // Ledger Live. Operating on testnet paths is generally allowed also for the Bitcoin mainnet app and retrieved
        // public keys (and thus also computed extended keys) and signed transactions are identical to the testnet app,
        // however addresses displayed or generated by the Ledger are in mainnet format, regardless of whether a testnet
        // path is specified. The testnet app since version 1.4.6 shows a warning when accessing mainnet paths. For
        // these reason we generally block using the Bitcoin mainnet and testnet apps interchangeably.
        return `Bitcoin${this.network === Network.TESTNET ? ' Test' : ''}`;
    }

    protected constructor(expectedWalletId?: string) {
        super(expectedWalletId);

        // Preload dependencies. Bitcoin lib is preloaded individually by request child classes that need it.
        // Ignore errors.
        Promise.all([
            this._loadLowLevelApi(), // needed by all requests
            this._isWalletIdDerivationRequired ? import('sha.js/sha256') : null,
        ]).catch(() => {});
    }

    public async checkCoinAppConnection(transport: Transport): Promise<CoinAppConnection> {
        const coinAppConnection = await super.checkCoinAppConnection(transport, 'BTC');
        if (!this._isWalletIdDerivationRequired) return coinAppConnection; // skip wallet id derivation

        // Note that api and sha256 are preloaded in the constructor, therefore we don't need to optimize for load order
        // or execution order here.
        const api = await this._getLowLevelApi(transport); // throws LOADING_DEPENDENCIES_FAILED on failure
        // TODO For u2f and WebAuthn, the Ledger displays a confirmation screen to get the public key if the user has
        //  this privacy setting enabled. The get public key functionality also supports setting a permission token
        //  which however is not implemented in @ledgerhq/hw-app-btc and therefore would need to be implemented manually
        const { publicKey } = await api.getWalletPublicKey(getBip32Path({
            coin: Coin.BITCOIN,
            addressType: AddressTypeBitcoin.LEGACY,
            network: this.network,
            accountIndex: 0,
            addressIndex: 0,
            isInternal: false,
        }));

        let Sha256: typeof import('sha.js/sha256').default;
        try {
            // Note that loading sha here only for wallet id calculation is not really wasteful as it's also imported
            // by the ledger api and bitcoinjs.
            Sha256 = (await import('sha.js/sha256')).default;
        } catch (e) {
            throw new ErrorState(
                ErrorType.LOADING_DEPENDENCIES_FAILED,
                `Failed loading dependencies: ${e.message || e}`,
                this,
            );
        }

        const walletId = new Sha256().update(publicKey, 'hex').digest('base64');
        this._checkExpectedWalletId(walletId);
        coinAppConnection.walletId = walletId;
        return coinAppConnection;
    }

    protected async _getLowLevelApi(transport: Transport): Promise<LowLevelApi> {
        if (!RequestBitcoin._lowLevelApiPromise
            || transport !== (await RequestBitcoin._lowLevelApiPromise as any).transport) {
            // No low level api instantiated yet or transport / transport type changed in the meantime.
            // Note that property transport exists on AppBtc but is not defined in the types. Unfortunately we can't
            // use type augmentation as it's the default export and therefore we cast to any.
            RequestBitcoin._lowLevelApiPromise = this._loadLowLevelApi()
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

    private async _loadLowLevelApi(): Promise<LowLevelApiConstructor> {
        try {
            return (await import('@ledgerhq/hw-app-btc')).default;
        } catch (e) {
            throw new ErrorState(
                ErrorType.LOADING_DEPENDENCIES_FAILED,
                `Failed loading dependencies: ${e.message || e}`,
                this,
            );
        }
    }

    protected async _loadBitcoinLib(): Promise<BitcoinLib> {
        try {
            return await import('./bitcoin-lib');
        } catch (e) {
            throw new ErrorState(
                ErrorType.LOADING_DEPENDENCIES_FAILED,
                `Failed loading dependencies: ${e.message || e}`,
                this,
            );
        }
    }
}
