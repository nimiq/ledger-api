/// <reference path="./bitcoinjs-lib.d.ts" preserve="true" />

// This is a subset of BitcoinJS for generating a tree-shaken lazy chunk of only the things we need from this lib.
// Also importing this file gives the chunk a meaningful name, instead of index.es4.js
// TODO Ideally though we would not build or bundle bitcoin-js and its dependencies at all. Instead all node modules
//  should be treated as external dependencies and it should be the the consuming app's responsibility to bundle the
//  dependencies, to avoid duplicate bundling of dependencies used by the lib and the app.

import bip32 from 'bip32';
import networks from 'bitcoinjs-lib/src/networks';
import address from 'bitcoinjs-lib/src/address';

export {
    bip32,
    networks,
    address,
};
