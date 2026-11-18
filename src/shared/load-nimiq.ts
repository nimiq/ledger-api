import { NimiqVersion } from './constants';

// The Version type parameters are kept for backwards compatibility. NimiqVersion.ALBATROSS is the only version.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type Nimiq<Version extends NimiqVersion = NimiqVersion> = typeof import('@nimiq/core');

// Provide an alternative implementation of InstanceType<T> which is compatible with classes with private constructors,
// because the constructor of @nimiq/core's class Client is private which leads to error "Type 'typeof Client' is not
// assignable to type 'abstract new (...args: any) => any'. Cannot assign a 'private' constructor type to a 'public'
// constructor type." when using the built-in InstanceType<T> utility. Inspired by https://stackoverflow.com/a/52350147.
type InstanceTypeIgnoringPrivateConstructor<T extends { prototype: any }> = T extends new (...args: any) => infer R ? R
    : T extends { prototype: infer R } ? R : never;
type NimiqClassName = {
    [Key in keyof Nimiq]: Nimiq[Key] extends { prototype: any } ? Key : never
}[keyof Nimiq];
export type NimiqPrimitive<
    Primitive extends NimiqClassName,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Version extends NimiqVersion = NimiqVersion,
> = InstanceTypeIgnoringPrivateConstructor<Nimiq[Primitive]>;

declare module './load-nimiq' {
    // Nimiq Hub defines globals Nimiq and loadAlbatross, which we'll use for special treatment if running in the Hub
    // (the main consumer of this ledger-api). Although they are in fact global variables in the Hub, we don't do a
    // global type augmentation here, to not pollute the global scope for others and to discourage usage of the globals
    // within this library.
    const Nimiq: undefined | Nimiq;
    const loadAlbatross: undefined | (() => Promise<{
        Client: Nimiq['Client'],
        ClientConfiguration: Nimiq['ClientConfiguration'],
    }>);
}

const isNimiqAlbatrossHub = typeof loadAlbatross !== 'undefined' && (
    // Running on Hub domain.
    /^hub\.(?:pos\.)?nimiq(?:-testnet)?\.com$/.test(window.location.hostname)
    // Or running on localhost:8080 or BrowserStack's bs-local.com:8080 which is where Hub dev versions are run.
    || /^(?:localhost|bs-local\.com):8080$/.test(window.location.host)
);
const nimiqCoreBasePath = isNimiqAlbatrossHub
    // On a Nimiq Hub with Albatross support, use the Hub's copy of the core (copied from @nimiq/core in the Hub's
    // vue.config.js), same as the Hub itself is doing, to avoid using and loading an additional version.
    ? '/nimiq/web/'
    // In other cases load @nimiq/core@2 from jsdelivr. Load from cdn to avoid bundling a copy of core if it's not
    // needed. This way, we also don't need to handle the wasm file in the build config.
    : 'https://cdn.jsdelivr.net/npm/@nimiq/core@2/web/';
let nimiqCorePromise: Promise<Nimiq> | null = null;

/**
 * Lazy-load the Nimiq core api if it's not loaded yet.
 * @param [nimiqVersion] - Kept for backwards compatibility. Only NimiqVersion.ALBATROSS is supported.
 * @param [_includeCryptography] - Kept for backwards compatibility. Cryptography is always included.
 * @param [preloadWasm] - Whether to preload the wasm file in parallel.
 */
export async function loadNimiq(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    nimiqVersion: NimiqVersion = NimiqVersion.ALBATROSS,
    _includeCryptography = true,
    preloadWasm = true,
): Promise<Nimiq> {
    // Return global Nimiq if already loaded, for example in Nimiq Hub.
    if (typeof Nimiq !== 'undefined') return Nimiq;

    nimiqCorePromise ||= (async () => {
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
            const NimiqCore = await import(/* @vite-ignore */ `${nimiqCoreBasePath}main-wasm/index.js`);
            const { default: init } = NimiqCore;
            await init();
            return NimiqCore as Nimiq;
        } catch (e) {
            nimiqCorePromise = null;
            throw e;
        }
    })();
    return nimiqCorePromise;
}

function preloadAsset(asset: string, as: string, crossOrigin?: boolean, integrity?: string) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = as;
    link.href = asset;
    link.onload = link.onerror = () => document.head.removeChild(link);
    if (crossOrigin) link.crossOrigin = '';
    if (integrity) link.integrity = integrity;
    document.head.appendChild(link);
}
