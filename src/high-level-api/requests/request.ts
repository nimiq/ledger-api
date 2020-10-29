import { Coin, RequestTypeNimiq, RequestTypeBitcoin, REQUEST_EVENT_CANCEL } from '../constants';
import { getAppAndVersion } from '../ledger-utils';
import ErrorState, { ErrorType } from '../error-state';
import Observable, { EventListener } from '../../lib/observable';

type Transport = import('@ledgerhq/hw-transport').default;
type RequestType = RequestTypeNimiq | RequestTypeBitcoin;

export interface CoinAppConnection {
    coin: Coin;
    app: string;
    appVersion: string;
    walletId?: string;
}

export default abstract class Request<T> extends Observable {
    public static readonly EVENT_CANCEL = REQUEST_EVENT_CANCEL;

    public readonly coin: Coin;
    public readonly type: RequestType;
    public readonly requiredApp: string;
    public readonly minRequiredAppVersion: string;
    public readonly walletId?: string;

    private _cancelled: boolean = false;

    protected static _isAppVersionSupported(versionString: string, minRequiredVersion: string): boolean {
        const version = versionString.split('.').map((part) => parseInt(part, 10));
        const parsedMinRequiredVersion = minRequiredVersion.split('.').map((part) => parseInt(part, 10));
        for (let i = 0; i < minRequiredVersion.length; ++i) {
            if (typeof version[i] === 'undefined' || version[i] < parsedMinRequiredVersion[i]) return false;
            if (version[i] > parsedMinRequiredVersion[i]) return true;
        }
        return true;
    }

    protected constructor(
        coin: Coin,
        type: RequestType,
        requiredApp: string,
        minRequiredAppVersion: string,
        walletId?: string,
    ) {
        super();
        this.coin = coin;
        this.type = type;
        this.requiredApp = requiredApp;
        this.minRequiredAppVersion = minRequiredAppVersion;
        this.walletId = walletId;
    }

    public get cancelled(): boolean {
        return this._cancelled;
    }

    public abstract async call(transport: Transport): Promise<T>;

    public canReuseCoinAppConnection(coinAppConnection: CoinAppConnection): boolean {
        return coinAppConnection.coin === this.coin
            && coinAppConnection.app === this.requiredApp
            && Request._isAppVersionSupported(coinAppConnection.appVersion, this.minRequiredAppVersion)
            && (!this.walletId || coinAppConnection.walletId === this.walletId);
    }

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

    protected async checkCoinAppConnection(transport: Transport, scrambleKey: string): Promise<CoinAppConnection> {
        const { name: app, version: appVersion } = await getAppAndVersion(transport, scrambleKey);
        if (app !== this.requiredApp) {
            throw new ErrorState(
                ErrorType.WRONG_APP,
                `Wrong app connected: ${app}, required: ${this.requiredApp}`,
                this,
            );
        }
        if (!Request._isAppVersionSupported(appVersion, this.minRequiredAppVersion)) {
            throw new ErrorState(
                ErrorType.APP_OUTDATED,
                `Ledger ${app} app is outdated: ${appVersion}, required: ${this.minRequiredAppVersion}`,
                this,
            );
        }

        return { coin: this.coin, app, appVersion };
    }

    protected get _isWalletIdDerivationRequired() {
        return !!this.walletId;
    }

    protected _checkExpectedWalletId(walletId: string): void {
        if (this.walletId === undefined || this.walletId === walletId) return;
        throw new ErrorState(ErrorType.WRONG_LEDGER, 'Wrong Ledger connected', this);
    }
}
