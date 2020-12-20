import Request, { CoinAppConnection } from '../request';
import { Coin, Network, RequestTypeBitcoin } from '../../constants';
declare type Transport = import('@ledgerhq/hw-transport').default;
declare type LowLevelApiConstructor = typeof import('@ledgerhq/hw-app-btc').default;
declare type LowLevelApi = InstanceType<LowLevelApiConstructor>;
declare type BitcoinLib = typeof import('./bitcoin-lib');
export { RequestTypeBitcoin };
export default abstract class RequestBitcoin<T> extends Request<T> {
    private static _lowLevelApiPromise;
    readonly coin: Coin.BITCOIN;
    readonly minRequiredAppVersion: string;
    abstract readonly network: Network;
    get requiredApp(): string;
    protected constructor(expectedWalletId?: string);
    checkCoinAppConnection(transport: Transport): Promise<CoinAppConnection>;
    protected _getLowLevelApi(transport: Transport): Promise<LowLevelApi>;
    private _loadLowLevelApi;
    protected _loadBitcoinLib(): Promise<BitcoinLib>;
}
