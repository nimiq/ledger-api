import RequestWithKeyPathNimiq from './request-with-key-path-nimiq';
import { RequestTypeNimiq, Network, AccountTypeNimiq } from '../../constants';
import { NimiqVersion } from '../../../lib/constants';
import { type NimiqPrimitive } from '../../../lib/load-nimiq';
type Transport = import('@ledgerhq/hw-transport').default;
export type TransactionInfoNimiq<Version extends NimiqVersion> = {
    sender: NimiqPrimitive<'Address', Version>;
    recipient: NimiqPrimitive<'Address', Version>;
    validityStartHeight: number;
    network?: Network;
    flags?: number;
} & (Version extends NimiqVersion.ALBATROSS ? {
    value: bigint;
    fee?: bigint;
    senderType?: AccountTypeNimiq;
    senderData?: Uint8Array;
    recipientType?: AccountTypeNimiq;
    recipientData?: Uint8Array;
} : {
    value: number;
    fee?: number;
    senderType?: Exclude<AccountTypeNimiq, AccountTypeNimiq.STAKING>;
    recipientType?: Exclude<AccountTypeNimiq, AccountTypeNimiq.STAKING>;
    extraData?: Uint8Array;
});
export default class RequestSignTransactionNimiq<Version extends NimiqVersion> extends RequestWithKeyPathNimiq<Version, NimiqPrimitive<'Transaction', Version>> {
    readonly type: RequestTypeNimiq.SIGN_TRANSACTION;
    readonly transaction: TransactionInfoNimiq<Version>;
    get minRequiredAppVersion(): string;
    constructor(nimiqVersion: Version, keyPath: string, transaction: TransactionInfoNimiq<Version>, expectedWalletId?: string);
    call(transport: Transport): Promise<NimiqPrimitive<'Transaction', Version>>;
}
export {};
