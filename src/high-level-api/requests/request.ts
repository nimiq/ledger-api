import { Coin, RequestTypeNimiq, RequestTypeBitcoin, REQUEST_EVENT_CANCEL } from '../constants';
import { isAppSupported, isAppVersionSupported, isLegacyApp } from '../app-utils';
import getAppNameAndVersion from '../../low-level-api/get-app-name-and-version';
import ErrorState, { ErrorType } from '../error-state';
import Observable, { EventListener } from '../../shared/observable';

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

    protected _coinAppConnection: CoinAppConnection | null = null;
    private _cancelled: boolean = false;

    protected constructor(expectedWalletId?: string) {
        super();
        this.expectedWalletId = expectedWalletId;

        // Preload dependencies of this class and child classes, once child class constructors have run. Ignore errors.
        setTimeout(() => this._loadDependencies().catch(() => {}));
    }

    public get cancelled(): boolean {
        return this._cancelled;
    }

    public get allowLegacyApp(): boolean {
        return isLegacyApp(this.requiredApp);
    }

    public abstract call(transport: Transport): Promise<T>;

    public canReuseCoinAppConnection(coinAppConnection: CoinAppConnection): boolean {
        this._coinAppConnection = coinAppConnection;
        return coinAppConnection.coin === this.coin
            // Do not allow name 'app' for speculos here, as we wouldn't be able then to detect a speculos app switch.
            && isAppSupported(coinAppConnection.app, this.requiredApp, this.allowLegacyApp, false)
            && isAppVersionSupported(coinAppConnection.appVersion, this.minRequiredAppVersion)
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
        const { name: app, version: appVersion } = await getAppNameAndVersion(transport, scrambleKey);
        this._coinAppConnection = { coin: this.coin, app, appVersion };
        if (!isAppSupported(app, this.requiredApp, this.allowLegacyApp, /* allowSpeculos */ true)) {
            throw new ErrorState(
                ErrorType.WRONG_APP,
                `Wrong app connected: ${app}, required: ${this.requiredApp}`,
                this,
            );
        }
        if (!isAppVersionSupported(appVersion, this.minRequiredAppVersion)) {
            throw new ErrorState(
                ErrorType.APP_OUTDATED,
                `Ledger ${app} app is outdated: ${appVersion}, required: ${this.minRequiredAppVersion}`,
                this,
            );
        }

        // Child classes overwriting checkCoinAppConnection have to apply changes to the same object returned here or
        // overwrite _coinAppConnection to apply the changes to _coinAppConnection, too.
        return this._coinAppConnection;
    }

    protected get _isWalletIdDerivationRequired() {
        return !!this.expectedWalletId;
    }

    protected _checkExpectedWalletId(walletId: string): void {
        if (this.expectedWalletId === undefined || this.expectedWalletId === walletId) return;
        throw new ErrorState(ErrorType.WRONG_WALLET, 'Wrong wallet or Ledger connected', this);
    }

    protected async _loadDependencies(): Promise<Record<never, never>> {
        return {};
    }

    protected async _loadDependency<I>(importPromise: Promise<I>): Promise<I> {
        try {
            return await importPromise;
        } catch (e) {
            throw new ErrorState(
                ErrorType.LOADING_DEPENDENCIES_FAILED,
                `Failed loading dependencies: ${e instanceof Error ? e.message : e}`,
                this,
            );
        }
    }
}
