import { O as Observable, ErrorState, ErrorType, R as REQUEST_EVENT_CANCEL } from './ledger-api.es.js';

// Also see https://github.com/LedgerHQ/ledgerjs/issues/365 for other requests which might be interesting.
async function getAppAndVersion(transport, scrambleKey) {
    // Taken from @ledgerhq/hw-app-btc/getAppAndVersion.js. We don't import it directly from there to avoid loading its
    // unnecessary dependencies. Also we left out reading the flags we don't need and decorate the api method manually.
    // Note that this request is common to all apps and the dashboard and is no Bitcoin app specific request (it's not
    // on https://github.com/LedgerHQ/app-bitcoin/blob/master/doc/btc.asc and mind the different cla). However, for u2f
    // and WebAuthn the used scramble key must match the one of the connected app for the Ledger to answer the request.
    const getAppAndVersionApi = {
        async getAppAndVersion() {
            const response = await transport.send(0xb0, 0x01, 0x00, 0x00);
            let offset = 0;
            const format = response[offset++];
            if (format !== 1)
                throw new Error('Unsupported format');
            const nameLength = response[offset++];
            const name = response.slice(offset, (offset += nameLength)).toString('ascii');
            const versionLength = response[offset++];
            const version = response.slice(offset, (offset += versionLength)).toString('ascii');
            return { name, version };
        },
    };
    // Takes care of setting the api lock (for ledger busy errors) and scramble key.
    transport.decorateAppAPIMethods(getAppAndVersionApi, ['getAppAndVersion'], scrambleKey);
    return getAppAndVersionApi.getAppAndVersion();
}

let Request = /** @class */ (() => {
    class Request extends Observable {
        constructor(expectedWalletId) {
            super();
            this._cancelled = false;
            this.expectedWalletId = expectedWalletId;
        }
        static _isAppVersionSupported(versionString, minRequiredVersion) {
            const version = versionString.split('.').map((part) => parseInt(part, 10));
            const parsedMinRequiredVersion = minRequiredVersion.split('.').map((part) => parseInt(part, 10));
            for (let i = 0; i < minRequiredVersion.length; ++i) {
                if (typeof version[i] === 'undefined' || version[i] < parsedMinRequiredVersion[i])
                    return false;
                if (version[i] > parsedMinRequiredVersion[i])
                    return true;
            }
            return true;
        }
        get cancelled() {
            return this._cancelled;
        }
        canReuseCoinAppConnection(coinAppConnection) {
            return coinAppConnection.coin === this.coin
                && coinAppConnection.app === this.requiredApp
                && Request._isAppVersionSupported(coinAppConnection.appVersion, this.minRequiredAppVersion)
                && (!this.expectedWalletId || coinAppConnection.walletId === this.expectedWalletId);
        }
        cancel() {
            if (this._cancelled)
                return;
            this._cancelled = true;
            this.fire(Request.EVENT_CANCEL);
        }
        on(type, callback) {
            if (type === Request.EVENT_CANCEL && this._cancelled) {
                // trigger callback directly
                callback();
            }
            super.on(type, callback);
        }
        async checkCoinAppConnection(transport, scrambleKey) {
            const { name: app, version: appVersion } = await getAppAndVersion(transport, scrambleKey);
            if (app !== this.requiredApp) {
                throw new ErrorState(ErrorType.WRONG_APP, `Wrong app connected: ${app}, required: ${this.requiredApp}`, this);
            }
            if (!Request._isAppVersionSupported(appVersion, this.minRequiredAppVersion)) {
                throw new ErrorState(ErrorType.APP_OUTDATED, `Ledger ${app} app is outdated: ${appVersion}, required: ${this.minRequiredAppVersion}`, this);
            }
            return { coin: this.coin, app, appVersion };
        }
        get _isWalletIdDerivationRequired() {
            return !!this.expectedWalletId;
        }
        _checkExpectedWalletId(walletId) {
            if (this.expectedWalletId === undefined || this.expectedWalletId === walletId)
                return;
            throw new ErrorState(ErrorType.WRONG_WALLET, 'Wrong wallet or Ledger connected', this);
        }
    }
    Request.EVENT_CANCEL = REQUEST_EVENT_CANCEL;
    return Request;
})();

export { Request as R };
//# sourceMappingURL=lazy-chunk-request.es.js.map
