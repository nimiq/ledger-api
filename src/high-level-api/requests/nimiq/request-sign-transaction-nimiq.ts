import RequestWithKeyPathNimiq from './request-with-key-path-nimiq';
import { RequestTypeNimiq, Network, NetworkIdNimiq, AccountTypeNimiq, TransactionFlagsNimiq } from '../../constants';
import ErrorState, { ErrorType } from '../../error-state';
import { NimiqVersion } from '../../../lib/constants';
import {
    loadNimiq,
    isNimiqLegacy,
    isNimiqLegacyPrimitive,
    type Nimiq,
    type NimiqPrimitive,
} from '../../../lib/load-nimiq';

type Transport = import('@ledgerhq/hw-transport').default;

export type TransactionInfoNimiq<Version extends NimiqVersion> = {
    sender: NimiqPrimitive<'Address', Version>,
    recipient: NimiqPrimitive<'Address', Version>,
    validityStartHeight: number,
    network?: Network,
    flags?: number,
} & (Version extends NimiqVersion.ALBATROSS ? {
    value: bigint, // In Luna
    fee?: bigint,
    senderType?: AccountTypeNimiq,
    senderData?: Uint8Array,
    recipientType?: AccountTypeNimiq,
    recipientData?: Uint8Array,
} : {
    value: number, // In Luna
    fee?: number,
    senderType?: Exclude<AccountTypeNimiq, AccountTypeNimiq.STAKING>,
    recipientType?: Exclude<AccountTypeNimiq, AccountTypeNimiq.STAKING>,
    extraData?: Uint8Array,
});

function isTransactionInfoNimiqLegacy(transactionInfo: TransactionInfoNimiq<NimiqVersion>)
    : transactionInfo is TransactionInfoNimiq<NimiqVersion.LEGACY> {
    return isNimiqLegacyPrimitive<'Address'>(transactionInfo.sender)
        && isNimiqLegacyPrimitive<'Address'>(transactionInfo.recipient);
}

