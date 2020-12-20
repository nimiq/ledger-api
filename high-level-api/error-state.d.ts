declare type StateTypeError = import('./ledger-api').StateType.ERROR;
declare type RequestBase = import('./requests/request').default<any>;
declare type SpecificRequest = import('./ledger-api').Request;
export declare enum ErrorType {
    LEDGER_BUSY = "ledger-busy",
    LOADING_DEPENDENCIES_FAILED = "loading-dependencies-failed",
    USER_INTERACTION_REQUIRED = "user-interaction-required",
    CONNECTION_ABORTED = "connection-aborted",
    BROWSER_UNSUPPORTED = "browser-unsupported",
    APP_OUTDATED = "app-outdated",
    WRONG_WALLET = "wrong-wallet",
    WRONG_APP = "wrong-app",
    REQUEST_ASSERTION_FAILED = "request-specific-error"
}
export default class ErrorState<T extends ErrorType = ErrorType> extends Error {
    readonly type: StateTypeError;
    readonly errorType: T;
    request: T extends ErrorType.LOADING_DEPENDENCIES_FAILED ? SpecificRequest | undefined : SpecificRequest;
    constructor(errorType: T, messageOrError: string | Error, request: T extends ErrorType.LOADING_DEPENDENCIES_FAILED ? RequestBase | undefined : RequestBase);
}
export {};
