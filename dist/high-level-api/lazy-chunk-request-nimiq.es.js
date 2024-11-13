import { R as Request } from './lazy-chunk-request.es.js';
import { NimiqVersion, Coin, getBip32Path, ErrorState, ErrorType } from './ledger-api.es.js';

function isNimiqLegacy(core) {
    // Note that checking for core.Version.CORE_JS_VERSION would be nicer, but it's unfortunately not available in the
    // web-offline variant.
    return 'GenesisConfig' in core && core.GenesisConfig.CONFIGS.main.NETWORK_ID === 42;
}
function isNimiqLegacyPrimitive(primitive) {
    return !('__destroy_into_raw' in primitive || '__wrap' in primitive.constructor);
}
async function loadNimiq(nimiqVersion, inlcudeNimiqLegacyCryptography, preloadWasm = true) {
    const [Nimiq] = await Promise.all(nimiqVersion === NimiqVersion.ALBATROSS
        ? [loadNimiqAlbatrossCore(preloadWasm)]
        : [
            loadNimiqLegacyCore(),
            ...(inlcudeNimiqLegacyCryptography ? [loadNimiqLegacyCryptography(preloadWasm)] : []),
        ]);
    return Nimiq;
}
const isNimiqAlbatrossHub = typeof loadAlbatross !== 'undefined' && (
// Running on Hub domain.
/^hub\.(?:pos\.)?nimiq(?:-testnet)?\.com$/.test(window.location.hostname)
    // Or running on localhost:8081 or BrowserStack's bs-local.com:8081 which is where Hub dev versions are run.
    || /^(?:localhost|bs-local\.com):8081$/.test(window.location.host));
const nimiqCoreBasePath = isNimiqAlbatrossHub
    // On a Nimiq Hub with Albatross support, use the Hub's copy of the core (copied from @nimiq/albatross-wasm in the
    // Hub's vue.config.js, which is an alias for @nimiq/core@next), same as the Hub itself is doing, to avoid using and
    // loading an additional version.
    ? '/albatross-client/web/'
    // In other cases load @nimiq/core-web@next from jsdelivr. Load from cdn to avoid bundling a copy of core if it's
    // not needed. This way, we also don't need to handle the wasm file in the rollup config.
    : 'https://cdn.jsdelivr.net/npm/@nimiq/core@next/web/';
let nimiqCorePromise = null;
async function loadNimiqAlbatrossCore(preloadWasm = true) {
    nimiqCorePromise = nimiqCorePromise || (async () => {
        try {
            if (preloadWasm) {
                // Preload wasm in parallel. We only need the main wasm, not the Client or worker.
                // No integrity hash here, because main-wasm/index.js loads the wasm without integrity hash.
                preloadAsset(`${nimiqCoreBasePath}main-wasm/index_bg.wasm`, 'fetch', true);
            }
            // Note: we don't import /web/index.js or run the Hub's loadAlbatross because we don't need the Client which
            // depends on and loads the worker, including the worker wasm, and is auto-instantiated in /web/index.js. We
            // only load the main wasm handler and initialize it, which loads the main wasm. Note that these are the
            // exact same files as loaded by the Hub, i.e. there is no double loading happening as files will be already
            // cached. Also, calling init again when the wasm is already initialized, does not unnecessarily initialize
            // or fetch anything again.
            const Nimiq = await import(`${nimiqCoreBasePath}main-wasm/index.js`);
            const { default: init } = Nimiq;
            await init();
            return Nimiq;
        }
        catch (e) {
            nimiqCorePromise = null;
            throw e;
        }
    })();
    return nimiqCorePromise;
}
const nimiqLegacyCoreBasePath = window.location.hostname.endsWith('.nimiq.com')
    // On the nimiq.com domain use cdn.nimiq.com.
    ? 'https://cdn.nimiq.com/'
    // On other domains use jsdelivr instead of nimiq cdn to avoid getting blocked by ad blockers.
    : 'https://cdn.jsdelivr.net/npm/@nimiq/core-web/';
let nimiqLegacyCorePromise = null;
let nimiqLegacyCryptographyPromise = null;
/**
 * Lazy-load the Nimiq core api from the cdn server if it's not loaded yet.
 */
