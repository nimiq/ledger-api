import Request, { CoinAppConnection } from '../request';
import { AddressTypeBitcoin, Coin, Network, RequestTypeBitcoin } from '../../constants';
import { isAppVersionSupported, isLegacyApp } from '../../app-utils';
import { getBip32Path } from '../../bip32-utils';
import ErrorState, { ErrorType } from '../../error-state';

type Transport = import('@ledgerhq/hw-transport').default;
type LowLevelApiConstructor = typeof import('@ledgerhq/hw-app-btc').default;
type LowLevelApi = InstanceType<LowLevelApiConstructor>;
type BitcoinLib = typeof import('./bitcoin-lib');
type Sha256 = typeof import('sha.js/sha256').default;

export { RequestTypeBitcoin };

export default abstract class RequestBitcoin<T> extends Request<T> {
    protected static _isNewApiSupported(app: string, appVersion: string): boolean {
        // The Bitcoin app includes a new api starting with 2.0 which is mandatory since 2.1. Versions since 2.0 and
        // before 2.1 implement both, the old and the new api.
        return isAppVersionSupported(appVersion, '2')
            // "Bitcoin Legacy" and "Bitcoin Test Legacy" apps available in Ledger Live implement the old api,
            // regardless of the app version.
            && !isLegacyApp(app);
    }

    private static _lowLevelApiPromise: Promise<LowLevelApi> | null = null;

    public readonly coin: Coin.BITCOIN = Coin.BITCOIN;
    public readonly minRequiredAppVersion: string = '1.3.8'; // first version supporting web usb
    public readonly abstract network: Exclude<Network, Network.DEVNET>;

    public get requiredApp(): string {
        // Note that Ledger provides a separate Bitcoin testnet app which can be installed by enabling developer mode in
        // Ledger Live. Operating on testnet paths is generally not allowed for the Bitcoin mainnet app, and vice versa
        // since app version 2.0. Previously, it was allowed but already since version 1.4.6 a warning was shown. For
        // these reason we generally block using the Bitcoin mainnet and testnet apps interchangeably.
        return `Bitcoin${this.network === Network.TESTNET ? ' Test' : ''}`;
    }

    public get allowLegacyApp(): boolean {
        return true;
    }

    protected constructor(expectedWalletId?: string) {
        super(expectedWalletId);

        // Preload dependencies. Bitcoin lib is preloaded individually by request child classes that need it.
        // Ignore errors.
        Promise.all([
            this._loadLowLevelApi(), // needed by all requests
            this._isWalletIdDerivationRequired ? this._loadSha256() : null,
        ]).catch(() => {});
    }

    public async checkCoinAppConnection(transport: Transport): Promise<CoinAppConnection> {
        const coinAppConnection = await super.checkCoinAppConnection(transport, 'BTC');
        if (!this._isWalletIdDerivationRequired) return coinAppConnection; // skip wallet id derivation

        // Note that api and Sha256 are preloaded in the constructor, therefore we don't need to optimize for load order
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

        // Note that loading sha.js here only for wallet id calculation is not really wasteful as it's also imported by
        // @ledgerhq/hw-app-bitcoin and bitcoinjs-lib via create-hash anyway.
        const Sha256 = await this._loadSha256();
        const walletId = new Sha256().update(publicKey, 'hex').digest('base64');
        coinAppConnection.walletId = walletId; // change the original object which equals _coinAppConnection
        this._checkExpectedWalletId(walletId);
        return coinAppConnection;
    }

    protected async _getLowLevelApi(transport: Transport): Promise<LowLevelApi> {
        if (!RequestBitcoin._lowLevelApiPromise
            // @ts-expect-error _transport is private
            || transport !== (await RequestBitcoin._lowLevelApiPromise)._transport) {
            // No low level api instantiated yet or transport / transport type changed in the meantime.
            // Note that we don't need to check for a change of the connected Bitcoin app version as changing the app
            // or app version requires closing the app which triggers a transport change, see transport-comparison.md.
            const { app, appVersion } = this._coinAppConnection!;
            const apiToUse = RequestBitcoin._isNewApiSupported(app, appVersion) ? 'bitcoin' : 'legacy';
            RequestBitcoin._lowLevelApiPromise = this._loadLowLevelApi()
                .then(
                    // We use the currency parameter to choose which api to use, by passing 'bitcoin' for the new api
                    // and something else for the old api, because the old api is currently used for all Bitcoin forks /
                    // altcoins.
                    (LowLevelApi: LowLevelApiConstructor) => new LowLevelApi({ transport, currency: apiToUse }),
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
                `Failed loading dependencies: ${e instanceof Error ? e.message : e}`,
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
                `Failed loading dependencies: ${e instanceof Error ? e.message : e}`,
                this,
            );
        }
    }

    protected async _loadSha256(): Promise<Sha256> {
        try {
            // Note: we've not installed sha.js as dependency, to make sure we're using the version that comes with
            // @ledgerhq/hw-app-btc and bitcoinjs-lib#create-hash without the risk of bundling an additional version.
            return (await import('sha.js/sha256')).default; // eslint-disable-line import/no-extraneous-dependencies
        } catch (e) {
            throw new ErrorState(
                ErrorType.LOADING_DEPENDENCIES_FAILED,
                `Failed loading dependencies: ${e instanceof Error ? e.message : e}`,
                this,
            );
        }
    }
}
