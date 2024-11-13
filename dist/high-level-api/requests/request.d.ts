import { Coin, RequestTypeNimiq, RequestTypeBitcoin } from '../constants';
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
    static readonly EVENT_CANCEL = "cancel";
    abstract readonly coin: Coin;
    abstract readonly type: RequestType;
    abstract readonly requiredApp: string;
    abstract readonly minRequiredAppVersion: string;
    readonly expectedWalletId?: string;
    protected _coinAppConnection: CoinAppConnection | null;
    private _cancelled;
    protected constructor(expectedWalletId?: string);
    get cancelled(): boolean;
    get allowLegacyApp(): boolean;
    abstract call(transport: Transport): Promise<T>;
    canReuseCoinAppConnection(coinAppConnection: CoinAppConnection): boolean;
    cancel(): void;
    on(type: string, callback: EventListener): void;
    protected checkCoinAppConnection(transport: Transport, scrambleKey: string): Promise<CoinAppConnection>;
    protected get _isWalletIdDerivationRequired(): boolean;
    protected _checkExpectedWalletId(walletId: string): void;
}
export {};
