import { RequestTypeNimiq } from './ledger-api.es.js';
import './lazy-chunk-request.es.js';
import './lazy-chunk-request-nimiq.es.js';
import { R as RequestWithKeyPathNimiq } from './lazy-chunk-request-with-key-path-nimiq.es.js';

class RequestGetPublicKeyNimiq extends RequestWithKeyPathNimiq {
    constructor(keyPath, expectedWalletId) {
        const type = RequestTypeNimiq.GET_PUBLIC_KEY;
        super(keyPath, expectedWalletId, { type });
        this.type = type;
        // Preload Nimiq lib. Ledger Nimiq api is already preloaded by parent class. Ignore errors.
        this._loadNimiq().catch(() => { });
    }
    async call(transport) {
        const api = await this._getLowLevelApi(transport); // throws LOADING_DEPENDENCIES_FAILED on failure
        const { publicKey } = await api.getPublicKey(this.keyPath, true, // validate
        false);
        const Nimiq = await this._loadNimiq(); // throws LOADING_DEPENDENCIES_FAILED on failure
        return new Nimiq.PublicKey(publicKey);
    }
}

export default RequestGetPublicKeyNimiq;
//# sourceMappingURL=lazy-chunk-request-get-public-key-nimiq.es.js.map
