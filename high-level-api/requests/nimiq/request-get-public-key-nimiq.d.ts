import RequestWithKeyPathNimiq from './request-with-key-path-nimiq';
import { RequestTypeNimiq } from '../../constants';
declare type Transport = import('@ledgerhq/hw-transport').default;
declare type PublicKey = import('@nimiq/core-web').PublicKey;
export default class RequestGetPublicKeyNimiq extends RequestWithKeyPathNimiq<PublicKey> {
    readonly type: RequestTypeNimiq.GET_PUBLIC_KEY;
    constructor(keyPath: string, expectedWalletId?: string);
    call(transport: Transport): Promise<PublicKey>;
}
export {};
