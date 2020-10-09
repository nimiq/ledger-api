type StateTypeError = import('./ledger-api').StateType.ERROR;

type Request<T> = import('./requests/request').default<T>;

export enum ErrorType {
    LEDGER_BUSY = 'ledger-busy',
    LOADING_DEPENDENCIES_FAILED = 'loading-dependencies-failed',
    USER_INTERACTION_REQUIRED = 'user-interaction-required',
    CONNECTION_ABORTED = 'connection-aborted',
    BROWSER_UNSUPPORTED = 'browser-unsupported',
    APP_OUTDATED = 'app-outdated',
    WRONG_LEDGER = 'wrong-ledger',
    REQUEST_ASSERTION_FAILED = 'request-specific-error',
}

export default class ErrorState extends Error {
    public readonly type: StateTypeError = 'error' as StateTypeError; // state type
    public readonly errorType: ErrorType;
    public request?: Request<any>;

    constructor(errorType: ErrorType, messageOrError: string | Error, request?: Request<any>) {
        super(messageOrError.toString());

        if (messageOrError instanceof Error && messageOrError.stack) {
            this.stack = messageOrError.stack;
        } else if (Error.captureStackTrace) {
            // Maintains proper stack trace for where our error was thrown (only available on V8), see
            // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error#Custom_Error_Types
            Error.captureStackTrace(this, ErrorState);
        }

        this.name = 'LedgerErrorState';
        this.errorType = errorType;
        this.request = request;
    }
}
