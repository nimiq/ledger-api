import { RequestTypeBitcoin } from './ledger-api.es.js';
import './lazy-chunk-request.es.js';
import { R as RequestBitcoin } from './lazy-chunk-request-bitcoin.es.js';

class RequestGetWalletIdBitcoin extends RequestBitcoin {
    constructor(network) {
        super();
        this.type = RequestTypeBitcoin.GET_WALLET_ID;
        this._coinAppConnection = null;
        this.network = network;
    }
    async call(transport) {
        this._coinAppConnection = this._coinAppConnection || await this.checkCoinAppConnection(transport);
        return this._coinAppConnection.walletId;
    }
    async checkCoinAppConnection(transport) {
        this._coinAppConnection = await super.checkCoinAppConnection(transport);
        return this._coinAppConnection;
    }
    canReuseCoinAppConnection(coinAppConnection) {
        const canReuseCoinAppConnection = super.canReuseCoinAppConnection(coinAppConnection)
            && !!coinAppConnection.walletId;
        if (canReuseCoinAppConnection) {
            // Use the provided coin app connection which includes the wallet id such that checkCoinAppConnection
            // doesn't have to be called anymore to determine the wallet id.
            this._coinAppConnection = coinAppConnection;
        }
        return canReuseCoinAppConnection;
    }
    get _isWalletIdDerivationRequired() {
        return true;
    }
}

export default RequestGetWalletIdBitcoin;
//# sourceMappingURL=lazy-chunk-request-get-wallet-id-bitcoin.es.js.map
