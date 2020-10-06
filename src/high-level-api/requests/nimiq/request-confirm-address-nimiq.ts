import RequestNimiq from './request-nimiq';
import { RequestParamsCommon } from '../request';
import { RequestTypeNimiq } from '../../constants';
import ErrorState, { ErrorType } from '../../error-state';

type Transport = import('@ledgerhq/hw-transport').default;

export interface RequestParamsConfirmAddressNimiq extends RequestParamsCommon {
    keyPath: string;
    addressToConfirm: string;
}

export default class RequestConfirmAddressNimiq extends RequestNimiq<RequestParamsConfirmAddressNimiq, string> {
    constructor(params: RequestParamsConfirmAddressNimiq) {
        super(RequestTypeNimiq.CONFIRM_ADDRESS, params);
    }

    public async call(transport: Transport): Promise<string> {
        const api = RequestNimiq._getLowLevelApi(transport);
        const { address: confirmedAddress } = await api.getAddress(
            this.params.keyPath,
            true, // validate
            true, // display
        );

        if (this.params.addressToConfirm.replace(/ /g, '').toUpperCase()
            !== confirmedAddress.replace(/ /g, '').toUpperCase()) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, 'Address mismatch', this);
        }

        return confirmedAddress;
    }
}
