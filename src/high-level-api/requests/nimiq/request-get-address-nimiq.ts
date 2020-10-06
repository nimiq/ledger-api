import RequestNimiq from './request-nimiq';
import { RequestParamsCommon } from '../request';
import { RequestTypeNimiq } from '../../constants';

type Transport = import('@ledgerhq/hw-transport').default;

export interface RequestParamsGetAddressNimiq extends RequestParamsCommon {
    keyPath: string;
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
            false, // display
        );
        return address;
    }
}
