import { NimiqVersion } from '../lib/constants';
export type Nimiq<Version extends NimiqVersion> = Version extends NimiqVersion.ALBATROSS ? typeof import('@nimiq/albatross-wasm') : typeof import('@nimiq/core-web');
type CommonPrimitives = Extract<keyof typeof import('@nimiq/albatross-wasm'), keyof typeof import('@nimiq/core-web')>;
export type NimiqPrimitive<Primitive extends CommonPrimitives, Version extends NimiqVersion> = InstanceType<Nimiq<Version>[Primitive]>;
export declare function isNimiqLegacy(core: Nimiq<NimiqVersion>): core is Nimiq<NimiqVersion.LEGACY>;
export declare function isNimiqLegacyPrimitive<Primitive extends CommonPrimitives = never>(primitive: NimiqPrimitive<Primitive, NimiqVersion>): primitive is NimiqPrimitive<Primitive, NimiqVersion.LEGACY>;
export declare function loadNimiq<Version extends NimiqVersion>(nimiqVersion: Version, inlcudeNimiqLegacyCryptography: boolean, preloadWasm?: boolean): Promise<Nimiq<Version>>;
declare module './load-nimiq' {
    const Nimiq: undefined | Nimiq<NimiqVersion.LEGACY>;
    const loadAlbatross: undefined | (() => Promise<{
        Client: Nimiq<NimiqVersion.ALBATROSS>['Client'];
        ClientConfiguration: Nimiq<NimiqVersion.ALBATROSS>['ClientConfiguration'];
    }>);
    const __nimiqLegacyCoreWasmIntegrityHash__: string;
}
export {};
