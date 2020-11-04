type StateTypeError = import('./ledger-api').StateType.ERROR;

type RequestBase = import('./requests/request').default<any>;
type SpecificRequest = import('./ledger-api').Request;

export enum ErrorType {
    LEDGER_BUSY = 'ledger-busy',
    LOADING_DEPENDENCIES_FAILED = 'loading-dependencies-failed',
    USER_INTERACTION_REQUIRED = 'user-interaction-required',
    CONNECTION_ABORTED = 'connection-aborted',
    BROWSER_UNSUPPORTED = 'browser-unsupported',
    APP_OUTDATED = 'app-outdated',
    WRONG_WALLET = 'wrong-wallet',
    WRONG_APP = 'wrong-app',
    REQUEST_ASSERTION_FAILED = 'request-specific-error',
}

export default class ErrorState<T extends ErrorType = ErrorType> extends Error {
    public readonly type: StateTypeError = 'error' as StateTypeError; // state type
    public readonly errorType: T;
    // request specified as SpecificRequest instead of RequestBase such that an app using the api knows what request
    // types to expect here.
    public request: T extends ErrorType.LOADING_DEPENDENCIES_FAILED ? SpecificRequest | undefined : SpecificRequest;

    constructor(
        errorType: T,
        messageOrError: string | Error,
        // request specified as RequestBase here to allow simple throwing from a SpecificRequest parent class.
        request: T extends ErrorType.LOADING_DEPENDENCIES_FAILED ? RequestBase | undefined : RequestBase,
    ) {
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
        this.request = request as any;
    }
}
