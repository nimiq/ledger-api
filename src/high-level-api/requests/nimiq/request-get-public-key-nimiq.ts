import RequestNimiq from './request-nimiq';
import RequestWithKeyPathNimiq from './request-with-key-path-nimiq';
import { RequestTypeNimiq } from '../../constants';

type Transport = import('@ledgerhq/hw-transport').default;
type PublicKey = import('@nimiq/core-web').PublicKey;

export default class RequestGetPublicKeyNimiq extends RequestWithKeyPathNimiq<PublicKey> {
    constructor(keyPath: string, expectedWalletId?: string) {
        super(RequestTypeNimiq.GET_PUBLIC_KEY, keyPath, expectedWalletId);

        // Preload Nimiq lib. Ledger Nimiq api is already preloaded by parent class. Ignore errors.
        RequestNimiq._loadNimiq().catch(() => {});
    }

    public async call(transport: Transport): Promise<PublicKey> {
        const api = await RequestNimiq._getLowLevelApi(transport); // throws LOADING_DEPENDENCIES_FAILED on failure
        const { publicKey } = await api.getPublicKey(
            this.keyPath,
            true, // validate
            false, // display
        );

        const Nimiq = await RequestNimiq._loadNimiq(); // throws LOADING_DEPENDENCIES_FAILED on failure

        return new Nimiq.PublicKey(publicKey);
    }
}
