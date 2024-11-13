import { R as RequestNimiq } from './lazy-chunk-request-nimiq.es.js';
import { RequestTypeNimiq } from './ledger-api.es.js';
import './lazy-chunk-request.es.js';

class RequestGetWalletIdNimiq extends RequestNimiq {
    type = RequestTypeNimiq.GET_WALLET_ID;
    constructor(nimiqVersion) {
        // public constructor calling the parent protected constructor
        super(nimiqVersion);
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

export { RequestGetWalletIdNimiq as default };
//# sourceMappingURL=lazy-chunk-request-get-wallet-id-nimiq.es.js.map
