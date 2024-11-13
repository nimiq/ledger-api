import { R as RequestNimiq } from './lazy-chunk-request-nimiq.es.js';
import { parseBip32Path, Coin, ErrorState, ErrorType } from './ledger-api.es.js';

class RequestWithKeyPathNimiq extends RequestNimiq {
    keyPath;
    constructor(nimiqVersion, keyPath, expectedWalletId, childClassProperties = {}) {
        super(nimiqVersion, expectedWalletId);
        this.keyPath = keyPath;
        try {
            if (parseBip32Path(keyPath).coin !== Coin.NIMIQ)
                throw new Error('Not a Nimiq bip32 path');
        }
        catch (e) {
            // Set properties of child class such that these are present on the request in the thrown error state.
            for (const [key, value] of Object.entries(childClassProperties)) {
                this[key] = value;
            }
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, `Invalid keyPath ${keyPath}: ${e instanceof Error ? e.message : e}`, this);
        }
    }
}

export { RequestWithKeyPathNimiq as R };
//# sourceMappingURL=lazy-chunk-request-with-key-path-nimiq.es.js.map
