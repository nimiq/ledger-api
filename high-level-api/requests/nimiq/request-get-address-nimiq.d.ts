import RequestWithKeyPathNimiq from './request-with-key-path-nimiq';
import { RequestTypeNimiq } from '../../constants';
declare type Transport = import('@ledgerhq/hw-transport').default;
export default class RequestGetAddressNimiq extends RequestWithKeyPathNimiq<string> {
    readonly type: RequestTypeNimiq.GET_ADDRESS;
    readonly display?: boolean;
    readonly expectedAddress?: string;
    constructor(keyPath: string, display?: boolean, expectedAddress?: string, expectedWalletId?: string);
    call(transport: Transport): Promise<string>;
}
export {};
