import RequestNimiq from './request-nimiq';
import { RequestParamsCommon } from '../request';
import { RequestTypeNimiq } from '../../constants';

type Transport = import('@ledgerhq/hw-transport').default;
type PublicKey = import('@nimiq/core-web').PublicKey;

export interface RequestParamsGetPublicKeyNimiq extends RequestParamsCommon {
    keyPath: string;
}

export default class RequestGetPublicKeyNimiq extends RequestNimiq<RequestParamsGetPublicKeyNimiq, PublicKey> {
    constructor(params: RequestParamsGetPublicKeyNimiq) {
        super(RequestTypeNimiq.GET_PUBLIC_KEY, params);
    }

    public async call(transport: Transport): Promise<PublicKey> {
        const api = RequestNimiq._getLowLevelApi(transport);
        const { publicKey } = await api.getPublicKey(
            this.params.keyPath,
            true, // validate
            false, // display
        );

        // Note that the actual load of the Nimiq core and cryptography is triggered in checkCoinAppConnection with
        // error handling. The call here is just used to get the reference to the Nimiq object and can not fail.
        const Nimiq = await RequestNimiq._loadNimiq();

        return new Nimiq.PublicKey(publicKey);
    }
}
