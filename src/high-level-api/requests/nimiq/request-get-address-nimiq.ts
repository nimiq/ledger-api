import RequestNimiq from './request-nimiq';
import RequestWithKeyPathNimiq from './request-with-key-path-nimiq';
import { RequestTypeNimiq } from '../../constants';
import ErrorState, { ErrorType } from '../../error-state';

type Transport = import('@ledgerhq/hw-transport').default;

export default class RequestGetAddressNimiq extends RequestWithKeyPathNimiq<string> {
    public readonly display?: boolean;
    public readonly expectedAddress?: string;

    constructor(keyPath: string, display?: boolean, expectedAddress?: string, walletId?: string) {
        super(RequestTypeNimiq.GET_ADDRESS, keyPath, walletId);
        this.display = display;
        this.expectedAddress = expectedAddress;
    }

    public async call(transport: Transport): Promise<string> {
        const api = RequestNimiq._getLowLevelApi(transport);
        const { address } = await api.getAddress(
            this.keyPath,
            true, // validate
            !!this.display, // display
        );

        if (this.expectedAddress
            && this.expectedAddress.replace(/ /g, '').toUpperCase()
            !== address.replace(/ /g, '').toUpperCase()) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, 'Address mismatch', this);
        }

        return address;
    }
}
