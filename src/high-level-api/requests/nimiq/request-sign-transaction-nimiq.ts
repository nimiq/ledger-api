import RequestWithKeyPathNimiq from './request-with-key-path-nimiq';
import { RequestTypeNimiq, Network, NetworkIdNimiq, AccountTypeNimiq, TransactionFlagsNimiq } from '../../constants';
import ErrorState, { ErrorType } from '../../error-state';
import { NimiqVersion } from '../../../shared/constants';
import { loadNimiq, type Nimiq, type NimiqPrimitive } from '../../../shared/load-nimiq';

type Transport = import('@ledgerhq/hw-transport').default;

// The Version type parameter is kept for backwards compatibility. NimiqVersion.ALBATROSS is the only version.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type TransactionInfoNimiq<Version extends NimiqVersion = NimiqVersion> = {
    sender: NimiqPrimitive<'Address'>,
    recipient: NimiqPrimitive<'Address'>,
    validityStartHeight: number,
    network?: Network,
    flags?: number,
    value: bigint, // In Luna
    fee?: bigint,
    senderType?: AccountTypeNimiq,
    senderData?: Uint8Array,
    recipientType?: AccountTypeNimiq,
    recipientData?: Uint8Array,
};

export default class RequestSignTransactionNimiq extends RequestWithKeyPathNimiq<NimiqPrimitive<'Transaction'>> {
    public readonly type: RequestTypeNimiq.SIGN_TRANSACTION;
    public readonly transaction: TransactionInfoNimiq;

    public get minRequiredAppVersion(): string {
        return '2.0'; // first version supporting Albatross transactions
    }

    constructor(
        nimiqVersion: NimiqVersion,
        keyPath: string,
        transaction: TransactionInfoNimiq,
        expectedWalletId?: string,
    ) {
        const type = RequestTypeNimiq.SIGN_TRANSACTION;
        super(nimiqVersion, keyPath, expectedWalletId, { type });
        this.type = type;
        this.transaction = transaction;
    }

    public async call(transport: Transport): Promise<NimiqPrimitive<'Transaction'>> {
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

        let nimiqTx: NimiqPrimitive<'Transaction'>;
        try {
            const tx = this.transaction;
            const network = tx.network || (/testnet|localhost|bs-local\.com/.test(window.location.hostname)
                ? Network.TESTNET
                : Network.MAINNET);
            nimiqTx = new Nimiq.Transaction(
                tx.sender, tx.senderType ?? AccountTypeNimiq.BASIC, tx.senderData,
                tx.recipient, tx.recipientType ?? AccountTypeNimiq.BASIC, tx.recipientData,
                tx.value, BigInt(tx.fee || 0), tx.flags ?? TransactionFlagsNimiq.NONE,
                tx.validityStartHeight, NetworkIdNimiq[network],
            );
        } catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, e instanceof Error ? e : String(e), this);
        }

        const {
            signature: signatureBytes,
            stakerSignature: stakerSignatureBytes,
        } = await api.signTransaction(this.keyPath, nimiqTx.serializeContent(), this.nimiqVersion);

        try {
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
        } catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, e instanceof Error ? e : String(e), this);
        }

        return nimiqTx;
    }

    protected async _loadDependencies(): Promise<{
        Nimiq: Nimiq,
    } & Awaited<ReturnType<RequestWithKeyPathNimiq<unknown>['_loadDependencies']>>> {
        const [parentDependencies, Nimiq] = await Promise.all([
            super._loadDependencies(),
            this._loadDependency(loadNimiq()),
        ]);
        return { ...parentDependencies, Nimiq };
    }
}
