import { b as buffer } from './lazy-chunk-index.es.js';
import { R as RequestWithKeyPathNimiq } from './lazy-chunk-request-with-key-path-nimiq.es.js';
import { RequestTypeNimiq, ErrorState, ErrorType } from './ledger-api.es.js';
import { i as isNimiqLegacy } from './lazy-chunk-request-nimiq.es.js';
import './lazy-chunk-request.es.js';

class RequestSignMessageNimiq extends RequestWithKeyPathNimiq {
    type;
    message; // utf8 string or Uint8Array of arbitrary data
    flags;
    get minRequiredAppVersion() {
        return '2.0'; // first version supporting message signing
    }
    constructor(nimiqVersion, keyPath, message, flags, expectedWalletId) {
        const type = RequestTypeNimiq.SIGN_MESSAGE;
        super(nimiqVersion, keyPath, expectedWalletId, { type, message, flags });
        this.type = type;
        this.message = message;
        this.flags = flags;
        // Preload Nimiq lib. Ledger Nimiq api is already preloaded by parent class. Ignore errors.
        this._loadNimiq().catch(() => { });
    }
    async call(transport) {
        const api = await this._getLowLevelApi(transport); // throws LOADING_DEPENDENCIES_FAILED on failure
        let messageBuffer;
        try {
            messageBuffer = typeof this.message === 'string'
                ? buffer.Buffer.from(this.message, 'utf8') // throws if invalid utf8
                : buffer.Buffer.from(this.message);
            if (messageBuffer.length >= 2 ** 32) {
                // the message length must fit an uint32
                throw new Error('Message too long');
            }
        }
        catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, e instanceof Error ? e : String(e), this);
        }
        const { publicKey } = await api.getPublicKey(this.keyPath, true, // validate
        false, // display
        this.nimiqVersion);
        const { signature } = await api.signMessage(this.keyPath, messageBuffer, this.flags);
        const Nimiq = await this._loadNimiq(); // throws LOADING_DEPENDENCIES_FAILED on failure; preload in constructor
        return {
            signer: new Nimiq.PublicKey(publicKey),
            signature: isNimiqLegacy(Nimiq) ? new Nimiq.Signature(signature) : Nimiq.Signature.deserialize(signature),
        };
    }
}

export { RequestSignMessageNimiq as default };
//# sourceMappingURL=lazy-chunk-request-sign-message-nimiq.es.js.map
