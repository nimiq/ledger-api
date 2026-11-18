// Constant shared between the low-level-api and the high-level-api.
// As a separate file to be able to use these constants in the main chunk without the need to import the entire lazy
// chunks of the low level api, and to avoid circular dependencies between main entry and other files.

/**
 * Nimiq versions supported by this library. Support for Nimiq Legacy (Nimiq 1.0, Proof-of-Work) has been removed, and
 * Albatross (Nimiq 2.0, Proof-of-Stake) is the only remaining version. The enum and the corresponding optional
 * `nimiqVersion` parameters are kept for backwards compatibility of the api.
 */
export enum NimiqVersion {
    ALBATROSS = 'albatross',
}
