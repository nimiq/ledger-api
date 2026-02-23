# Nimiq Ledger Api

Api for communication with the [Ledger Hardware Wallet Nimiq App](https://github.com/LedgerHQ/app-nimiq).
Check out the [demo](https://nimiq.github.io/ledger-api/demo/).

## Installation

```bash
yarn add @nimiq/ledger-api
```

## General Usage

This package provides two different apis:
- A [low level api](https://github.com/nimiq/ledger-api/blob/master/src/low-level-api/low-level-api.ts) with a similar
  basic api as the apis for other coins in Ledger's [@ledgerhq/hw-app-*](https://github.com/LedgerHQ/ledgerjs) packages.
- A [high level api](https://github.com/nimiq/ledger-api/blob/master/src/high-level-api/ledger-api.ts) which builds on
  top of the low level api but provides multi-currency support, an improved api, optimizations for specific transport
  types and better usability. This is the api you'll typically want to use.

The apis are documented as jsdoc comments in
[low-level-api.ts](https://github.com/nimiq/ledger-api/blob/master/src/low-level-api/low-level-api.ts) and
[ledger-api.ts](https://github.com/nimiq/ledger-api/blob/master/src/high-level-api/ledger-api.ts).

For a comparison of the available transport libraries, see
[`transport-comparison.md`](https://github.com/nimiq/ledger-api/blob/master/transport-comparison.md).

## Prerequisites

Several of the used libraries like [bitcoinjs-lib](https://github.com/bitcoinjs/bitcoinjs-lib) and
[@ledgerhq/hw-transport](https://github.com/LedgerHQ/ledger-live/tree/develop/libs/ledgerjs/packages/hw-transport) make
use of built-in modules and globals native to NodeJS. For use in browsers, they must be polyfilled as part of the build
process.

Note that @nimiq/ledger-api does not include these polyfills itself as it does not bundle its dependencies during build,
but keeps them [external](https://rollupjs.org/configuration-options/#external). This is to avoid duplicate bundling of
those dependencies and the polyfills, if your app itself bundles any of them or the polyfills, too. This way, also no
polyfills are unnecessarily included if using the library in NodeJs instead of a browser, and specific polyfills can be
picked by the app author.

Example instructions for bundling the polyfills with various bundlers follow in the next sections, roughly sorted from
easiest to set up but least preferable to harder to set up but preferable.

### browserify

[browserify](https://github.com/browserify/browserify) supports bundling apps with polyfills. You can either use it to
bundle your entire app, or to bundle just the @nimiq/ledger-api as a standalone file. The following example bundles the
lib to a standalone file:

```bash
browserify -r @nimiq/ledger-api -s LedgerApi | terser --compress --mangle > ledger-api.min.js
```

Note that bundling to a separate file can lead to duplicate bundling of the dependencies and the polyfills between the
standalone file and the rest of your app. Therefore, using a different bundler is recommended.

### rollup with plugin `rollup-plugin-polyfill-node`

The [rollup](https://rollupjs.org/) plugin
[`rollup-plugin-polyfill-node`](https://github.com/FredKSchott/rollup-plugin-polyfill-node)
can be used to automatically handle polyfills of NodeJS features. An example configuration can be found
[here](https://github.com/nimiq/ledger-api/blob/639d7dc35c1cd121d48a9bc7a6ec814939881147/rollup.config.js).

Note that `rollup-plugin-polyfill-node` has not been updated much recently, and provided polyfills might not be the most
up-to-date. You might want to look for a more modern fork or manually provide the polyfills yourself.

### Manually providing polyfills

Manually providing polyfills comes with a bit of extra setup but allows you to specify the polyfills yourself, with the
ability to keep them up-to-date manually.

Notable features built into NodeJS and suggested polyfills are:
- NodeJS module `buffer` can be polyfilled by npm package
  [`buffer`](https://www.npmjs.com/package/buffer).
- NodeJS module `stream` can be polyfilled by npm package
  [`readable-stream`](https://www.npmjs.com/package/readable-stream).
- NodeJS global variable `global` can be polyfilled as
  [`globalThis`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/globalThis).
- NodeJS global variable `Buffer` can be polyfilled by injecting `import { Buffer } from 'buffer'` wherever `Buffer` is
  used, as part of your build task.

Basically, npm packages `buffer` and `readable-stream` need to be added as dependencies, `stream` has to be aliased as
`readable-stream`, imports of `buffer` should be injected whenever `Buffer` is used, and `global` should be replaced
with `globalThis`.

For an example setup with [rollup](https://rollupjs.org/) check out the `demoConfig` in the build task of the [demo app
included in this repository](https://github.com/nimiq/electrum-client/blob/master/example/rollup.config.js).

For an example setup with [webpack](https://webpack.js.org/) checkout out the
[vue.config.js of the Nimiq Hub](https://github.com/nimiq/hub/blob/master/vue.config.js).

## Development and building the library

To run the demo page use:
```batch
yarn serve
```
Note that this serves the demo via https which is required for communicating with the Ledger.

To build the library:
```batch
yarn build
```
