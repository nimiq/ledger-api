import RequestBitcoin from './request-bitcoin';
import { CoinAppConnection } from '../request';
import { Network, RequestTypeBitcoin } from '../../constants';

type Transport = import('@ledgerhq/hw-transport').default;

export default class RequestGetWalletIdBitcoin extends RequestBitcoin<string> {
    public readonly type: RequestTypeBitcoin.GET_WALLET_ID = RequestTypeBitcoin.GET_WALLET_ID;
    public readonly network: Network;
    private _coinAppConnection: CoinAppConnection | null = null;

    constructor(network: Network) {
        super();
        this.network = network;
    }

    public async call(transport: Transport): Promise<string> {
        this._coinAppConnection = this._coinAppConnection || await this.checkCoinAppConnection(transport);
        return this._coinAppConnection.walletId!;
    }

    public async checkCoinAppConnection(transport: Transport): Promise<CoinAppConnection> {
        this._coinAppConnection = await super.checkCoinAppConnection(transport);
        return this._coinAppConnection;
    }

    public canReuseCoinAppConnection(coinAppConnection: CoinAppConnection): boolean {
        const canReuseCoinAppConnection = super.canReuseCoinAppConnection(coinAppConnection)
            && !!coinAppConnection.walletId;
        if (canReuseCoinAppConnection) {
            // Use the provided coin app connection which includes the wallet id such that checkCoinAppConnection
            // doesn't have to be called anymore to determine the wallet id.
            this._coinAppConnection = coinAppConnection;
        }
        return canReuseCoinAppConnection;
    }

    protected get _isWalletIdDerivationRequired() {
        return true;
    }
}
