import { Coin, getBip32Path, ErrorState, ErrorType } from './ledger-api.es.js';
import { R as Request } from './lazy-chunk-request.es.js';

// Use jsdelivr instead of nimiq cdn to avoid getting blocked by ad blockers.
const coreBasePath = 'https://cdn.jsdelivr.net/npm/@nimiq/core-web/';
let nimiqCorePromise = null;
let nimiqCryptographyPromise = null;
/**
 * Lazy-load the Nimiq core api from the cdn server if it's not loaded yet.
 */
async function loadNimiqCore(coreVariant = 'web-offline') {
    // @ts-ignore Return global Nimiq if already loaded.
    if (window.Nimiq)
        return window.Nimiq;
    nimiqCorePromise = nimiqCorePromise || new Promise((resolve, reject) => {
        const $head = document.getElementsByTagName('head')[0];
        const $script = document.createElement('script');
        $script.type = 'text/javascript';
        $script.onload = () => {
            $script.parentNode.removeChild($script);
            resolve();
        };
        $script.onerror = (e) => {
            $script.parentNode.removeChild($script);
            reject(e);
        };
        $script.src = `${coreBasePath}${coreVariant}.js`;
        $head.appendChild($script);
    }).then(() => {
        // @ts-ignore Nimiq is global but to discourage usage as global var we did not declare a global type.
        const { Nimiq } = window;
        return Nimiq;
    }, (e) => {
        nimiqCorePromise = null;
        return Promise.reject(e);
    });
    return nimiqCorePromise;
}
/**
 * Load the WebAssembly and module for cryptographic functions. You will have to do this before calculating hashes,
 * deriving keys or addresses, signing transactions or messages, etc.
 */
async function loadNimiqCryptography() {
    nimiqCryptographyPromise = nimiqCryptographyPromise || (async () => {
        try {
            // preload wasm in parallel
            preloadAsset(`${coreBasePath}worker-wasm.wasm`, 'fetch', true);
            preloadAsset(`${coreBasePath}worker-wasm.js`, 'script');
            const Nimiq = await loadNimiqCore();
            await Nimiq.WasmHelper.doImport();
        }
        catch (e) {
            nimiqCryptographyPromise = null;
            throw e;
        }
    })();
    return nimiqCryptographyPromise;
}
function preloadAsset(asset, as, crossOrigin) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = as;
    link.href = asset;
    link.onload = link.onerror = () => document.head.removeChild(link); // eslint-disable-line no-multi-assign
    if (crossOrigin)
        link.crossOrigin = '';
    document.head.appendChild(link);
}
//# sourceMappingURL=load-nimiq.js.map

let RequestNimiq = /** @class */ (() => {
    class RequestNimiq extends Request {
        constructor(expectedWalletId) {
            super(expectedWalletId);
            this.coin = Coin.NIMIQ;
            this.requiredApp = 'Nimiq';
            this.minRequiredAppVersion = '1.4.2'; // first version supporting web usb
            // Preload dependencies. Nimiq lib is preloaded individually by request child classes that need it.
            // Ignore errors.
            Promise.all([
                this._loadLowLevelApi(),
                this._isWalletIdDerivationRequired ? this._loadNimiq() : null,
            ]).catch(() => { });
        }
        async checkCoinAppConnection(transport) {
            const coinAppConnection = await super.checkCoinAppConnection(transport, 'w0w');
            if (!this._isWalletIdDerivationRequired)
                return coinAppConnection; // skip wallet id derivation
            // Note that api and Nimiq are preloaded in the constructor, therefore we don't need to optimize for load order
            // or execution order here.
            const api = await this._getLowLevelApi(transport); // throws LOADING_DEPENDENCIES_FAILED on failure
            // Set validate to false as otherwise the call is much slower. For U2F this can also unfreeze the ledger app,
            // see transport-comparison.md. However, not sure whether this is still true today and as it's less relevant now
            // with WebUsb being used by default, we ignore this side effect for !this._isWalletIdDerivationRequired case.
            const { publicKey: firstAddressPubKeyBytes } = await api.getPublicKey(getBip32Path({ coin: Coin.NIMIQ, addressIndex: 0 }), false, // validate
            false);
            const Nimiq = await this._loadNimiq(); // throws LOADING_DEPENDENCIES_FAILED on failure
            // Compute wallet id. Use sha256 as blake2b yields the nimiq address
            const walletId = Nimiq.Hash.sha256(firstAddressPubKeyBytes).toBase64();
            this._checkExpectedWalletId(walletId);
            coinAppConnection.walletId = walletId;
            return coinAppConnection;
        }
        async _getLowLevelApi(transport) {
            if (!RequestNimiq._lowLevelApiPromise || transport !== (await RequestNimiq._lowLevelApiPromise).transport) {
                // no low level api instantiated yet or transport / transport type changed in the meantime
                RequestNimiq._lowLevelApiPromise = this._loadLowLevelApi()
                    .then((LowLevelApi) => new LowLevelApi(transport), (e) => {
                    RequestNimiq._lowLevelApiPromise = null;
                    return Promise.reject(e);
                });
            }
            return RequestNimiq._lowLevelApiPromise;
        }
        async _loadLowLevelApi() {
            try {
                // build the low-level-api from source instead of taking it from dist to create optimized chunks and to
                // avoid double bundling of dependencies like buffer.
                return (await [import('./ledger-api.es.js'), import('./lazy-chunk-buffer-es6.es.js'), import('./lazy-chunk-request.es.js'), import('./lazy-chunk-low-level-api.es.js')][3]).default;
            }
            catch (e) {
                throw new ErrorState(ErrorType.LOADING_DEPENDENCIES_FAILED, `Failed loading dependencies: ${e.message || e}`, this);
            }
        }
        async _loadNimiq() {
            try {
                // Note that we don't need to cache a promise as loadNimiqCore and loadNimiqCryptography already do that.
                const [Nimiq] = await Promise.all([
                    loadNimiqCore(),
                    // needed for wallet id hashing and pub key to address derivation in SignatureProof and BasicTransaction
                    loadNimiqCryptography(),
                ]);
                return Nimiq;
            }
            catch (e) {
                throw new ErrorState(ErrorType.LOADING_DEPENDENCIES_FAILED, `Failed loading dependencies: ${e.message || e}`, this);
            }
        }
    }
    RequestNimiq._lowLevelApiPromise = null;
    return RequestNimiq;
})();

export { RequestNimiq as R, loadNimiqCryptography as a, loadNimiqCore as l };
//# sourceMappingURL=lazy-chunk-request-nimiq.es.js.map
