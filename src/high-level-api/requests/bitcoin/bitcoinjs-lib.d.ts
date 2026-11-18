// Declare types for individual files of bitcoinjs-lib to allow importing just parts of it instead of the entire lib.

declare module 'bitcoinjs-lib/src/address' {
    export * from 'bitcoinjs-lib/src/cjs/address';
}

declare module 'bitcoinjs-lib/src/networks' {
    export * from 'bitcoinjs-lib/src/cjs/networks';
}
