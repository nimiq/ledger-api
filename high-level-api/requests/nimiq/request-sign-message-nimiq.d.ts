import RequestWithKeyPathNimiq from './request-with-key-path-nimiq';
import { RequestTypeNimiq } from '../../constants';
import { NimiqVersion } from '../../../lib/constants';
import { NimiqPrimitive } from '../../../lib/load-nimiq';
type Transport = import('@ledgerhq/hw-transport').default;
export type MessageSignatureInfoNimiq<Version extends NimiqVersion> = {
    signer: NimiqPrimitive<'PublicKey', Version>;
    signature: NimiqPrimitive<'Signature', Version>;
};
export default class RequestSignMessageNimiq<Version extends NimiqVersion> extends RequestWithKeyPathNimiq<Version, MessageSignatureInfoNimiq<Version>> {
    readonly type: RequestTypeNimiq.SIGN_MESSAGE;
    readonly message: string | Uint8Array;
    readonly flags?: number | {
        preferDisplayTypeHex: boolean;
        preferDisplayTypeHash: boolean;
    };
    get minRequiredAppVersion(): string;
    constructor(nimiqVersion: Version, keyPath: string, message: string | Uint8Array, flags?: RequestSignMessageNimiq<Version>['flags'], expectedWalletId?: string);
    call(transport: Transport): Promise<MessageSignatureInfoNimiq<Version>>;
}
export {};
