import RequestNimiq from './request-nimiq';
import { CoinAppConnection } from '../request';
import { RequestTypeNimiq } from '../../constants';
import { NimiqVersion } from '../../../lib/constants';
type Transport = import('@ledgerhq/hw-transport').default;
export default class RequestGetWalletIdNimiq extends RequestNimiq<NimiqVersion, string> {
    readonly type: RequestTypeNimiq.GET_WALLET_ID;
    constructor(nimiqVersion: NimiqVersion);
    call(transport: Transport): Promise<string>;
    canReuseCoinAppConnection(coinAppConnection: CoinAppConnection): boolean;
    protected get _isWalletIdDerivationRequired(): boolean;
}
export {};
