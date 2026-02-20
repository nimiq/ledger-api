// Constant shared between the low-level-api and the high-level-api.
// As a separate file to be able to use these constants in the main chunk without the need to import the entire lazy
// chunks of the low level api, and to avoid circular dependencies between main entry and other files.

export enum NimiqVersion {
    ALBATROSS = 'albatross',
    LEGACY = 'legacy',
}
