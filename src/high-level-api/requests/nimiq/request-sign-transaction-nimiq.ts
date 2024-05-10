import RequestWithKeyPathNimiq from './request-with-key-path-nimiq';
import { RequestTypeNimiq, Network, NetworkIdNimiq, AccountTypeNimiq, TransactionFlagsNimiq } from '../../constants';
import ErrorState, { ErrorType } from '../../error-state';
import { NimiqVersion } from '../../../lib/constants';
import { isNimiqLegacy, isNimiqLegacyPrimitive, type NimiqPrimitive } from '../../../lib/load-nimiq';

type Transport = import('@ledgerhq/hw-transport').default;

export type TransactionInfoNimiq<Version extends NimiqVersion> = {
    sender: NimiqPrimitive<'Address', Version>,
    recipient: NimiqPrimitive<'Address', Version>,
    value: number, // In Luna
    fee?: number,
    validityStartHeight: number,
    network?: Network,
    flags?: number,
} & (Version extends NimiqVersion.ALBATROSS ? {
    senderType?: AccountTypeNimiq,
    senderData?: Uint8Array,
    recipientType?: AccountTypeNimiq,
    recipientData?: Uint8Array,
} : {
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

        // Preload Nimiq lib. Ledger Nimiq api is already preloaded by parent class. Ignore errors.
        this._loadNimiq().catch(() => {});
    }

    public async call(transport: Transport): Promise<NimiqPrimitive<'Transaction', Version>> {
        const api = await this._getLowLevelApi(transport); // throws LOADING_DEPENDENCIES_FAILED on failure
        // Note: We make api calls outside of try...catch blocks to let the exceptions fall through such that
        // _callLedger can decide how to behave depending on the api error. All other errors are converted to
        // REQUEST_ASSERTION_FAILED errors which stop the execution of the request.
        const { publicKey: signerPubKeyBytes } = await api.getPublicKey(
            this.keyPath,
            true, // validate
            false, // display
            this.nimiqVersion,
        );

        const Nimiq = await this._loadNimiq(); // throws LOADING_DEPENDENCIES_FAILED on failure

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
                        tx.value, fee, tx.validityStartHeight, flags, extraData, /* proof */ undefined, networkId,
                    );
                } else {
                    const signerPubKey = new Nimiq.PublicKey(signerPubKeyBytes);
                    nimiqTx = new Nimiq.BasicTransaction(
                        signerPubKey, tx.recipient,
                        tx.value, fee, tx.validityStartHeight, /* signature */ undefined, networkId,
                    );
                }
            } else if (!isNimiqLegacy(Nimiq) && !isTransactionInfoNimiqLegacy(tx)) {
                nimiqTx = new Nimiq.Transaction(
                    tx.sender, senderType, tx.senderData,
                    tx.recipient, recipientType, tx.recipientData,
                    BigInt(tx.value), BigInt(fee), tx.flags, tx.validityStartHeight, networkId,
                );
            } else {
                throw new Error('Invalid transactionInfo');
            }
        } catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, e instanceof Error ? e : String(e), this);
        }

        const { signature: signatureBytes } = await api.signTransaction(
            this.keyPath,
            nimiqTx.serializeContent(),
        );

        try {
            if (isNimiqLegacy(Nimiq)) {
                const signature = new Nimiq.Signature(signatureBytes);
                if (nimiqTx instanceof Nimiq.BasicTransaction) {
                    nimiqTx.signature = signature;
                } else {
                    const signerPubKey = new Nimiq.PublicKey(signerPubKeyBytes);
                    nimiqTx.proof = Nimiq.SignatureProof.singleSig(signerPubKey, signature).serialize();
                }
            } else {
                const signature = Nimiq.Signature.fromBytes(signatureBytes);
                const signerPubKey = new Nimiq.PublicKey(signerPubKeyBytes);
                nimiqTx.proof = Nimiq.SignatureProof.singleSig(signerPubKey, signature).serialize();
            }
        } catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, e instanceof Error ? e : String(e), this);
        }

        return nimiqTx as NimiqPrimitive<'Transaction', Version>;
    }
}
