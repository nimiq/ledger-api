/// <reference path="../../../../src/lib/type-shims.d.ts" />
import Request, { CoinAppConnection } from '../request';
import { Coin, Network, RequestTypeBitcoin } from '../../constants';
type Transport = import('@ledgerhq/hw-transport').default;
type LowLevelApiConstructor = typeof import('@ledgerhq/hw-app-btc').default;
type LowLevelApi = InstanceType<LowLevelApiConstructor>;
type BitcoinLib = typeof import('./bitcoin-lib');
type Sha256 = typeof import('sha.js/sha256').default;
export { RequestTypeBitcoin };
export default abstract class RequestBitcoin<T> extends Request<T> {
    protected static _isNewApiSupported(app: string, appVersion: string): boolean;
    private static _lowLevelApiPromise;
    readonly coin: Coin.BITCOIN;
    readonly minRequiredAppVersion: string;
    abstract readonly network: Exclude<Network, Network.DEVNET>;
    get requiredApp(): string;
    get allowLegacyApp(): boolean;
    protected constructor(expectedWalletId?: string);
    checkCoinAppConnection(transport: Transport): Promise<CoinAppConnection>;
    protected _getLowLevelApi(transport: Transport): Promise<LowLevelApi>;
    private _loadLowLevelApi;
    protected _loadBitcoinLib(): Promise<BitcoinLib>;
    protected _loadSha256(): Promise<Sha256>;
}