async function loadNimiqLegacyCore(coreVariant = 'web-offline') {
    // Return global Nimiq if already loaded from @nimiq/core-web, for example in Nimiq Hub.
    if (typeof Nimiq !== 'undefined')
        return Nimiq;
    nimiqLegacyCorePromise = nimiqLegacyCorePromise || new Promise((resolve, reject) => {
        console.warn('Support for Nimiq Legacy is deprecated and will be removed in the future.');
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
        $script.src = `${nimiqLegacyCoreBasePath}${coreVariant}.js`;
        $head.appendChild($script);
    }).then(() => Nimiq, // The Nimiq global has been set by the legacy Core.
    (e) => {
        nimiqLegacyCorePromise = null;
        return Promise.reject(e);
    });
    return nimiqLegacyCorePromise;
}
/**
 * Load the WebAssembly and module for cryptographic functions. You will have to do this before calculating hashes,
 * deriving keys or addresses, signing transactions or messages, etc.
 */
async function loadNimiqLegacyCryptography(preloadWasm = true) {
    nimiqLegacyCryptographyPromise = nimiqLegacyCryptographyPromise || (async () => {
        try {
            if (preloadWasm) {
                // Preload wasm and wasm handler in parallel.
                preloadAsset(`${nimiqLegacyCoreBasePath}worker-wasm.wasm`, 'fetch', true);
                preloadAsset(`${nimiqLegacyCoreBasePath}worker-wasm.js`, 'script', true, 'sha256-1h3wGtySfLKDIxTvVjS56pcJKsrLCb63YosamKCWLHA=');
            }
            const NimiqLegacy = await loadNimiqLegacyCore();
            // Note: this will not import the wasm again if it has already been imported, for example by the parent app.
            await NimiqLegacy.WasmHelper.doImport();
        }
        catch (e) {
            nimiqLegacyCryptographyPromise = null;
            throw e;
        }
    })();
    return nimiqLegacyCryptographyPromise;
}
function preloadAsset(asset, as, crossOrigin, integrity) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = as;
    link.href = asset;
    link.onload = link.onerror = () => document.head.removeChild(link); // eslint-disable-line no-multi-assign
    if (crossOrigin)
        link.crossOrigin = '';
    if (integrity)
        link.integrity = integrity;
    document.head.appendChild(link);
}

class RequestNimiq extends Request {
    static _lowLevelApiPromise = null;
    coin = Coin.NIMIQ;
    requiredApp = 'Nimiq';
    nimiqVersion;
    get minRequiredAppVersion() {
        return '1.4.2'; // first version supporting web usb
    }
    constructor(nimiqVersion, expectedWalletId) {
        super(expectedWalletId);
        this.nimiqVersion = nimiqVersion;
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
        false, // display
        this.nimiqVersion);
        const Nimiq = await this._loadNimiq(); // throws LOADING_DEPENDENCIES_FAILED on failure
        // Compute base64 wallet id. Use sha256 as blake2b yields the nimiq address
        const walletIdHash = Nimiq.Hash.computeSha256(firstAddressPubKeyBytes);
        const walletId = btoa(String.fromCodePoint(...walletIdHash));
        coinAppConnection.walletId = walletId; // change the original object which equals _coinAppConnection
        this._checkExpectedWalletId(walletId);
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
            return (await [import('./lazy-chunk-index.es.js'), import('./lazy-chunk-request.es.js'), import('./ledger-api.es.js'), import('./lazy-chunk-low-level-api.es.js')][3]).default;
        }
        catch (e) {
            throw new ErrorState(ErrorType.LOADING_DEPENDENCIES_FAILED, `Failed loading dependencies: ${e instanceof Error ? e.message : e}`, this);
        }
    }
    async _loadNimiq() {
        try {
            // Note: cryptography is needed for wallet id hashing, if requested, and pub key to address derivation in
            // SignatureProof and BasicTransaction.
            return await loadNimiq(this.nimiqVersion, /* include cryptography */ true);
        }
        catch (e) {
            throw new ErrorState(ErrorType.LOADING_DEPENDENCIES_FAILED, `Failed loading dependencies: ${e instanceof Error ? e.message : e}`, this);
        }
    }
}

export { RequestNimiq as R, isNimiqLegacyPrimitive as a, isNimiqLegacy as i, loadNimiq as l };
//# sourceMappingURL=lazy-chunk-request-nimiq.es.js.map
