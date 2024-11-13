import { R as RequestWithKeyPathNimiq } from './lazy-chunk-request-with-key-path-nimiq.es.js';
import { RequestTypeNimiq } from './ledger-api.es.js';
import './lazy-chunk-request-nimiq.es.js';
import './lazy-chunk-request.es.js';

class RequestGetPublicKeyNimiq extends RequestWithKeyPathNimiq {
    type;
    constructor(nimiqVersion, keyPath, expectedWalletId) {
        const type = RequestTypeNimiq.GET_PUBLIC_KEY;
        super(nimiqVersion, keyPath, expectedWalletId, { type });
        this.type = type;
        // Preload Nimiq lib. Ledger Nimiq api is already preloaded by parent class. Ignore errors.
        this._loadNimiq().catch(() => { });
    }
    async call(transport) {
        const api = await this._getLowLevelApi(transport); // throws LOADING_DEPENDENCIES_FAILED on failure
        const { publicKey } = await api.getPublicKey(this.keyPath, true, // validate
        false, // display
        this.nimiqVersion);
        const Nimiq = await this._loadNimiq(); // throws LOADING_DEPENDENCIES_FAILED on failure
        return new Nimiq.PublicKey(publicKey);
    }
}

export { RequestGetPublicKeyNimiq as default };
//# sourceMappingURL=lazy-chunk-request-get-public-key-nimiq.es.js.map
