import { R as RequestBitcoin } from './lazy-chunk-request-bitcoin.es.js';
import { RequestTypeBitcoin } from './ledger-api.es.js';
import './lazy-chunk-request.es.js';

class RequestGetWalletIdBitcoin extends RequestBitcoin {
    type = RequestTypeBitcoin.GET_WALLET_ID;
    network;
    constructor(network) {
        super();
        this.network = network;
    }
    async call(transport) {
        if (!this._coinAppConnection || !this._coinAppConnection.walletId) {
            this._coinAppConnection = await this.checkCoinAppConnection(transport);
        }
        return this._coinAppConnection.walletId;
    }
    canReuseCoinAppConnection(coinAppConnection) {
        return super.canReuseCoinAppConnection(coinAppConnection) && !!coinAppConnection.walletId;
    }
    get _isWalletIdDerivationRequired() {
        return true;
    }
}

export { RequestGetWalletIdBitcoin as default };
//# sourceMappingURL=lazy-chunk-request-get-wallet-id-bitcoin.es.js.map
