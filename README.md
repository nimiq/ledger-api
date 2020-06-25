# Nimiq Ledger Api

Api for communication with the [Ledger Hardware Wallet Nimiq App](https://github.com/LedgerHQ/app-nimiq).
Check out the [demo](https://nimiq.github.io/ledger-api/demo/).

## Installation

```bash
yarn add @nimiq/ledger-api
```

## Usage

This package provides two different apis:
- A [low level api](https://github.com/nimiq/ledger-api/blob/master/src/low-level-api/low-level-api.ts) with a similar basic api as the apis for other coins in Ledger's [@ledgerhq/hw-app-*](https://github.com/LedgerHQ/ledgerjs) packages.
- A [high level api](https://github.com/nimiq/ledger-api/blob/master/src/high-level-api/ledger-api.ts) which builds on top of the low level api but provides an improved api, optimizations for specific transport types and better usability. This is the api you'll typically want to use.

The apis are documented as jsdoc comments in [low-level-api.ts](https://github.com/nimiq/ledger-api/blob/master/src/low-level-api/low-level-api.ts) and [ledger-api.ts](https://github.com/nimiq/ledger-api/blob/master/src/high-level-api/ledger-api.ts).

For a comparison of the available transport libraries, see [`transport-comparison.md`](https://github.com/nimiq/ledger-api/blob/master/transport-comparison.md).

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
