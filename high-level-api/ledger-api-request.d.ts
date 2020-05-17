import Observable, { EventListener } from '../lib/observable';
declare type LowLevelApi = import('../low-level-api/low-level-api').default;
declare type TransactionInfo = import('./ledger-api').TransactionInfo;
export declare enum RequestType {
    GET_WALLET_ID = "get-wallet-id",
    DERIVE_ADDRESSES = "derive-addresses",
    GET_PUBLIC_KEY = "get-public-key",
    GET_ADDRESS = "get-address",
    CONFIRM_ADDRESS = "confirm-address",
    SIGN_TRANSACTION = "sign-transaction"
}
export interface RequestParams {
    walletId?: string;
    keyPath?: string;
    pathsToDerive?: Iterable<string>;
    addressToConfirm?: string;
    transaction?: TransactionInfo;
}
export default class LedgerApiRequest<T> extends Observable {
    static readonly EVENT_CANCEL = "cancel";
    readonly type: RequestType;
    readonly params: RequestParams;
    private readonly _call;
    private _cancelled;
    constructor(type: RequestType, call: (api: LowLevelApi, params: RequestParams) => Promise<T>, params: RequestParams);
    get cancelled(): boolean;
    call(api: LowLevelApi): Promise<T>;
    cancel(): void;
    on(type: string, callback: EventListener): void;
}
export {};
