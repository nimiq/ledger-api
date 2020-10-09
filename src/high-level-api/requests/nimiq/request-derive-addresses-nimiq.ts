import RequestNimiq from './request-nimiq';
import { Coin, RequestTypeNimiq } from '../../constants';
import ErrorState, { ErrorType } from '../../error-state';
import { getKeyIdForBip32Path } from '../../bip32-utils';

type Transport = import('@ledgerhq/hw-transport').default;

export default class RequestDeriveAddressesNimiq extends RequestNimiq<Array<{ address: string, keyPath: string }>> {
    public readonly pathsToDerive: Iterable<string>;

    constructor(pathsToDerive: Iterable<string>, walletId?: string) {
        super(RequestTypeNimiq.DERIVE_ADDRESSES, walletId);
        this.pathsToDerive = pathsToDerive;

        for (const keyPath of pathsToDerive) {
            try {
                getKeyIdForBip32Path(Coin.NIMIQ, keyPath);
            } catch (e) {
                throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, `Invalid keyPath ${keyPath}`, this);
            }
        }
    }

    public async call(transport: Transport): Promise<Array<{ address: string, keyPath: string }>> {
        const api = RequestNimiq._getLowLevelApi(transport);
        const addressRecords = [];
        for (const keyPath of this.pathsToDerive) {
            if (this.cancelled) return addressRecords;
            // eslint-disable-next-line no-await-in-loop
            const { address } = await api.getAddress(
                keyPath,
                true, // validate
                false, // display
            );
            addressRecords.push({ address, keyPath });
        }
        return addressRecords;
    }
}
