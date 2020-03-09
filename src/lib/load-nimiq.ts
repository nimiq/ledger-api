type Nimiq = typeof import('@nimiq/core-web');

const coreBasePath = 'https://cdn.nimiq.com/latest/';

let nimiqCorePromise: Promise<Nimiq> | null = null;
let nimiqCryptographyPromise: Promise<void> | null = null;

/**
 * Lazy-load the Nimiq core api from the cdn server if it's not loaded yet.
 */
export async function loadNimiqCore(coreVariant: 'web' | 'web-offline' = 'web-offline'): Promise<Nimiq> {
    // @ts-ignore Return global Nimiq if already loaded.
    if (window.Nimiq) return window.Nimiq;

    nimiqCorePromise = nimiqCorePromise || new Promise((resolve, reject) => {
        const $head = document.getElementsByTagName('head')[0];
        const $script = document.createElement('script');
        $script.type = 'text/javascript';
        $script.onload = () => {
            $script.parentNode!.removeChild($script);
            resolve();
        };
        $script.onerror = () => {
            $script.parentNode!.removeChild($script);
            reject();
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
        const Nimiq = await loadNimiqCore();
        // Note that we don't need to cache a promise for doImport() as the core already does that.
        await Nimiq.WasmHelper.doImport();
    })();
    return nimiqCryptographyPromise;
}
