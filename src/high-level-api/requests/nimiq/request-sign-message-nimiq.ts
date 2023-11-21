import RequestWithKeyPathNimiq from './request-with-key-path-nimiq';
import { RequestTypeNimiq } from '../../constants';
import ErrorState, { ErrorType } from '../../error-state';

type Transport = import('@ledgerhq/hw-transport').default;
type PublicKey = import('@nimiq/core-web').PublicKey;
type Signature = import('@nimiq/core-web').Signature;
type MessageSignatureInfo = {
    signer: PublicKey,
    signature: Signature,
};

export default class RequestSignMessageNimiq extends RequestWithKeyPathNimiq<MessageSignatureInfo> {
    public readonly type: RequestTypeNimiq.SIGN_MESSAGE;
    public readonly message: string | Uint8Array; // utf8 string or Uint8Array of arbitrary data
    public readonly flags?: number | {
        preferDisplayTypeHex: boolean, // first choice, if multiple flags are set
        preferDisplayTypeHash: boolean, // second choice, if multiple flags are set
    };

    constructor(keyPath: string, message: string | Uint8Array, flags?: RequestSignMessageNimiq['flags'],
        expectedWalletId?: string) {
        const type = RequestTypeNimiq.SIGN_MESSAGE;
        super(keyPath, expectedWalletId, { type, message, flags });
        this.type = type;
        this.message = message;
        this.flags = flags;

        // Preload Nimiq lib. Ledger Nimiq api is already preloaded by parent class. Ignore errors.
        this._loadNimiq().catch(() => {});
    }

    public async call(transport: Transport): Promise<MessageSignatureInfo> {
        const api = await this._getLowLevelApi(transport); // throws LOADING_DEPENDENCIES_FAILED on failure

        let messageBuffer: Buffer;
        try {
            messageBuffer = typeof this.message === 'string'
                ? Buffer.from(this.message, 'utf8') // throws if invalid utf8
                : Buffer.from(this.message);

            if (messageBuffer.length >= 2 ** 32) {
                // the message length must fit an uint32
                throw new Error('Message too long');
            }
        } catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, e instanceof Error ? e : String(e), this);
        }

        const { publicKey } = await api.getPublicKey(
            this.keyPath,
            true, // validate
            false, // display
        );
        const { signature } = await api.signMessage(
            this.keyPath,
            messageBuffer,
            this.flags,
        );

        const Nimiq = await this._loadNimiq(); // throws LOADING_DEPENDENCIES_FAILED on failure; preload in constructor

        return {
            signer: new Nimiq.PublicKey(publicKey),
            signature: new Nimiq.Signature(signature),
        };
    }
}
