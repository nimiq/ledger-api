import RequestNimiq from './request-nimiq';
import RequestWithKeyPathNimiq from './request-with-key-path-nimiq';
import { RequestTypeNimiq } from '../../constants';

type Transport = import('@ledgerhq/hw-transport').default;
type PublicKey = import('@nimiq/core-web').PublicKey;

export default class RequestGetPublicKeyNimiq extends RequestWithKeyPathNimiq<PublicKey> {
    constructor(keyPath: string, walletId?: string) {
        super(RequestTypeNimiq.GET_PUBLIC_KEY, keyPath, walletId);
    }

    public async call(transport: Transport): Promise<PublicKey> {
        const api = RequestNimiq._getLowLevelApi(transport);
        const { publicKey } = await api.getPublicKey(
            this.keyPath,
            true, // validate
            false, // display
        );

        // Note that the actual load of the Nimiq core and cryptography is triggered in checkCoinAppConnection with
        // error handling. The call here is just used to get the reference to the Nimiq object and can not fail.
        const Nimiq = await RequestNimiq._loadNimiq();

        return new Nimiq.PublicKey(publicKey);
    }
}
