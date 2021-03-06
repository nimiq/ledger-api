import RequestBitcoin from './request-bitcoin';
import { AddressTypeBitcoin, Coin, Network, RequestTypeBitcoin } from '../../constants';
import { parseBip32Path } from '../../bip32-utils';
import ErrorState, { ErrorType } from '../../error-state';

type Transport = import('@ledgerhq/hw-transport').default;
type BitcoinJsTransaction = import('bitcoinjs-lib').Transaction;
type BitcoinLib = typeof import('./bitcoin-lib');
type CreateTransactionArg = Parameters<import('@ledgerhq/hw-app-btc').default['createPaymentTransactionNew']>[0];
// serializeTransactionOutputs is typed unnecessarily strict as it only uses the outputs of a transaction
type FixedSerializeTransactionOutputs =
    (tx: Pick<Parameters<import('@ledgerhq/hw-app-btc').default['serializeTransactionOutputs']>[0], 'outputs'>)
    => ReturnType<import('@ledgerhq/hw-app-btc').default['serializeTransactionOutputs']>;

export interface TransactionInfoBitcoin {
    // The inputs to consume for this transaction (prev outs). All inputs have to be of the same type (native segwit,
    // p2sh segwit or legacy), determined from their key paths.
    inputs: Array<{
        // full input transaction of which to take the output as input, either as serialized hex or in bitcoinjs-lib
        // transaction format
        transaction: string | BitcoinJsTransaction,
        // index of the transaction's output which is now to be used as input
        index: number,
        // bip32 path of the key which needs to sign for redeeming the input (e.g. the previous "recipient")
        keyPath: string,
        // hex, optional custom script to be signed for consuming an input. This can be a witness script for segwit
        // transactions (native segwit or p2sh segwit), or a redeem script for other p2sh transactions. Use this for
        // example to redeem from contracts or multisigs. For regular transaction you'll typically not need to set this
        // yourself as sensible defaults are used: for legacy transactions the prevOut output script is used; for segwit
        // transactions an appropriate default script from the public key at keyPath.
        customScript?: string,
        // optional sequence number to use for this input when using replace by fee (RBF)
        sequence?: number,
    }>;
    // the serialized outputs as hex or the separate outputs specified by amount and outputScript or address. Note that
    // if you are sending part of the funds back to an address as change, that output also needs to be included here.
    // Arbitrary output types can be used, also differing from input type and among themselves. Input coins which are
    // not sent to an output are considered fee.
    outputs: string | Array<{
        // amount in Satoshi; non-fractional positive number
        amount: number,
    } & ({
        outputScript: string, // hex encoded serialized output script
    } | {
        // bitcoin recipient address. This address gets transformed into an output script. If you already have the
        // output script available or a library loaded for calculating it, it's preferable to provide the outputScript
        // instead of the address to avoid the need to load an additional library for conversion here.
        address: string,
    })>;
    // optional bip32 path of potential change output. If your outputs include a change output back to this ledger, you
    // should specify that key's bip32 path here such that the Ledger can verify the change output's correctness and
    // doesn't need the user to confirm the change output. The change type can also be different than the input type.
    changePath?: string;
    // optional lockTime; 0 by default
    lockTime?: number;
    // optional hash type specifying how to sign the transaction, SIGHASH_ALL (0x01) by default. Before changing this,
    // make sure in https://github.com/LedgerHQ/app-bitcoin/blob/master/src/btchip_apdu_hash_sign.c that your desired
    // sigHashType is supported.
    sigHashType?: number;
    // Enforce input amount verification also for segwit inputs. Note that on Bitcoin app >= 1.4.0 a warning is
    // displayed on the Ledger screen for unverified native segwit inputs and that for app versions < 1.4.0 setting
    // useTrustedInputForSegwit is not supported. By default it's automatically set according to connected app version.
    useTrustedInputForSegwit?: false;
}

