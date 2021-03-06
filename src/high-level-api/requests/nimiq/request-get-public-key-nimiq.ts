import RequestWithKeyPathNimiq from './request-with-key-path-nimiq';
import { RequestTypeNimiq } from '../../constants';

type Transport = import('@ledgerhq/hw-transport').default;
type PublicKey = import('@nimiq/core-web').PublicKey;

export default class RequestGetPublicKeyNimiq extends RequestWithKeyPathNimiq<PublicKey> {
    public readonly type: RequestTypeNimiq.GET_PUBLIC_KEY;

    constructor(keyPath: string, expectedWalletId?: string) {
        const type = RequestTypeNimiq.GET_PUBLIC_KEY;
        super(keyPath, expectedWalletId, { type });
        this.type = type;

        // Preload Nimiq lib. Ledger Nimiq api is already preloaded by parent class. Ignore errors.
        this._loadNimiq().catch(() => {});
    }

    public async call(transport: Transport): Promise<PublicKey> {
        const api = await this._getLowLevelApi(transport); // throws LOADING_DEPENDENCIES_FAILED on failure
        const { publicKey } = await api.getPublicKey(
            this.keyPath,
            true, // validate
            false, // display
        );

        const Nimiq = await this._loadNimiq(); // throws LOADING_DEPENDENCIES_FAILED on failure

        return new Nimiq.PublicKey(publicKey);
    }
}
