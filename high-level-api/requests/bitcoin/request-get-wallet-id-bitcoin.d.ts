import RequestBitcoin from './request-bitcoin';
import { CoinAppConnection } from '../request';
import { Network, RequestTypeBitcoin } from '../../constants';
declare type Transport = import('@ledgerhq/hw-transport').default;
export default class RequestGetWalletIdBitcoin extends RequestBitcoin<string> {
    readonly type: RequestTypeBitcoin.GET_WALLET_ID;
    readonly network: Network;
    private _coinAppConnection;
    constructor(network: Network);
    call(transport: Transport): Promise<string>;
    checkCoinAppConnection(transport: Transport): Promise<CoinAppConnection>;
    canReuseCoinAppConnection(coinAppConnection: CoinAppConnection): boolean;
    protected get _isWalletIdDerivationRequired(): boolean;
}
export {};
