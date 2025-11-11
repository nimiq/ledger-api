import { O as Observable, R as REQUEST_EVENT_CANCEL, a as isLegacyApp, b as isAppSupported, i as isAppVersionSupported, ErrorState, ErrorType } from './ledger-api.es.js';

// Also see developers.ledger.com/docs/transport/open-close-info-on-apps/, github.com/LedgerHQ/ledgerjs/issues/365 and
// github.com/LedgerHQ/ledger-secure-sdk/blob/master/src/os_io_seproxyhal.c for other interesting requests.
async function getAppNameAndVersion(transport, scrambleKey, withApiLock = true) {
    // Taken from @ledgerhq/hw-app-btc/getAppAndVersion.js. We don't import it directly from there to avoid loading its
    // unnecessary dependencies. Note that this request is common to all apps and the dashboard and is no Bitcoin app
    // specific request (it's not on https://github.com/LedgerHQ/app-bitcoin-new/blob/master/doc/bitcoin.md but in the
    // Ledger SDKs, see https://github.com/LedgerHQ/ledger-secure-sdk/blob/master/src/os_io_seproxyhal.c. Also mind the
    // different cla). However, for u2f and WebAuthn the used scramble key must match the one of the connected app for
    // the Ledger to answer the request. Therefore, set the scrambleKey manually to make it compatible with all apps,
    // not only the Nimiq app.
    let getAppNameAndVersionHandler = async () => {
        // Note that no u2f heartbeat is required here as the call is not interactive but answers directly.
        const response = await transport.send(0xb0, 0x01, 0x00, 0x00);
        const status = response.slice(response.length - 2).readUInt16BE(0);
        if (status !== 0x9000)
            throw new Error('getAppNameAndVersion failed'); // should not actually happen
        let offset = 0;
        const format = response[offset++];
        if (format !== 1)
            throw new Error('Unsupported format');
        const nameLength = response[offset++];
        const name = response.slice(offset, (offset += nameLength)).toString('ascii');
        const versionLength = response[offset++];
        const version = response.slice(offset, (offset += versionLength)).toString('ascii');
        return { name, version };
    };
    // Set the scramble key and enable the api lock (for ledger busy errors) if requested. Note that the lock is a
    // property of the transport, not the handler, thus work correctly across multiple independently decorated
    // getAppNameAndVersionHandler and other decorated methods. Also, other decorated methods always overwrite the
    // scramble key to their required key on each invocation, such that setting it here won't affect other api calls.
    if (withApiLock) {
        // Decorating the api method does not modify the transport instance, therefore decorating on each invocation of
        // getAppNameAndVersion does no harm.
        getAppNameAndVersionHandler = transport.decorateAppAPIMethod('getAppNameAndVersionHandler', getAppNameAndVersionHandler, undefined, scrambleKey);
    }
    else {
        // Setting the scramble key manually does no harm, as any decorated api method will overwrite it again.
        transport.setScrambleKey(scrambleKey);
    }
    return getAppNameAndVersionHandler();
}

class Request extends Observable {
    static EVENT_CANCEL = REQUEST_EVENT_CANCEL;
    expectedWalletId;
    _coinAppConnection = null;
    _cancelled = false;
    constructor(expectedWalletId) {
        super();
        this.expectedWalletId = expectedWalletId;
    }
    get cancelled() {
        return this._cancelled;
    }
    get allowLegacyApp() {
        return isLegacyApp(this.requiredApp);
    }
    canReuseCoinAppConnection(coinAppConnection) {
        this._coinAppConnection = coinAppConnection;
        return coinAppConnection.coin === this.coin
            // Do not allow name 'app' for speculos here, as we wouldn't be able then to detect a speculos app switch.
            && isAppSupported(coinAppConnection.app, this.requiredApp, this.allowLegacyApp, false)
            && isAppVersionSupported(coinAppConnection.appVersion, this.minRequiredAppVersion)
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
        const { name: app, version: appVersion } = await getAppNameAndVersion(transport, scrambleKey);
        this._coinAppConnection = { coin: this.coin, app, appVersion };
        if (!isAppSupported(app, this.requiredApp, this.allowLegacyApp, /* allowSpeculos */ true)) {
            throw new ErrorState(ErrorType.WRONG_APP, `Wrong app connected: ${app}, required: ${this.requiredApp}`, this);
        }
        if (!isAppVersionSupported(appVersion, this.minRequiredAppVersion)) {
            throw new ErrorState(ErrorType.APP_OUTDATED, `Ledger ${app} app is outdated: ${appVersion}, required: ${this.minRequiredAppVersion}`, this);
        }
        // Child classes overwriting checkCoinAppConnection have to apply changes to the same object returned here or
        // overwrite _coinAppConnection to apply the changes to _coinAppConnection, too.
        return this._coinAppConnection;
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

export { Request as R, getAppNameAndVersion as g };
//# sourceMappingURL=lazy-chunk-request.es.js.map
