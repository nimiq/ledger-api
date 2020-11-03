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

    // Abstract properties here are constants specific for a request type or coin. They are not passed as constructor
    // parameters but set by child class as properties to be usable as typescript type guards for inferring a request's
    // type. Enables accessing request specific properties after a type guard, for example accessing expectedAddress in
    // `if (request.type === RequestTypeNimiq.GET_ADDRESS) console.log(request.expectedAddress);`
    public abstract readonly coin: Coin;
    public abstract readonly type: RequestType;
    public abstract readonly requiredApp: string;
    public abstract readonly minRequiredAppVersion: string;
    public readonly expectedWalletId?: string;

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

    protected constructor(expectedWalletId?: string) {
        super();
        this.expectedWalletId = expectedWalletId;
    }

    public get cancelled(): boolean {
        return this._cancelled;
    }

    public abstract async call(transport: Transport): Promise<T>;

    public canReuseCoinAppConnection(coinAppConnection: CoinAppConnection): boolean {
        return coinAppConnection.coin === this.coin
            && coinAppConnection.app === this.requiredApp
            && Request._isAppVersionSupported(coinAppConnection.appVersion, this.minRequiredAppVersion)
            && (!this.expectedWalletId || coinAppConnection.walletId === this.expectedWalletId);
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
        return !!this.expectedWalletId;
    }

    protected _checkExpectedWalletId(walletId: string): void {
        if (this.expectedWalletId === undefined || this.expectedWalletId === walletId) return;
        throw new ErrorState(ErrorType.WRONG_WALLET, 'Wrong wallet or Ledger connected', this);
    }
}
