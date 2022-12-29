import RequestBitcoin from './request-bitcoin';
import { CoinAppConnection } from '../request';
import { Network, RequestTypeBitcoin } from '../../constants';

type Transport = import('@ledgerhq/hw-transport').default;

export default class RequestGetWalletIdBitcoin extends RequestBitcoin<string> {
    public readonly type: RequestTypeBitcoin.GET_WALLET_ID = RequestTypeBitcoin.GET_WALLET_ID;
    public readonly network: Network;

    constructor(network: Network) {
        super();
        this.network = network;
    }

    public async call(transport: Transport): Promise<string> {
        if (!this._coinAppConnection || !this._coinAppConnection.walletId) {
            this._coinAppConnection = await this.checkCoinAppConnection(transport);
        }
        return this._coinAppConnection.walletId!;
    }

    public canReuseCoinAppConnection(coinAppConnection: CoinAppConnection): boolean {
        return super.canReuseCoinAppConnection(coinAppConnection) && !!coinAppConnection.walletId;
    }

    protected get _isWalletIdDerivationRequired() {
        return true;
    }
}
