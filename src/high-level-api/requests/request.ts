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
    public readonly minRequiredAppVersion: number[];

    private _cancelled: boolean = false;

    protected static _isAppVersionSupported(versionString: string, minRequiredVersion: number[]): boolean {
        const version = versionString.split('.').map((part) => parseInt(part, 10));
        for (let i = 0; i < minRequiredVersion.length; ++i) {
            if (typeof version[i] === 'undefined' || version[i] < minRequiredVersion[i]) return false;
            if (version[i] > minRequiredVersion[i]) return true;
        }
        return true;
    }

    protected constructor(coin: Coin, type: RequestTypeNimiq, params: P, minRequiredAppVersion: number[]) {
        super();
        this.coin = coin;
        this.type = type;
        this.params = params;
        this.minRequiredAppVersion = minRequiredAppVersion;

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

    protected _checkExpectedWalletId(walletId: string) {
        if (this.params.walletId === undefined || this.params.walletId === walletId) return;
        throw new ErrorState(ErrorType.WRONG_LEDGER, 'Wrong Ledger connected');
    }
}
