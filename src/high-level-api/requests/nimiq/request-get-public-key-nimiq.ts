import RequestWithKeyPathNimiq from './request-with-key-path-nimiq';
import { RequestTypeNimiq } from '../../constants';
import { NimiqVersion } from '../../../lib/constants';
import type { NimiqPrimitive } from '../../../lib/load-nimiq';

type Transport = import('@ledgerhq/hw-transport').default;

export default class RequestGetPublicKeyNimiq<Version extends NimiqVersion>
    extends RequestWithKeyPathNimiq<Version, NimiqPrimitive<'PublicKey', Version>> {
    public readonly type: RequestTypeNimiq.GET_PUBLIC_KEY;

    constructor(nimiqVersion: Version, keyPath: string, expectedWalletId?: string) {
        const type = RequestTypeNimiq.GET_PUBLIC_KEY;
        super(nimiqVersion, keyPath, expectedWalletId, { type });
        this.type = type;

        // Preload Nimiq lib. Ledger Nimiq api is already preloaded by parent class. Ignore errors.
        this._loadNimiq().catch(() => {});
    }

    public async call(transport: Transport): Promise<NimiqPrimitive<'PublicKey', Version>> {
        const api = await this._getLowLevelApi(transport); // throws LOADING_DEPENDENCIES_FAILED on failure
        const { publicKey } = await api.getPublicKey(
            this.keyPath,
            true, // validate
            false, // display
            this.nimiqVersion,
        );

        const Nimiq = await this._loadNimiq(); // throws LOADING_DEPENDENCIES_FAILED on failure

        return new Nimiq.PublicKey(publicKey) as NimiqPrimitive<'PublicKey', Version>;
    }
}
