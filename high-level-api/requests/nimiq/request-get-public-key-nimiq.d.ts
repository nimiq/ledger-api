import RequestWithKeyPathNimiq from './request-with-key-path-nimiq';
import { RequestTypeNimiq } from '../../constants';
import { NimiqVersion } from '../../../lib/constants';
import type { NimiqPrimitive } from '../../../lib/load-nimiq';
type Transport = import('@ledgerhq/hw-transport').default;
export default class RequestGetPublicKeyNimiq<Version extends NimiqVersion> extends RequestWithKeyPathNimiq<Version, NimiqPrimitive<'PublicKey', Version>> {
    readonly type: RequestTypeNimiq.GET_PUBLIC_KEY;
    constructor(nimiqVersion: Version, keyPath: string, expectedWalletId?: string);
    call(transport: Transport): Promise<NimiqPrimitive<'PublicKey', Version>>;
}
export {};
