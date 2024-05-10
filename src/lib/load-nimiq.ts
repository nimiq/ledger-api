import { NimiqVersion } from '../lib/constants';

// Note: @nimiq/albatross-wasm is mapped to @nimiq/core-web@next in package.json. @nimiq/albatross-wasm is the name that
// the Nimiq Hub uses, which is why we use it here, too.
export type Nimiq<Version extends NimiqVersion> = Version extends NimiqVersion.ALBATROSS
    ? typeof import('@nimiq/albatross-wasm')
    : typeof import('@nimiq/core-web');

// Accessor for primitives that exist in Nimiq Legacy and Nimiq Albatross under the same name.
type CommonPrimitives = Extract<keyof typeof import('@nimiq/albatross-wasm'), keyof typeof import('@nimiq/core-web')>;
export type NimiqPrimitive<
    Primitive extends CommonPrimitives,
    Version extends NimiqVersion,
> = InstanceType<Nimiq<Version>[Primitive]>;

export function isNimiqLegacy(core: Nimiq<NimiqVersion>): core is Nimiq<NimiqVersion.LEGACY> {
    // Note that checking for core.Version.CORE_JS_VERSION would be nicer, but it's unfortunately not available in the
    // web-offline variant.
    return 'GenesisConfig' in core && core.GenesisConfig.CONFIGS.main.NETWORK_ID === 42;
}

export function isNimiqLegacyPrimitive<Primitive extends CommonPrimitives = /* enforce specifying manually */ never>(
    primitive: NimiqPrimitive<Primitive, NimiqVersion>,
): primitive is NimiqPrimitive<Primitive, NimiqVersion.LEGACY> {
    return !('__destroy_into_raw' in primitive || '__wrap' in primitive.constructor);
}

declare module './load-nimiq' {
    // Nimiq Hub defines globals Nimiq and loadAlbatross, which we'll use for special treatment if running in the Hub
    // (the main consumer of this ledger-api). Although they are in fact global variables in the Hub, we don't do a
    // global type augmentation here, to not pollute the global scope for others and to discourage usage of the globals
    // within this library.
    const Nimiq: undefined | Nimiq<NimiqVersion.LEGACY>;
    const loadAlbatross: undefined | (() => Promise<{
        Client: Nimiq<NimiqVersion.ALBATROSS>['Client'],
        ClientConfiguration: Nimiq<NimiqVersion.ALBATROSS>['ClientConfiguration'],
    }>);

    // Integrity hash is defined in rollup.config.js.
    const __nimiqLegacyCoreWasmIntegrityHash__: string; // eslint-disable-line @typescript-eslint/naming-convention
}

const isNimiqAlbatrossHub = typeof loadAlbatross !== 'undefined' && (
    // Running on Hub domain.
    /^hub\.(?:pos\.)?nimiq(?:-testnet)?\.com$/.test(window.location.hostname)
    // Or running on localhost:8081 or BrowserStack's bs-local.com:8081 which is where Hub dev versions are run.
    || /^(?:localhost|bs-local\.com):8081$/.test(window.location.host)
);
const nimiqCoreBasePath = isNimiqAlbatrossHub
    // On a Nimiq Hub with Albatross support, use the Hub's copy of the core (copied from @nimiq/albatross-wasm in the
    // Hub's vue.config.js, which is an alias for @nimiq/core-web@next), same as the Hub itself is doing, to avoid using
    // and loading an additional version.
    ? '/albatross-client/web/'
    // In other cases load @nimiq/core-web@next from jsdelivr. Load from cdn to avoid bundling a copy of core if it's
    // not needed. This way, we also don't need to handle the wasm file in the rollup config.
    : 'https://cdn.jsdelivr.net/npm/@nimiq/core-web@next/web/';
let nimiqCorePromise: Promise<Nimiq<NimiqVersion.ALBATROSS>> | null = null;

export async function loadNimiqCore(): Promise<Nimiq<NimiqVersion.ALBATROSS>> {
    nimiqCorePromise = nimiqCorePromise || (async () => {
        try {
            // Preload wasm in parallel. We only need the main wasm, not the Client or worker.
            preloadAsset(`${nimiqCoreBasePath}main-wasm/index_bg.wasm`, 'fetch', true);

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
        } catch (e) {
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
let nimiqLegacyCorePromise: Promise<Nimiq<NimiqVersion.LEGACY>> | null = null;
let nimiqLegacyCryptographyPromise: Promise<void> | null = null;

/**
 * Lazy-load the Nimiq core api from the cdn server if it's not loaded yet.
 */
export async function loadNimiqLegacyCore(coreVariant: 'web' | 'web-offline' = 'web-offline')
    : Promise<Nimiq<NimiqVersion.LEGACY>> {
    // Return global Nimiq if already loaded from @nimiq/core-web, for example in Nimiq Hub.
    if (typeof Nimiq !== 'undefined') return Nimiq;

    nimiqLegacyCorePromise = nimiqLegacyCorePromise || new Promise<void>((resolve, reject) => {
        console.warn('Support for Nimiq Legacy is deprecated and will be removed in the future.');
        const $head = document.getElementsByTagName('head')[0];
        const $script = document.createElement('script');
        $script.type = 'text/javascript';
        $script.onload = () => {
            $script.parentNode!.removeChild($script);
            resolve();
        };
        $script.onerror = (e) => {
            $script.parentNode!.removeChild($script);
            reject(e);
        };
        $script.src = `${nimiqLegacyCoreBasePath}${coreVariant}.js`;
        $head.appendChild($script);
    }).then(
        () => Nimiq!, // The Nimiq global has been set by the legacy Core.
        (e) => {
            nimiqLegacyCorePromise = null;
            return Promise.reject(e);
        },
    );
    return nimiqLegacyCorePromise;
}

/**
 * Load the WebAssembly and module for cryptographic functions. You will have to do this before calculating hashes,
 * deriving keys or addresses, signing transactions or messages, etc.
 */
export async function loadNimiqLegacyCryptography(): Promise<void> {
    nimiqLegacyCryptographyPromise = nimiqLegacyCryptographyPromise || (async () => {
        try {
            // Preload wasm in parallel.
            preloadAsset(`${nimiqLegacyCoreBasePath}worker-wasm.wasm`, 'fetch', true);
            preloadAsset(
                `${nimiqLegacyCoreBasePath}worker-wasm.js`,
                'script',
                true,
                __nimiqLegacyCoreWasmIntegrityHash__,
            );

            const NimiqLegacy = await loadNimiqLegacyCore();
            // Note: this will not import the wasm again if it has already been imported, for example by the parent app.
            await NimiqLegacy.WasmHelper.doImport();
        } catch (e) {
            nimiqLegacyCryptographyPromise = null;
            throw e;
        }
    })();
    return nimiqLegacyCryptographyPromise;
}

function preloadAsset(asset: string, as: string, crossOrigin?: boolean, integrity?: string) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = as;
    link.href = asset;
    link.onload = link.onerror = () => document.head.removeChild(link); // eslint-disable-line no-multi-assign
    if (crossOrigin) link.crossOrigin = '';
    if (integrity) link.integrity = integrity;
    document.head.appendChild(link);
}
