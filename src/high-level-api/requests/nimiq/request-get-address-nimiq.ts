import RequestWithKeyPathNimiq from './request-with-key-path-nimiq';
import { RequestTypeNimiq } from '../../constants';
import ErrorState, { ErrorType } from '../../error-state';
import { NimiqVersion } from '../../../shared/constants';

type Transport = import('@ledgerhq/hw-transport').default;

export default class RequestGetAddressNimiq extends RequestWithKeyPathNimiq<NimiqVersion, string> {
    public readonly type: RequestTypeNimiq.GET_ADDRESS;
    public readonly display?: boolean;
    public readonly expectedAddress?: string;

    constructor(
        nimiqVersion: NimiqVersion,
        keyPath: string,
        display?: boolean,
        expectedAddress?: string,
        expectedWalletId?: string,
    ) {
        const type = RequestTypeNimiq.GET_ADDRESS;
        super(nimiqVersion, keyPath, expectedWalletId, { type, display, expectedAddress });
        this.type = type;
        this.display = display;
        this.expectedAddress = expectedAddress;
    }

    public async call(transport: Transport): Promise<string> {
        const api = await this._getLowLevelApi(transport); // throws LOADING_DEPENDENCIES_FAILED on failure
        const { address } = await api.getAddress(
            this.keyPath,
            true, // validate
            !!this.display, // display
            this.nimiqVersion,
        );

        if (this.expectedAddress
            && this.expectedAddress.replace(/ /g, '').toUpperCase()
            !== address.replace(/ /g, '').toUpperCase()) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, 'Address mismatch', this);
        }

        return address;
    }
}
