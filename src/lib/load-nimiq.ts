type Nimiq = typeof import('@nimiq/core-web');

const coreBasePath = window.location.hostname.endsWith('.nimiq.com')
    ? 'https://cdn.nimiq.com/'
    // On third party domains use jsdelivr instead of nimiq cdn to avoid getting blocked by ad blockers.
    // TODO currently using 1.5.8 due to a crossOrigin issue in Nimiq core 1.6.0. Use the latest version, once 1.6.1
    //  has been released.
    : 'https://cdn.jsdelivr.net/npm/@nimiq/core-web@1.5.8/';

let nimiqCorePromise: Promise<Nimiq> | null = null;
let nimiqCryptographyPromise: Promise<void> | null = null;

/**
 * Lazy-load the Nimiq core api from the cdn server if it's not loaded yet.
 */
export async function loadNimiqCore(coreVariant: 'web' | 'web-offline' = 'web-offline'): Promise<Nimiq> {
    // @ts-ignore Return global Nimiq if already loaded.
    if (window.Nimiq) return window.Nimiq;

    nimiqCorePromise = nimiqCorePromise || new Promise<void>((resolve, reject) => {
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
        $script.src = `${coreBasePath}${coreVariant}.js`;
        $head.appendChild($script);
    }).then(
        () => {
            // @ts-ignore Nimiq is global but to discourage usage as global var we did not declare a global type.
            const { Nimiq } = window;
            return Nimiq;
        },
        (e) => {
            nimiqCorePromise = null;
            return Promise.reject(e);
        },
    );
    return nimiqCorePromise;
}

/**
 * Load the WebAssembly and module for cryptographic functions. You will have to do this before calculating hashes,
 * deriving keys or addresses, signing transactions or messages, etc.
 */
export async function loadNimiqCryptography(): Promise<void> {
    nimiqCryptographyPromise = nimiqCryptographyPromise || (async () => {
        try {
            // preload wasm in parallel
            preloadAsset(`${coreBasePath}worker-wasm.wasm`, 'fetch', true);
            preloadAsset(`${coreBasePath}worker-wasm.js`, 'script');

            const Nimiq = await loadNimiqCore();
            await Nimiq.WasmHelper.doImport();
        } catch (e) {
            nimiqCryptographyPromise = null;
            throw e;
        }
    })();
    return nimiqCryptographyPromise;
}

function preloadAsset(asset: string, as: string, crossOrigin?: boolean) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = as;
    link.href = asset;
    link.onload = link.onerror = () => document.head.removeChild(link); // eslint-disable-line no-multi-assign
    if (crossOrigin) link.crossOrigin = '';
    document.head.appendChild(link);
}
