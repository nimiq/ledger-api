import Observable, { EventListener } from '../lib/observable';

type LowLevelApi = import('../low-level-api/low-level-api').default;
type TransactionInfo = import('./ledger-api').TransactionInfo;

export enum RequestType {
    GET_WALLET_ID = 'get-wallet-id',
    DERIVE_ADDRESSES = 'derive-addresses',
    GET_PUBLIC_KEY = 'get-public-key',
    GET_ADDRESS = 'get-address',
    CONFIRM_ADDRESS = 'confirm-address',
    SIGN_TRANSACTION = 'sign-transaction',
}

export interface RequestParams {
    walletId?: string; // optional for all calls
    keyPath?: string; // for everything besides DERIVE_ADDRESSES
    pathsToDerive?: Iterable<string>; // for DERIVE_ADDRESSES
    addressToConfirm?: string; // for CONFIRM_TRANSACTION
    transaction?: TransactionInfo; // for SIGN_TRANSACTION
}

export default class LedgerApiRequest<T> extends Observable {
    public static readonly EVENT_CANCEL = 'cancel';
    public readonly type: RequestType;
    public readonly params: RequestParams;
    private readonly _call: (api: LowLevelApi, params: RequestParams) => Promise<T>;
    private _cancelled: boolean = false;

    constructor(
        type: RequestType,
        call: (api: LowLevelApi, params: RequestParams) => Promise<T>,
        params: RequestParams,
    ) {
        super();
        this.type = type;
        this._call = call;
        this.params = params;
    }

    public get cancelled(): boolean {
        return this._cancelled;
    }

    public async call(api: LowLevelApi): Promise<T> {
        return this._call.call(this, api, this.params);
    }

    public cancel(): void {
        if (this._cancelled) return;
        this._cancelled = true;
        this.fire(LedgerApiRequest.EVENT_CANCEL);
    }

    public on(type: string, callback: EventListener): void {
        if (type === LedgerApiRequest.EVENT_CANCEL && this._cancelled) {
            // trigger callback directly
            callback();
        }
        return super.on(type, callback);
    }
}
