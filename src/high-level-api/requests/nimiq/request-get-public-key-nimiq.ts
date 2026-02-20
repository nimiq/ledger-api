import RequestWithKeyPathNimiq from './request-with-key-path-nimiq';
import { RequestTypeNimiq } from '../../constants';
import { NimiqVersion } from '../../../shared/constants';
import { loadNimiq, type Nimiq, type NimiqPrimitive } from '../../../shared/load-nimiq';

type Transport = import('@ledgerhq/hw-transport').default;

export default class RequestGetPublicKeyNimiq<Version extends NimiqVersion>
    extends RequestWithKeyPathNimiq<Version, NimiqPrimitive<'PublicKey', Version>> {
    public readonly type: RequestTypeNimiq.GET_PUBLIC_KEY;

    constructor(nimiqVersion: Version, keyPath: string, expectedWalletId?: string) {
        const type = RequestTypeNimiq.GET_PUBLIC_KEY;
        super(nimiqVersion, keyPath, expectedWalletId, { type });
        this.type = type;
    }

    public async call(transport: Transport): Promise<NimiqPrimitive<'PublicKey', Version>> {
        // These throw LOADING_DEPENDENCIES_FAILED on failure.
        const [api, { Nimiq }] = await Promise.all([this._getLowLevelApi(transport), this._loadDependencies()]);
        const { publicKey } = await api.getPublicKey(
            this.keyPath,
            true, // validate
            false, // display
            this.nimiqVersion,
        );

        return new Nimiq.PublicKey(publicKey) as NimiqPrimitive<'PublicKey', Version>;
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
