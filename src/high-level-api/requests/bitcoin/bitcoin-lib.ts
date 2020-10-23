// This is a subset of BitcoinJS for generating a tree-shaken lazy chunk of only the things we need from this lib (but
// unfortunately the lib doesn't seem to be very well tree-shakeable, the generated chunk with selective exports is
// pretty much the same size as when importing bitcoinjs-lib directly).
// But it's also a subset of the build in the Nimiq hub to be able to potentially use the hub build interchangeably
// such that the script already loaded in the Nimiq Hub can be used in the ledger api too.
// Also importing this file gives the chunk a meaningful name at least, instead of index.es4.js
// TODO Ideally though we would not build or bundle bitcoin-js and its dependencies at all. Instead all node modules
//  should be treated as external dependencies and it should be the the consuming app's responsibility to bundle the
//  dependencies, to avoid duplicate bundling of dependencies used by the lib and the app.

export {
    bip32,
    networks,
    // payments,
    address,

    // Required by @nimiq/electrum-client
    // Transaction,
    // script,
    // Block,
} from 'bitcoinjs-lib';
