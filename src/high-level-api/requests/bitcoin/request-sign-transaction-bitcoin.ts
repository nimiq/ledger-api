import RequestBitcoin from './request-bitcoin';
import { Coin, RequestTypeBitcoin } from '../../constants';
import { parseBip32Path } from '../../bip32-utils';
import ErrorState, { ErrorType } from '../../error-state';

type Transport = import('@ledgerhq/hw-transport').default;
type CreateTransactionArg = Parameters<import('@ledgerhq/hw-app-btc').default['createPaymentTransactionNew']>[0];
// serializeTransactionOutputs is typed unnecessarily strict as it only uses the outputs of a transaction
type FixedSerializeTransactionOutputs =
    (tx: Pick<Parameters<import('@ledgerhq/hw-app-btc').default['serializeTransactionOutputs']>[0], 'outputs'>)
    => ReturnType<import('@ledgerhq/hw-app-btc').default['serializeTransactionOutputs']>;

export interface TransactionInfoBitcoin {
    // The inputs to consume for this transaction (prev outs)
    inputs: Array<{
        // hex of the full transaction of which to take the output as input
        transaction: string,
        // index of the transaction's output which is now to be used as input
        index: number,
        // bip32 path of the key which is able to redeem the input (the previous "recipient")
        keyPath: string,
        // hex, optional redeem script to use when consuming a Segregated Witness input. You'll typically not need to
        // set this yourself as the ledger lib generates the appropriate default script from the public key at keyPath.
        redeemScript?: string,
        // optional sequence number to use for this input when using replace by fee (RBF)
        sequence?: number,
    }>;
    // the serialized outputs as hex or the separate outputs specified by amount and outputScript. Note that if you are
    // sending part of the funds back to an address as change, that output also needs to be included here. Input coins
    // which are not sent to an output are considered as fee.
    outputs: string | Array<{
        amount: number, // in Satoshi; non-fractional and non-negative
        outputScript: string, // hex encoded serialized output script
    }>;
    // optional bip32 path of potential change output. If your outputs include a change output back to this ledger, you
    // should specify that key's bip32 path here such that the Ledger can verify the change output's correctness and
    // doesn't need the user to confirm the change output.
    changePath?: string;
    // optional lockTime; 0 by default
    lockTime?: number;
    // optional hash type specifying how to sign the transaction, SIGHASH_ALL (0x01) by default. Before changing this,
    // make sure in https://github.com/LedgerHQ/app-bitcoin/blob/master/src/btchip_apdu_hash_sign.c that your desired
    // sigHashType is supported.
    sigHashType?: number;
    // use segwit? Set to true if your input is segwit, false by default
    segwit?: boolean;
    // set true if input is from native segwit prevouts (bech32 address), false by default
    nativeSegwitInput?: boolean;
    // Enforce input amount verification also for segwit inputs. Note that on Bitcoin app >= 1.4.0 a warning is
    // displayed on the Ledger screen for unverified native segwit inputs and that for app versions < 1.4.0 setting
    // useTrustedInputForSegwit is not supported. By default it's automatically set according to connected app version.
    useTrustedInputForSegwit?: false;
}

export default class RequestSignTransactionBitcoin extends RequestBitcoin<string> {
    public readonly transaction: TransactionInfoBitcoin;

    constructor(transaction: TransactionInfoBitcoin, walletId?: string) {
        super(RequestTypeBitcoin.SIGN_TRANSACTION, walletId);

        this.transaction = transaction;

        try {
            // verify key paths
            // TODO mainnet and testnet BTC app are both able to sign mainnet and testnet transactions and generate the
            //  same signature, however they display the address only in the respective format of the network they are
            //  intended for, therefore using them interchangeably should be blocked.
            // TODO Legacy and P2SH addresses supported?
            if (transaction.changePath && parseBip32Path(transaction.changePath).coin !== Coin.BITCOIN) {
                throw new Error(`${transaction.changePath} not a Bitcoin bip32 path following bip44`);
            }
            for (const { keyPath } of transaction.inputs) {
                if (parseBip32Path(keyPath).coin !== Coin.BITCOIN) {
                    throw new Error(`${keyPath} not a Bitcoin bip32 path following bip44`);
                }
            }
        } catch (e) {
            throw new ErrorState(
                ErrorType.REQUEST_ASSERTION_FAILED,
                `Invalid keyPath: ${e.message || e}`,
                this,
            );
        }
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

        const api = await RequestBitcoin._getLowLevelApi(transport);
        let parsedTransaction: CreateTransactionArg;

        try {
            // parse into Ledger's CreateTransactionArg format
            const {
                inputs,
                outputs,
                changePath,
                lockTime,
                sigHashType,
                segwit,
                nativeSegwitInput,
                useTrustedInputForSegwit,
            } = this.transaction;

            parsedTransaction = {
                inputs: inputs.map(({ transaction, index, redeemScript, sequence }) => [
                    api.splitTransaction(transaction, segwit),
                    index,
                    redeemScript || null,
                    sequence || null,
                ]),
                associatedKeysets: inputs.map(({ keyPath }) => keyPath),
                outputScriptHex: typeof outputs === 'string'
                    ? outputs
                    : (api.serializeTransactionOutputs as FixedSerializeTransactionOutputs)({
                        outputs: outputs.map((output) => {
                            // inspired by how outputs are encoded in __toBuffer in bitcoinjs-lib/transaction.ts
                            const { amount, outputScript } = output;
                            if (Math.floor(amount) !== amount || amount < 0 || amount > 21e9) {
                                throw new Error(`Invalid Satoshi amount: ${amount}`);
                            }
                            const amountBuffer = Buffer.alloc(8);
                            amountBuffer.writeInt32LE(amount & -1, 0); // eslint-disable-line no-bitwise
                            amountBuffer.writeUInt32LE(Math.floor(amount / 0x100000000), 4);
                            const scriptBuffer = Buffer.from(outputScript, 'hex');
                            return { amount: amountBuffer, script: scriptBuffer };
                        }),
                    }).toString('hex'),
                additionals: nativeSegwitInput ? ['bech32'] : [],
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
            if (segwit !== undefined && segwit !== null) {
                parsedTransaction.segwit = segwit;
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
}
