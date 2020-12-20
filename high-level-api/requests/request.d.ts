import { Coin, RequestTypeNimiq, RequestTypeBitcoin } from '../constants';
import Observable, { EventListener } from '../../lib/observable';
declare type Transport = import('@ledgerhq/hw-transport').default;
declare type RequestType = RequestTypeNimiq | RequestTypeBitcoin;
export interface CoinAppConnection {
    coin: Coin;
    app: string;
    appVersion: string;
    walletId?: string;
}
export default abstract class Request<T> extends Observable {
    static readonly EVENT_CANCEL = "cancel";
    abstract readonly coin: Coin;
    abstract readonly type: RequestType;
    abstract readonly requiredApp: string;
    abstract readonly minRequiredAppVersion: string;
    readonly expectedWalletId?: string;
    private _cancelled;
    protected static _isAppVersionSupported(versionString: string, minRequiredVersion: string): boolean;
    protected constructor(expectedWalletId?: string);
    get cancelled(): boolean;
    abstract call(transport: Transport): Promise<T>;
    canReuseCoinAppConnection(coinAppConnection: CoinAppConnection): boolean;
    cancel(): void;
    on(type: string, callback: EventListener): void;
    protected checkCoinAppConnection(transport: Transport, scrambleKey: string): Promise<CoinAppConnection>;
    protected get _isWalletIdDerivationRequired(): boolean;
    protected _checkExpectedWalletId(walletId: string): void;
}
export {};
