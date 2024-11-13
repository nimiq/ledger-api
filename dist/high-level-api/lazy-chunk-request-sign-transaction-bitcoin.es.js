import { b as buffer } from './lazy-chunk-index.es.js';
import { R as RequestBitcoin } from './lazy-chunk-request-bitcoin.es.js';
import { RequestTypeBitcoin, g as getLegacyApp, parseBip32Path, Coin, ErrorState, ErrorType, Network, AddressTypeBitcoin } from './ledger-api.es.js';
import './lazy-chunk-request.es.js';

class RequestSignTransactionBitcoin extends RequestBitcoin {
    type = RequestTypeBitcoin.SIGN_TRANSACTION;
    transaction;
    network;
    _inputType;
    get requiredApp() {
        // The new Bitcoin app does not allow custom input scripts (for example custom witness scripts) unless an
        // associated wallet policy had been registered. For this reason, we currently still require using the old api
        // if custom input scripts are set.
        if (!this.transaction.inputs.some(({ customScript }) => !!customScript))
            return super.requiredApp;
        if (this._coinAppConnection && this._coinAppConnection.app === super.requiredApp
            && !RequestBitcoin._isNewApiSupported(this._coinAppConnection.app, this._coinAppConnection.appVersion)) {
            // We're already connected to an appropriate Bitcoin app on which we don't use the new api, e.g. a Bitcoin
            // app before 2.0. Thus, no need to specifically require the Legacy app variant.
            return super.requiredApp;
        }
        return getLegacyApp(super.requiredApp); // require Legacy app variant
    }
    constructor(transaction, expectedWalletId) {
        super(expectedWalletId);
        this.transaction = transaction;
        try {
            const { inputs, outputs, changePath } = transaction;
            if (!inputs.length) {
                throw new Error('No inputs specified');
            }
            if (!outputs.length) {
                throw new Error('No outputs specified');
            }
            // verify key paths
            const keyPaths = [
                ...inputs.map((input) => input.keyPath),
                ...(changePath ? [changePath] : []),
            ];
            // Parent path of the keyPaths for the common account, equivalent to its computation in @ledgerhq/hw-app-btc
            // createPaymentTransaction, stripping off the last two derivation levels.
            let accountPath = null;
            let network = null;
            let inputType = null;
            for (const keyPath of keyPaths) {
                const parsedKeyPath = parseBip32Path(keyPath);
                if (parsedKeyPath.coin !== Coin.BITCOIN) {
                    throw new Error(`${keyPath} not a Bitcoin bip32 path following bip44`);
                }
                // Check whether all input and change keyPaths are from the same account, because that is a requirement
                // of @ledgerhq/hw-app-btc's BtcNew's createPaymentTransaction because it only uses a single, simple
                // wallet policy based on the common account xpub. Note that this check also ensures that all paths are
                // on the same network and of the same input type, which is required because signing of inputs depends
                // on param segwit and whether bech32 is set as an additional, i.e. all inputs are treated the same and
                // signed according to these parameters, also in BtcOld. For different accountPaths, the transaction
                // could be split and each input be signed separately, but that would be a lot of work.
                // Outputs can be of arbitrary type. We also don't have to check the output network because they will be
                // displayed on the Ledger screen and the user will spot differences.
                if (accountPath && parsedKeyPath.accountPath !== accountPath) {
                    const { app, appVersion } = this._coinAppConnection;
                    if (RequestBitcoin._isNewApiSupported(app, appVersion)) {
                        // Not throwing because ledgerhq/hw-app-btc BtcNew will throw instead.
                        console.error('All inputs and change must be from the same account. If this error is shown but '
                            + 'signing succeeds, it means that this requirement has been removed from '
                            + '@ledgerhq/hw-app-btc. Please notify us in that case.');
                    }
                    else {
                        // BtcOld has the implicit requirement that all inputs are of the same network and address type,
                        // see above, but does not throw. While change can be arbitrary for BtcOld, for simplification
                        // we use the same single check.
                        throw new Error('All inputs and change must be from the same account.');
                    }
                }
                accountPath = parsedKeyPath.accountPath;
                network = parsedKeyPath.network;
                inputType = parsedKeyPath.addressType;
            }
            this.network = network;
            this._inputType = inputType;
        }
        catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, `Invalid request: ${e instanceof Error ? e.message : e}`, this);
        }
        // Preload Bitcoin lib if needed. Ledger Bitcoin api is already preloaded by parent class. Ignore errors.
        this._loadBitcoinLibIfNeeded().catch(() => { });
    }
    async call(transport) {
        // Resources:
        // - to learn more about scripts and how input and output script relate to each other:
        //   https://en.bitcoin.it/wiki/Script
        // - to learn more about transactions in general, what they include and their encoding:
        //   https://en.bitcoin.it/wiki/Transaction
        // - code for decoding of transactions for a deeper understanding:
        //   https://github.com/bitcoinjs/bitcoinjs-lib/blob/master/ts_src/transaction.ts (BitcoinJS)
        //   https://github.com/LedgerHQ/ledger-live/blob/main/libs/ledgerjs/packages/hw-app-btc/src/splitTransaction.ts
        //   (parsing into Ledger's representation. Code is a bit messy.)
        // - Ledger's notion of trusted inputs to connect inputs to their amount in a trusted fashion by rehashing the
        //   input transaction:
        //   https://bitcoinmagazine.com/articles/how-segregated-witness-is-about-to-fix-hardware-wallets-1478110057
        //   https://medium.com/segwit-co/segregated-witness-and-hardware-wallets-cc88ba532fb3
        // - A write-up about the Bitcoin app's switch to using partially signed Bitcoin transactions (psbt) with 2.0.0:
        //   https://blog.ledger.com/bitcoin-2/
        //   The new Bitcoin api was introduced with 2.0.0, while the legacy api was still supported until 2.1.0.
        // - @ledgerhq/hw-app-btc (the client lib) documentation:
        //   https://github.com/LedgerHQ/ledger-live/tree/main/libs/ledgerjs/packages/hw-app-btc
        // - @ledgerhq/hw-app-btc still contains the deprecated code for old Bitcoin apps before 2.0.0:
        //   https://github.com/LedgerHQ/ledger-live/blob/main/libs/ledgerjs/packages/hw-app-btc/src/BtcOld.ts
        //   The client code for the new Bitcoin apps can be found here:
        //   https://github.com/LedgerHQ/ledger-live/blob/main/libs/ledgerjs/packages/hw-app-btc/src/BtcNew.ts
        //   Additionally, the repository of the Ledger Bitcoin App contains another js client written from ground up,
        //   which better supports the new api:
        //   https://github.com/LedgerHQ/app-bitcoin-new/tree/develop/bitcoin_client_js
        // - @ledgerhq/hw-app-btc legacy transaction building and signing logic:
        //   https://github.com/LedgerHQ/ledger-live/blob/main/libs/ledgerjs/packages/hw-app-btc/src/createTransaction
        //   The transaction building and signing logic for new Bitcoin app based on psbts is contained within BtcNew.ts
        // - Ledger Bitcoin App's api description:
        //   https://github.com/LedgerHQ/app-bitcoin-new/blob/master/doc/bitcoin.md
        // - @ledgerhq/hw-app-btc's tests to see an example of correctly sent data:
        //   https://github.com/LedgerHQ/app-bitcoin-new/tree/master/tests
        // - For decoding transactions:
        //   https://live.blockcypher.com/btc/decodetx/
        // - The demo page and code of this lib for demo usage
        const [api, bitcoinLib] = await Promise.all([
            // these throw LOADING_DEPENDENCIES_FAILED on failure
            this._getLowLevelApi(transport),
            this._loadBitcoinLibIfNeeded(),
        ]);
        let parsedTransaction;
        try {
            // parse into Ledger's CreateTransactionArg format
            const { inputs, outputs, changePath, locktime, sigHashType, useTrustedInputForSegwit, } = this.transaction;
            parsedTransaction = {
                inputs: inputs.map(({ transaction, index, customScript, sequence }) => [
                    api.splitTransaction(typeof transaction === 'string' ? transaction : transaction.toHex(), 
                    // Set segwit support always to true because then transactions with and without witnesses are
                    // correctly parsed (compare bitcoinjs/transaction). Also we can't set it depending on whether
                    // our own input (transaction's output) is not segwit because it's input might be. Specifically
                    // fixes parsing legacy inputs which came from segwit inputs.
                    true),
                    index,
                    customScript || null,
                    sequence || null,
                ]),
                associatedKeysets: inputs.map(({ keyPath }) => keyPath),
                outputScriptHex: typeof outputs === 'string'
                    ? outputs
                    : api.serializeTransactionOutputs({
                        outputs: outputs.map((output) => {
                            // inspired by how outputs are encoded in __toBuffer in bitcoinjs-lib/transaction.ts
                            const { amount } = output;
                            if (Math.floor(amount) !== amount || amount < 0 || amount > 21e9) {
                                throw new Error(`Invalid Satoshi amount: ${amount}`);
                            }
                            const amountBuffer = buffer.Buffer.alloc(8);
                            amountBuffer.writeInt32LE(amount & -1, 0); // eslint-disable-line no-bitwise
                            amountBuffer.writeUInt32LE(Math.floor(amount / 0x100000000), 4);
                            let outputScript;
                            if ('outputScript' in output) {
                                outputScript = buffer.Buffer.from(output.outputScript, 'hex');
                            }
                            else {
                                outputScript = bitcoinLib.address.toOutputScript(output.address, this.network === Network.MAINNET
                                    ? bitcoinLib.networks.bitcoin
                                    : bitcoinLib.networks.testnet);
                            }
                            return { amount: amountBuffer, script: outputScript };
                        }),
                    }).toString('hex'),
                segwit: this._inputType !== AddressTypeBitcoin.LEGACY,
                additionals: this._inputType === AddressTypeBitcoin.NATIVE_SEGWIT ? ['bech32'] : [],
            };
            // Set optional properties. Note that we did not use ...this.transaction via object spreading above to avoid
            // setting properties to undefined for which the default values would not be applied anymore in the api call
            if (changePath !== undefined && changePath !== null) {
                parsedTransaction.changePath = changePath;
            }
            if (locktime !== undefined && locktime !== null) {
                parsedTransaction.lockTime = locktime;
            }
            if (sigHashType !== undefined && sigHashType !== null) {
                parsedTransaction.sigHashType = sigHashType;
            }
            if (useTrustedInputForSegwit !== undefined && useTrustedInputForSegwit !== null) {
                parsedTransaction.useTrustedInputForSegwit = useTrustedInputForSegwit;
            }
        }
        catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, e instanceof Error ? e : String(e), this);
        }
        // Note: We make api calls outside of the try...catch block to let the exceptions fall through such that
        // _callLedger can decide how to behave depending on the api error.
        return api.createPaymentTransaction(parsedTransaction);
    }
    async _loadBitcoinLibIfNeeded() {
        // If we need bitcoinjs for address to output script conversion, load it.
        if (Array.isArray(this.transaction.outputs)
            && this.transaction.outputs.some((output) => 'address' in output && !!output.address)) {
            return this._loadBitcoinLib();
        }
        return null;
    }
}

export { RequestSignTransactionBitcoin as default };
//# sourceMappingURL=lazy-chunk-request-sign-transaction-bitcoin.es.js.map
