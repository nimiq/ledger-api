import Request, { CoinAppConnection } from '../request';
import { Coin, RequestTypeNimiq } from '../../constants';
import { NimiqVersion } from '../../../lib/constants';
import { type Nimiq } from '../../../lib/load-nimiq';
type Transport = import('@ledgerhq/hw-transport').default;
type LowLevelApiConstructor = typeof import('../../../low-level-api/low-level-api').default;
type LowLevelApi = InstanceType<LowLevelApiConstructor>;
export { RequestTypeNimiq };
export default abstract class RequestNimiq<Version extends NimiqVersion, T> extends Request<T> {
    private static _lowLevelApiPromise;
    readonly coin: Coin.NIMIQ;
    readonly requiredApp: string;
    readonly nimiqVersion: Version;
    get minRequiredAppVersion(): string;
    protected constructor(nimiqVersion: Version, expectedWalletId?: string);
    checkCoinAppConnection(transport: Transport): Promise<CoinAppConnection>;
    protected _getLowLevelApi(transport: Transport): Promise<LowLevelApi>;
    private _loadLowLevelApi;
    protected _loadNimiq(): Promise<Nimiq<Version>>;
}
