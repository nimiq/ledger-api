import RequestNimiq from './request-nimiq';
import { RequestTypeNimiq } from '../../constants';
declare type Transport = import('@ledgerhq/hw-transport').default;
export default class RequestDeriveAddressesNimiq extends RequestNimiq<Array<{
    address: string;
    keyPath: string;
}>> {
    readonly type: RequestTypeNimiq.DERIVE_ADDRESSES;
    readonly pathsToDerive: Iterable<string>;
    constructor(pathsToDerive: Iterable<string>, expectedWalletId?: string);
    call(transport: Transport): Promise<Array<{
        address: string;
        keyPath: string;
    }>>;
}
export {};
