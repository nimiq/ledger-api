import { RequestTypeBitcoin, parseBip32Path, Coin, ErrorState, ErrorType, Network, AddressTypeBitcoin } from './ledger-api.es.js';
import { B as Buffer } from './lazy-chunk-buffer-es6.es.js';
import './lazy-chunk-request.es.js';
import { R as RequestBitcoin } from './lazy-chunk-request-bitcoin.es.js';

class RequestSignTransactionBitcoin extends RequestBitcoin {
    constructor(transaction, expectedWalletId) {
        super(expectedWalletId);
        this.type = RequestTypeBitcoin.SIGN_TRANSACTION;
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
            let network = null;
            let inputType = null;
            for (const keyPath of keyPaths) {
                const parsedKeyPath = parseBip32Path(keyPath);
                if (parsedKeyPath.coin !== Coin.BITCOIN) {
                    throw new Error(`${keyPath} not a Bitcoin bip32 path following bip44`);
                }
                // Note that we don't have to verify the network of outputs. They will be displayed on the ledger screen
                // depending on whether Bitcoin mainnet or testnet app is used. User will spot differences.
                if (network && parsedKeyPath.network !== network) {
                    throw new Error('Not all key paths specify keys on the same network');
                }
                network = parsedKeyPath.network;
                // Note that we don't have to verify the address type of outputs and change; these can be arbitrary.
                // Inputs must all be of the same type because Ledger's signing of input depends on parameter segwit and
                // whether bech32 is set as an additional, i.e. all inputs are treated the same and signed according to
                // these parameters. The transaction could be split and each input be signed separately but that would
                // be a lot of work.
                if (keyPath === changePath)
                    continue; // could still also be an input, but we ignore that corner case
                if (inputType && parsedKeyPath.addressType !== inputType) {
                    throw new Error('Must not use mixed input types');
                }
                inputType = parsedKeyPath.addressType;
            }
            this.network = network;
            this._inputType = inputType;
        }
        catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, `Invalid request: ${e.message || e}`, this);
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
        //   https://github.com/LedgerHQ/ledgerjs/blob/master/packages/hw-app-btc/src/splitTransaction.js (parsing into
        //   Ledger's representation. Code is a bit messy.)
        // - Ledger's notion of trusted inputs to connect inputs to their amount in a trusted fashion by rehashing the
        //   input transaction:
        //   https://bitcoinmagazine.com/articles/how-segregated-witness-is-about-to-fix-hardware-wallets-1478110057
        //   https://medium.com/segwit-co/segregated-witness-and-hardware-wallets-cc88ba532fb3
        // - @ledgerhq/hw-app-btc documentation:
        //   https://github.com/LedgerHQ/ledgerjs/tree/master/packages/hw-app-btc
        // - @ledgerhq/hw-app-btc transaction building and signing logic:
        //   https://github.com/LedgerHQ/ledgerjs/blob/master/packages/hw-app-btc/src/createTransaction.js
        // - Ledger Bitcoin App's api description:
        //   https://github.com/LedgerHQ/app-bitcoin/blob/master/doc/btc.asc
        // - @ledgerhq/hw-app-btc's tests to see an example of correctly sent data:
        //   https://github.com/LedgerHQ/ledgerjs/tree/master/packages/hw-app-btc/tests
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
            const { inputs, outputs, changePath, lockTime, sigHashType, useTrustedInputForSegwit, } = this.transaction;
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
                            const amountBuffer = Buffer.alloc(8);
                            amountBuffer.writeInt32LE(amount & -1, 0); // eslint-disable-line no-bitwise
                            amountBuffer.writeUInt32LE(Math.floor(amount / 0x100000000), 4);
                            let outputScript;
                            if ('outputScript' in output) {
                                outputScript = Buffer.from(output.outputScript, 'hex');
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
            if (lockTime !== undefined && lockTime !== null) {
                parsedTransaction.lockTime = lockTime;
            }
            if (sigHashType !== undefined && sigHashType !== null) {
                parsedTransaction.sigHashType = sigHashType;
            }
            if (useTrustedInputForSegwit !== undefined && useTrustedInputForSegwit !== null) {
                parsedTransaction.useTrustedInputForSegwit = useTrustedInputForSegwit;
            }
        }
        catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, e, this);
        }
        // Note: We make api calls outside of the try...catch block to let the exceptions fall through such that
        // _callLedger can decide how to behave depending on the api error.
        return api.createPaymentTransactionNew(parsedTransaction);
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

export default RequestSignTransactionBitcoin;
//# sourceMappingURL=lazy-chunk-request-sign-transaction-bitcoin.es.js.map
