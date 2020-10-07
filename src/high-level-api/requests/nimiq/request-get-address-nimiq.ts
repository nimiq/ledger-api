import RequestNimiq from './request-nimiq';
import { RequestParamsCommon } from '../request';
import { RequestTypeNimiq } from '../../constants';
import ErrorState, { ErrorType } from '../../error-state';

type Transport = import('@ledgerhq/hw-transport').default;

export interface RequestParamsGetAddressNimiq extends RequestParamsCommon {
    keyPath: string;
    display?: boolean;
    expectedAddress?: string;
}

export default class RequestGetAddressNimiq extends RequestNimiq<RequestParamsGetAddressNimiq, string> {
    constructor(params: RequestParamsGetAddressNimiq) {
        super(RequestTypeNimiq.GET_ADDRESS, params);
    }

    public async call(transport: Transport): Promise<string> {
        const api = RequestNimiq._getLowLevelApi(transport);
        const { address } = await api.getAddress(
            this.params.keyPath,
            true, // validate
            !!this.params.display, // display
        );

        if (this.params.expectedAddress
            && this.params.expectedAddress.replace(/ /g, '').toUpperCase()
            !== address.replace(/ /g, '').toUpperCase()) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, 'Address mismatch', this);
        }

        return address;
    }
}