export default class RequestSignTransactionNimiq<Version extends NimiqVersion>
    extends RequestWithKeyPathNimiq<Version, NimiqPrimitive<'Transaction', Version>> {
    public readonly type: RequestTypeNimiq.SIGN_TRANSACTION;
    public readonly transaction: TransactionInfoNimiq<Version>;

    public get minRequiredAppVersion(): string {
        return this.nimiqVersion === NimiqVersion.ALBATROSS
            ? '2.0' // first version supporting Albatross transactions
            : super.minRequiredAppVersion;
    }

    constructor(
        nimiqVersion: Version,
        keyPath: string,
        transaction: TransactionInfoNimiq<Version>,
        expectedWalletId?: string,
    ) {
        const type = RequestTypeNimiq.SIGN_TRANSACTION;
        super(nimiqVersion, keyPath, expectedWalletId, { type });
        this.type = type;
        this.transaction = transaction;
    }

    public async call(transport: Transport): Promise<NimiqPrimitive<'Transaction', Version>> {
        // These throw LOADING_DEPENDENCIES_FAILED on failure.
        const [api, { Nimiq }] = await Promise.all([this._getLowLevelApi(transport), this._loadDependencies()]);

        // Note: We make api calls outside try...catch blocks to let the exceptions fall through such that _callLedger
        // can decide how to behave depending on the api error. Other errors are converted to REQUEST_ASSERTION_FAILED
        // errors which stop the execution of the request.
        const { publicKey: signerPubKeyBytes } = await api.getPublicKey(
            this.keyPath,
            true, // validate
            false, // display
            this.nimiqVersion,
        );

        let nimiqTx: NimiqPrimitive<'Transaction', NimiqVersion>;
        try {
            const tx = this.transaction as
                TransactionInfoNimiq<NimiqVersion.ALBATROSS> | TransactionInfoNimiq<NimiqVersion.LEGACY>;

            const senderType = tx.senderType !== undefined && tx.senderType !== null
                ? tx.senderType
                : AccountTypeNimiq.BASIC;

            const recipientType = tx.recipientType !== undefined && tx.recipientType !== null
                ? tx.recipientType
                : AccountTypeNimiq.BASIC;

            let networkId: number;
            let { network } = tx;
            if (isNimiqLegacy(Nimiq)) {
                if (!network) {
                    try {
                        network = Nimiq.GenesisConfig.NETWORK_NAME as Network;
                    } catch (e) {
                        // Genesis config not initialized
                        network = Network.MAINNET;
                    }
                }
                const genesisConfig = Nimiq.GenesisConfig.CONFIGS[network];
                networkId = genesisConfig.NETWORK_ID;
            } else {
                if (!network) {
                    network = /testnet|localhost|bs-local\.com/.test(window.location.hostname)
                        ? Network.TESTNET
                        : Network.MAINNET;
                }
                networkId = NetworkIdNimiq[network];
            }

            const flags = tx.flags !== undefined && tx.flags !== null ? tx.flags : TransactionFlagsNimiq.NONE;
            const fee = tx.fee || 0;

            if (isNimiqLegacy(Nimiq) && isTransactionInfoNimiqLegacy(tx)) {
                if ((tx.extraData && tx.extraData.length !== 0)
                    || senderType !== Nimiq.Account.Type.BASIC
                    || recipientType !== Nimiq.Account.Type.BASIC
                    || flags !== Nimiq.Transaction.Flag.NONE
                ) {
                    const extraData = tx.extraData ? tx.extraData : new Uint8Array(0);
                    nimiqTx = new Nimiq.ExtendedTransaction(
                        tx.sender, senderType as NonNullable<typeof tx.senderType>,
                        tx.recipient, recipientType as NonNullable<typeof tx.recipientType>,
                        tx.value, Number(fee), tx.validityStartHeight, flags, extraData,
                        /* proof */ undefined, networkId,
                    );
                } else {
                    const signerPubKey = new Nimiq.PublicKey(signerPubKeyBytes);
                    nimiqTx = new Nimiq.BasicTransaction(
                        signerPubKey, tx.recipient,
                        tx.value, Number(fee), tx.validityStartHeight,
                        /* signature */ undefined, networkId,
                    );
                }
            } else if (!isNimiqLegacy(Nimiq) && !isTransactionInfoNimiqLegacy(tx)) {
                nimiqTx = new Nimiq.Transaction(
                    tx.sender, senderType, tx.senderData,
                    tx.recipient, recipientType, tx.recipientData,
                    tx.value, BigInt(fee), tx.flags,
                    tx.validityStartHeight, networkId,
                );
            } else {
                throw new Error('Invalid transactionInfo');
            }
        } catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, e instanceof Error ? e : String(e), this);
        }

        const {
            signature: signatureBytes,
            stakerSignature: stakerSignatureBytes,
        } = this.nimiqVersion === NimiqVersion.LEGACY
            ? await api.signTransaction(
                this.keyPath,
                nimiqTx.serializeContent(),
                this.nimiqVersion,
                this._coinAppConnection?.appVersion,
            )
            : await api.signTransaction(
                this.keyPath,
                nimiqTx.serializeContent(),
                this.nimiqVersion,
            );

        try {
            if (isNimiqLegacy(Nimiq)) {
                const signature = new Nimiq.Signature(signatureBytes);
                if (stakerSignatureBytes) throw new Error('Unexpected staker signature on legacy transaction');
                if (nimiqTx instanceof Nimiq.BasicTransaction) {
                    nimiqTx.signature = signature;
                } else {
                    const signerPubKey = new Nimiq.PublicKey(signerPubKeyBytes);
                    nimiqTx.proof = Nimiq.SignatureProof.singleSig(signerPubKey, signature).serialize();
                }
            } else {
                const signerPubKey = new Nimiq.PublicKey(signerPubKeyBytes);
                const signature = Nimiq.Signature.deserialize(signatureBytes);
                nimiqTx.proof = Nimiq.SignatureProof.singleSig(signerPubKey, signature).serialize();
                if (stakerSignatureBytes) {
                    // The Ledger app created a staker signature, which means it's a staking transaction with a staker
                    // signature proof in its recipient data but for which the empty default signature proof was passed,
                    // such that the Ledger created the staker signature with the same private key as staker private key
                    // as the transaction sender key.
                    const stakerSignature = Nimiq.Signature.deserialize(stakerSignatureBytes);
                    const stakerSignatureProof = Nimiq.SignatureProof.singleSig(signerPubKey, stakerSignature);
                    // Overwrite the empty default signature proof in the staking transaction's recipient data. The
                    // signature proof is always at the very end of the recipient data, for recipient data which include
                    // a signature proof. Note that both, the empty default signature proof and the staker signature
                    // proof created by the Ledger app are basic single signature proofs of the same size.
                    const recipientData = nimiqTx.data; // creates a copy of the data
                    const stakerSignatureProofBytes = stakerSignatureProof.serialize();
                    if (recipientData.length < stakerSignatureProofBytes.length) {
                        throw new Error('Failed to overwrite staker signature proof');
                    }
                    recipientData.set(
                        stakerSignatureProofBytes,
                        recipientData.length - stakerSignatureProofBytes.length,
                    );
                    nimiqTx.data = recipientData; // update the data on the transaction
                    console.info('The staker signature proof was auto-generated and overwritten.');
                }
            }
        } catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, e instanceof Error ? e : String(e), this);
        }

        return nimiqTx as NimiqPrimitive<'Transaction', Version>;
    }

    protected async _loadDependencies(): Promise<{
        Nimiq: Nimiq<Version>,
    } & Omit<Awaited<ReturnType<RequestWithKeyPathNimiq<any, any>['_loadDependencies']>>, 'Nimiq'>> {
        const [parentDependencies, Nimiq] = await Promise.all([
            super._loadDependencies(),
            // Note: pub key to address derivation in SignatureProof and BasicTransaction.
            this._loadDependency(loadNimiq(this.nimiqVersion, /* include cryptography */ true)),
        ]);
        return { ...parentDependencies, Nimiq };
    }
}
