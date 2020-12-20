import RequestWithKeyPathNimiq from './request-with-key-path-nimiq';
import { RequestTypeNimiq } from '../../constants';
declare type Transport = import('@ledgerhq/hw-transport').default;
declare type Address = import('@nimiq/core-web').Address;
declare type AccountType = import('@nimiq/core-web').Account.Type;
declare type Transaction = import('@nimiq/core-web').Transaction;
export interface TransactionInfoNimiq {
    sender: Address;
    senderType?: AccountType;
    recipient: Address;
    recipientType?: AccountType;
    value: number;
    fee?: number;
    validityStartHeight: number;
    network?: 'main' | 'test' | 'dev';
    flags?: number;
    extraData?: Uint8Array;
}
export default class RequestSignTransactionNimiq extends RequestWithKeyPathNimiq<Transaction> {
    readonly type: RequestTypeNimiq.SIGN_TRANSACTION;
    readonly transaction: TransactionInfoNimiq;
    constructor(keyPath: string, transaction: TransactionInfoNimiq, expectedWalletId?: string);
    call(transport: Transport): Promise<Transaction>;
}
export {};
