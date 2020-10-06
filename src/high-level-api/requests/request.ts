import { Coin, RequestTypeNimiq, REQUEST_EVENT_CANCEL } from '../constants';
import Observable, { EventListener } from '../../lib/observable';
import ErrorState, { ErrorType } from '../error-state';
import { getKeyIdForBip32Path } from '../bip32-utils';

type Transport = import('@ledgerhq/hw-transport').default;

export interface RequestParamsCommon {
    walletId?: string;
}

export interface CoinAppConnection {
    coin: Coin;
    walletId: string;
}

export default abstract class Request<P extends RequestParamsCommon, R> extends Observable {
    public static readonly EVENT_CANCEL = REQUEST_EVENT_CANCEL;

    public readonly coin: Coin;
    public readonly type: RequestTypeNimiq;
    public readonly params: P;

    protected readonly abstract _minRequiredAppVersion: number[];
    private _cancelled: boolean = false;

    constructor(coin: Coin, type: RequestTypeNimiq, params: P) {
        super();
        this.coin = coin;
        this.type = type;
        this.params = params;

        const { keyPath } = params as any;
        if (!keyPath) return;
        try {
            getKeyIdForBip32Path(coin, keyPath);
        } catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, `Invalid keyPath ${keyPath}`, this);
        }
    }

    public get cancelled(): boolean {
        return this._cancelled;
    }

    public abstract async checkCoinAppConnection(transport: Transport): Promise<CoinAppConnection>;
    public abstract async call(transport: Transport): Promise<R>;

    public cancel(): void {
        if (this._cancelled) return;
        this._cancelled = true;
        this.fire(Request.EVENT_CANCEL);
    }

    public on(type: string, callback: EventListener): void {
        if (type === Request.EVENT_CANCEL && this._cancelled) {
            // trigger callback directly
            callback();
        }
        super.on(type, callback);
    }

    protected _isAppVersionSupported(versionString: string): boolean {
        const version = versionString.split('.').map((part) => parseInt(part, 10));
        for (let i = 0; i < this._minRequiredAppVersion.length; ++i) {
            if (typeof version[i] === 'undefined' || version[i] < this._minRequiredAppVersion[i]) return false;
            if (version[i] > this._minRequiredAppVersion[i]) return true;
        }
        return true;
    }

    protected _checkExpectedWalletId(walletId: string) {
        if (this.params.walletId === undefined || this.params.walletId === walletId) return;
        throw new ErrorState(ErrorType.WRONG_LEDGER, 'Wrong Ledger connected');
    }
}
