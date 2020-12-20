import RequestNimiq from './request-nimiq';
import { CoinAppConnection } from '../request';
import { RequestTypeNimiq } from '../../constants';
declare type Transport = import('@ledgerhq/hw-transport').default;
export default class RequestGetWalletIdNimiq extends RequestNimiq<string> {
    readonly type: RequestTypeNimiq.GET_WALLET_ID;
    private _coinAppConnection;
    constructor();
    call(transport: Transport): Promise<string>;
    checkCoinAppConnection(transport: Transport): Promise<CoinAppConnection>;
    canReuseCoinAppConnection(coinAppConnection: CoinAppConnection): boolean;
    protected get _isWalletIdDerivationRequired(): boolean;
}
export {};
