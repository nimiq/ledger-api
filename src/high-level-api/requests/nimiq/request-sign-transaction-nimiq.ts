import RequestWithKeyPathNimiq from './request-with-key-path-nimiq';
import { RequestTypeNimiq, Network } from '../../constants';
import ErrorState, { ErrorType } from '../../error-state';

type Transport = import('@ledgerhq/hw-transport').default;
type Address = import('@nimiq/core-web').Address;
type AccountType = import('@nimiq/core-web').Account.Type;
type Transaction = import('@nimiq/core-web').Transaction;
type PublicKey = import('@nimiq/core-web').PublicKey;

export interface TransactionInfoNimiq {
    sender: Address;
    senderType?: AccountType;
    recipient: Address;
    recipientType?: AccountType;
    value: number; // In Luna
    fee?: number;
    validityStartHeight: number;
    network?: Network;
    flags?: number;
    extraData?: Uint8Array;
}

export default class RequestSignTransactionNimiq extends RequestWithKeyPathNimiq<Transaction> {
    public readonly type: RequestTypeNimiq.SIGN_TRANSACTION;
    public readonly transaction: TransactionInfoNimiq;

    constructor(keyPath: string, transaction: TransactionInfoNimiq, expectedWalletId?: string) {
        const type = RequestTypeNimiq.SIGN_TRANSACTION;
        super(keyPath, expectedWalletId, { type });
        this.type = type;
        this.transaction = transaction;

        // Preload Nimiq lib. Ledger Nimiq api is already preloaded by parent class. Ignore errors.
        this._loadNimiq().catch(() => {});
    }

    public async call(transport: Transport): Promise<Transaction> {
        const api = await this._getLowLevelApi(transport); // throws LOADING_DEPENDENCIES_FAILED on failure
        // Note: We make api calls outside of try...catch blocks to let the exceptions fall through such that
        // _callLedger can decide how to behave depending on the api error. All other errors are converted to
        // REQUEST_ASSERTION_FAILED errors which stop the execution of the request.
        const { publicKey: signerPubKeyBytes } = await api.getPublicKey(
            this.keyPath,
            true, // validate
            false, // display
        );

        const Nimiq = await this._loadNimiq(); // throws LOADING_DEPENDENCIES_FAILED on failure

        let nimiqTx: Transaction;
        let signerPubKey: PublicKey;
        try {
            const tx = this.transaction;
            signerPubKey = new Nimiq.PublicKey(signerPubKeyBytes);

            const senderType = tx.senderType !== undefined && tx.senderType !== null
                ? tx.senderType
                : Nimiq.Account.Type.BASIC;

            const recipientType = tx.recipientType !== undefined && tx.recipientType !== null
                ? tx.recipientType
                : Nimiq.Account.Type.BASIC;

            let { network } = tx;
            if (!network) {
                try {
                    network = Nimiq.GenesisConfig.NETWORK_NAME as Network;
                } catch (e) {
                    // Genesis config not initialized
                    network = Network.MAINNET;
                }
            }

            const genesisConfig = Nimiq.GenesisConfig.CONFIGS[network];
            const networkId = genesisConfig.NETWORK_ID;

            const flags = tx.flags !== undefined && tx.flags !== null
                ? tx.flags
                : Nimiq.Transaction.Flag.NONE;
            const fee = tx.fee || 0;

            if ((tx.extraData && tx.extraData.length !== 0)
                || senderType !== Nimiq.Account.Type.BASIC
                || recipientType !== Nimiq.Account.Type.BASIC
                || flags !== Nimiq.Transaction.Flag.NONE
            ) {
                const extraData = tx.extraData ? tx.extraData : new Uint8Array(0);
                nimiqTx = new Nimiq.ExtendedTransaction(tx.sender, senderType, tx.recipient,
                    recipientType, tx.value, fee, tx.validityStartHeight, flags, extraData,
                    /* proof */ undefined, networkId);
            } else {
                nimiqTx = new Nimiq.BasicTransaction(signerPubKey, tx.recipient, tx.value,
                    fee, tx.validityStartHeight, /* signature */ undefined, networkId);
            }
        } catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, e instanceof Error ? e : String(e), this);
        }

        const { signature: signatureBytes } = await api.signTransaction(
            this.keyPath,
            nimiqTx.serializeContent(),
        );

        try {
            const signature = new Nimiq.Signature(signatureBytes);

            if (nimiqTx instanceof Nimiq.BasicTransaction) {
                nimiqTx.signature = signature;
            } else {
                nimiqTx.proof = Nimiq.SignatureProof.singleSig(signerPubKey!, signature).serialize();
            }
        } catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, e instanceof Error ? e : String(e), this);
        }

        return nimiqTx;
    }
}
