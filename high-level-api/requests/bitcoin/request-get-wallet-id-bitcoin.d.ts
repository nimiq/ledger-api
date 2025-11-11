import RequestBitcoin from './request-bitcoin';
import { CoinAppConnection } from '../request';
import { Network, RequestTypeBitcoin } from '../../constants';
type Transport = import('@ledgerhq/hw-transport').default;
export default class RequestGetWalletIdBitcoin extends RequestBitcoin<string> {
    readonly type: RequestTypeBitcoin.GET_WALLET_ID;
    readonly network: Exclude<Network, Network.DEVNET>;
    constructor(network: Exclude<Network, Network.DEVNET>);
    call(transport: Transport): Promise<string>;
    canReuseCoinAppConnection(coinAppConnection: CoinAppConnection): boolean;
    protected get _isWalletIdDerivationRequired(): boolean;
}
export {};
