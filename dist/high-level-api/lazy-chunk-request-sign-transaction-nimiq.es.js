import { R as RequestWithKeyPathNimiq } from './lazy-chunk-request-with-key-path-nimiq.es.js';
import { NimiqVersion, RequestTypeNimiq, AccountTypeNimiq, Network, NetworkIdNimiq, TransactionFlagsNimiq, ErrorState, ErrorType } from './ledger-api.es.js';
import { i as isNimiqLegacy, a as isNimiqLegacyPrimitive } from './lazy-chunk-request-nimiq.es.js';
import './lazy-chunk-request.es.js';

function isTransactionInfoNimiqLegacy(transactionInfo) {
    return isNimiqLegacyPrimitive(transactionInfo.sender)
        && isNimiqLegacyPrimitive(transactionInfo.recipient);
}
class RequestSignTransactionNimiq extends RequestWithKeyPathNimiq {
    type;
    transaction;
    get minRequiredAppVersion() {
        return this.nimiqVersion === NimiqVersion.ALBATROSS
            ? '2.0' // first version supporting Albatross transactions
            : super.minRequiredAppVersion;
    }
    constructor(nimiqVersion, keyPath, transaction, expectedWalletId) {
        const type = RequestTypeNimiq.SIGN_TRANSACTION;
        super(nimiqVersion, keyPath, expectedWalletId, { type });
        this.type = type;
        this.transaction = transaction;
        // Preload Nimiq lib. Ledger Nimiq api is already preloaded by parent class. Ignore errors.
        this._loadNimiq().catch(() => { });
    }
    async call(transport) {
        const api = await this._getLowLevelApi(transport); // throws LOADING_DEPENDENCIES_FAILED on failure
        // Note: We make api calls outside of try...catch blocks to let the exceptions fall through such that
        // _callLedger can decide how to behave depending on the api error. All other errors are converted to
        // REQUEST_ASSERTION_FAILED errors which stop the execution of the request.
        const { publicKey: signerPubKeyBytes } = await api.getPublicKey(this.keyPath, true, // validate
        false, // display
        this.nimiqVersion);
        const Nimiq = await this._loadNimiq(); // throws LOADING_DEPENDENCIES_FAILED on failure
        let nimiqTx;
        try {
            const tx = this.transaction;
            const senderType = tx.senderType !== undefined && tx.senderType !== null
                ? tx.senderType
                : AccountTypeNimiq.BASIC;
            const recipientType = tx.recipientType !== undefined && tx.recipientType !== null
                ? tx.recipientType
                : AccountTypeNimiq.BASIC;
            let networkId;
            let { network } = tx;
            if (isNimiqLegacy(Nimiq)) {
                if (!network) {
                    try {
                        network = Nimiq.GenesisConfig.NETWORK_NAME;
                    }
                    catch (e) {
                        // Genesis config not initialized
                        network = Network.MAINNET;
                    }
                }
                const genesisConfig = Nimiq.GenesisConfig.CONFIGS[network];
                networkId = genesisConfig.NETWORK_ID;
            }
            else {
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
                    || flags !== Nimiq.Transaction.Flag.NONE) {
                    const extraData = tx.extraData ? tx.extraData : new Uint8Array(0);
                    nimiqTx = new Nimiq.ExtendedTransaction(tx.sender, senderType, tx.recipient, recipientType, tx.value, Number(fee), tx.validityStartHeight, flags, extraData, 
                    /* proof */ undefined, networkId);
                }
                else {
                    const signerPubKey = new Nimiq.PublicKey(signerPubKeyBytes);
                    nimiqTx = new Nimiq.BasicTransaction(signerPubKey, tx.recipient, tx.value, Number(fee), tx.validityStartHeight, 
                    /* signature */ undefined, networkId);
                }
            }
            else if (!isNimiqLegacy(Nimiq) && !isTransactionInfoNimiqLegacy(tx)) {
                nimiqTx = new Nimiq.Transaction(tx.sender, senderType, tx.senderData, tx.recipient, recipientType, tx.recipientData, tx.value, BigInt(fee), tx.flags, tx.validityStartHeight, networkId);
            }
            else {
                throw new Error('Invalid transactionInfo');
            }
        }
        catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, e instanceof Error ? e : String(e), this);
        }
        const { signature: signatureBytes, stakerSignature: stakerSignatureBytes, } = this.nimiqVersion === NimiqVersion.LEGACY
            ? await api.signTransaction(this.keyPath, nimiqTx.serializeContent(), this.nimiqVersion, this._coinAppConnection?.appVersion)
            : await api.signTransaction(this.keyPath, nimiqTx.serializeContent(), this.nimiqVersion);
        try {
            if (isNimiqLegacy(Nimiq)) {
                const signature = new Nimiq.Signature(signatureBytes);
                if (stakerSignatureBytes)
                    throw new Error('Unexpected staker signature on legacy transaction');
                if (nimiqTx instanceof Nimiq.BasicTransaction) {
                    nimiqTx.signature = signature;
                }
                else {
                    const signerPubKey = new Nimiq.PublicKey(signerPubKeyBytes);
                    nimiqTx.proof = Nimiq.SignatureProof.singleSig(signerPubKey, signature).serialize();
                }
            }
            else {
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
                    const stakerSignatureProofBytes = stakerSignatureProof.serialize();
                    if (nimiqTx.data.length < stakerSignatureProofBytes.length) {
                        throw new Error('Failed to overwrite staker signature proof');
                    }
                    nimiqTx.data.set(stakerSignatureProofBytes, nimiqTx.data.length - stakerSignatureProofBytes.length);
                    console.info('The staker signature proof was auto-generated and overwritten.');
                }
            }
        }
        catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, e instanceof Error ? e : String(e), this);
        }
        return nimiqTx;
    }
}

export { RequestSignTransactionNimiq as default };
//# sourceMappingURL=lazy-chunk-request-sign-transaction-nimiq.es.js.map
