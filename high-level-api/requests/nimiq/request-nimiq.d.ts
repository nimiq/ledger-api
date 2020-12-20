import Request, { CoinAppConnection } from '../request';
import { Coin, RequestTypeNimiq } from '../../constants';
declare type Nimiq = typeof import('@nimiq/core-web');
declare type Transport = import('@ledgerhq/hw-transport').default;
declare type LowLevelApiConstructor = typeof import('../../../low-level-api/low-level-api').default;
declare type LowLevelApi = InstanceType<LowLevelApiConstructor>;
export { RequestTypeNimiq };
export default abstract class RequestNimiq<T> extends Request<T> {
    private static _lowLevelApiPromise;
    readonly coin: Coin.NIMIQ;
    readonly requiredApp: string;
    readonly minRequiredAppVersion: string;
    protected constructor(expectedWalletId?: string);
    checkCoinAppConnection(transport: Transport): Promise<CoinAppConnection>;
    protected _getLowLevelApi(transport: Transport): Promise<LowLevelApi>;
    private _loadLowLevelApi;
    protected _loadNimiq(): Promise<Nimiq>;
}
