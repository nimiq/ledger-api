import RequestWithKeyPathNimiq from './request-with-key-path-nimiq';
import { RequestTypeNimiq } from '../../constants';
import ErrorState, { ErrorType } from '../../error-state';
import { NimiqVersion } from '../../../lib/constants';
import { loadNimiq, isNimiqLegacy, type Nimiq, type NimiqPrimitive } from '../../../lib/load-nimiq';
import { bufferFromUtf8 } from '../../../lib/buffer-utils';

type Transport = import('@ledgerhq/hw-transport').default;
export type MessageSignatureInfoNimiq<Version extends NimiqVersion> = {
    signer: NimiqPrimitive<'PublicKey', Version>,
    signature: NimiqPrimitive<'Signature', Version>,
};

export default class RequestSignMessageNimiq<Version extends NimiqVersion>
    extends RequestWithKeyPathNimiq<Version, MessageSignatureInfoNimiq<Version>> {
    public readonly type: RequestTypeNimiq.SIGN_MESSAGE;
    public readonly message: string | Uint8Array; // utf8 string or Uint8Array of arbitrary data
    public readonly flags?: number | {
        preferDisplayTypeHex: boolean, // first choice, if multiple flags are set
        preferDisplayTypeHash: boolean, // second choice, if multiple flags are set
    };

    public get minRequiredAppVersion(): string {
        return '2.0'; // first version supporting message signing
    }

    constructor(
        nimiqVersion: Version,
        keyPath: string,
        message: string | Uint8Array,
        flags?: RequestSignMessageNimiq<Version>['flags'],
        expectedWalletId?: string,
    ) {
        const type = RequestTypeNimiq.SIGN_MESSAGE;
        super(nimiqVersion, keyPath, expectedWalletId, { type, message, flags });
        this.type = type;
        this.message = message;
        this.flags = flags;
    }

    public async call(transport: Transport): Promise<MessageSignatureInfoNimiq<Version>> {
        // These throw LOADING_DEPENDENCIES_FAILED on failure.
        const [api, { Nimiq }] = await Promise.all([this._getLowLevelApi(transport), this._loadDependencies()]);

        let messageBytes: Uint8Array;
        try {
            messageBytes = typeof this.message === 'string' ? bufferFromUtf8(this.message) : this.message;

            if (messageBytes.length >= 2 ** 32) {
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
            this.nimiqVersion,
        );
        const { signature } = await api.signMessage(
            this.keyPath,
            messageBytes,
            this.flags,
        );

        return {
            signer: new Nimiq.PublicKey(publicKey),
            signature: isNimiqLegacy(Nimiq) ? new Nimiq.Signature(signature) : Nimiq.Signature.deserialize(signature),
        } as MessageSignatureInfoNimiq<Version>;
    }

    protected async _loadDependencies(): Promise<{
        Nimiq: Nimiq<Version>,
    } & Awaited<ReturnType<RequestWithKeyPathNimiq<any, any>['_loadDependencies']>>> {
        const [parentDependencies, Nimiq] = await Promise.all([
            super._loadDependencies(),
            this._loadDependency(loadNimiq(this.nimiqVersion, /* include cryptography */ false)),
        ]);
        return { ...parentDependencies, Nimiq };
    }
}