export default class RequestSignTransactionBitcoin extends RequestBitcoin<string> {
    public readonly type: RequestTypeBitcoin.SIGN_TRANSACTION = RequestTypeBitcoin.SIGN_TRANSACTION;
    public readonly transaction: TransactionInfoBitcoin;
    public readonly network: Network;
    private _inputType: AddressTypeBitcoin;

    constructor(transaction: TransactionInfoBitcoin, expectedWalletId?: string) {
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
            let network: Network | null = null;
            let inputType: AddressTypeBitcoin | null = null;
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
                if (keyPath === changePath) continue; // could still also be an input, but we ignore that corner case
                if (inputType && parsedKeyPath.addressType !== inputType) {
                    throw new Error('Must not use mixed input types');
                }
                inputType = parsedKeyPath.addressType;
            }
            this.network = network!;
            this._inputType = inputType!;
        } catch (e) {
            throw new ErrorState(
                ErrorType.REQUEST_ASSERTION_FAILED,
                `Invalid request: ${e.message || e}`,
                this,
            );
        }

        // Preload Bitcoin lib if needed. Ledger Bitcoin api is already preloaded by parent class. Ignore errors.
        this._loadBitcoinLibIfNeeded().catch(() => {});
    }

    public async call(transport: Transport): Promise<string> {
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
        let parsedTransaction: CreateTransactionArg;

        try {
            // parse into Ledger's CreateTransactionArg format
            const {
                inputs,
                outputs,
                changePath,
                lockTime,
                sigHashType,
                useTrustedInputForSegwit,
            } = this.transaction;

            parsedTransaction = {
                inputs: inputs.map(({ transaction, index, customScript, sequence }) => [
                    api.splitTransaction(
                        typeof transaction === 'string' ? transaction : transaction.toHex(),
                        // Set segwit support always to true because then transactions with and without witnesses are
                        // correctly parsed (compare bitcoinjs/transaction). Also we can't set it depending on whether
                        // our own input (transaction's output) is not segwit because it's input might be. Specifically
                        // fixes parsing legacy inputs which came from segwit inputs.
                        true,
                    ),
                    index,
                    customScript || null,
                    sequence || null,
                ]),
                associatedKeysets: inputs.map(({ keyPath }) => keyPath),
                outputScriptHex: typeof outputs === 'string'
                    ? outputs
                    : (api.serializeTransactionOutputs as FixedSerializeTransactionOutputs)({
                        outputs: outputs.map((output) => {
                            // inspired by how outputs are encoded in __toBuffer in bitcoinjs-lib/transaction.ts
                            const { amount } = output;
                            if (Math.floor(amount) !== amount || amount < 0 || amount > 21e9) {
                                throw new Error(`Invalid Satoshi amount: ${amount}`);
                            }
                            const amountBuffer = Buffer.alloc(8);
                            amountBuffer.writeInt32LE(amount & -1, 0); // eslint-disable-line no-bitwise
                            amountBuffer.writeUInt32LE(Math.floor(amount / 0x100000000), 4);

                            let outputScript: Buffer;
                            if ('outputScript' in output) {
                                outputScript = Buffer.from(output.outputScript, 'hex');
                            } else {
                                outputScript = bitcoinLib!.address.toOutputScript(
                                    output.address,
                                    this.network === Network.MAINNET
                                        ? bitcoinLib!.networks.bitcoin
                                        : bitcoinLib!.networks.testnet,
                                );
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
        } catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, e, this);
        }

        // Note: We make api calls outside of the try...catch block to let the exceptions fall through such that
        // _callLedger can decide how to behave depending on the api error.
        return api.createPaymentTransactionNew(parsedTransaction);
    }

    private async _loadBitcoinLibIfNeeded(): Promise<null | BitcoinLib> {
        // If we need bitcoinjs for address to output script conversion, load it.
        if (Array.isArray(this.transaction.outputs)
            && this.transaction.outputs.some((output) => 'address' in output && !!output.address)) {
            return this._loadBitcoinLib();
        }
        return null;
    }
}
