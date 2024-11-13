import { R as RequestWithKeyPathNimiq } from './lazy-chunk-request-with-key-path-nimiq.es.js';
import { RequestTypeNimiq, ErrorState, ErrorType } from './ledger-api.es.js';
import './lazy-chunk-request-nimiq.es.js';
import './lazy-chunk-request.es.js';

class RequestGetAddressNimiq extends RequestWithKeyPathNimiq {
    type;
    display;
    expectedAddress;
    constructor(nimiqVersion, keyPath, display, expectedAddress, expectedWalletId) {
        const type = RequestTypeNimiq.GET_ADDRESS;
        super(nimiqVersion, keyPath, expectedWalletId, { type, display, expectedAddress });
        this.type = type;
        this.display = display;
        this.expectedAddress = expectedAddress;
    }
    async call(transport) {
        const api = await this._getLowLevelApi(transport); // throws LOADING_DEPENDENCIES_FAILED on failure
        const { address } = await api.getAddress(this.keyPath, true, // validate
        !!this.display, // display
        this.nimiqVersion);
        if (this.expectedAddress
            && this.expectedAddress.replace(/ /g, '').toUpperCase()
                !== address.replace(/ /g, '').toUpperCase()) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, 'Address mismatch', this);
        }
        return address;
    }
}

export { RequestGetAddressNimiq as default };
//# sourceMappingURL=lazy-chunk-request-get-address-nimiq.es.js.map
