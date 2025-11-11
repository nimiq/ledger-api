import { R as RequestNimiq } from './lazy-chunk-request-nimiq.es.js';
import { RequestTypeNimiq, parseBip32Path, Coin, ErrorState, ErrorType } from './ledger-api.es.js';
import './lazy-chunk-request.es.js';

class RequestDeriveAddressesNimiq extends RequestNimiq {
    type = RequestTypeNimiq.DERIVE_ADDRESSES;
    pathsToDerive;
    constructor(nimiqVersion, pathsToDerive, expectedWalletId) {
        super(nimiqVersion, expectedWalletId);
        this.pathsToDerive = pathsToDerive;
        for (const keyPath of pathsToDerive) {
            try {
                if (parseBip32Path(keyPath).coin !== Coin.NIMIQ)
                    throw new Error('Not a Nimiq bip32 path');
            }
            catch (e) {
                throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, `Invalid keyPath ${keyPath}: ${e instanceof Error ? e.message : e}`, this);
            }
        }
    }
    async call(transport) {
        const api = await this._getLowLevelApi(transport); // throws LOADING_DEPENDENCIES_FAILED on failure
        const addressRecords = [];
        for (const keyPath of this.pathsToDerive) {
            if (this.cancelled)
                return addressRecords;
            // eslint-disable-next-line no-await-in-loop
            const { address } = await api.getAddress(keyPath, true, // validate
            false, // display
            this.nimiqVersion);
            addressRecords.push({ address, keyPath });
        }
        return addressRecords;
    }
}

export { RequestDeriveAddressesNimiq as default };
//# sourceMappingURL=lazy-chunk-request-derive-addresses-nimiq.es.js.map
