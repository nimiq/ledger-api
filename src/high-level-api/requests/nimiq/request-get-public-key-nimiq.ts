import RequestWithKeyPathNimiq from './request-with-key-path-nimiq';
import { RequestTypeNimiq } from '../../constants';
import { NimiqVersion } from '../../../shared/constants';
import { loadNimiq, type Nimiq, type NimiqPrimitive } from '../../../shared/load-nimiq';

type Transport = import('@ledgerhq/hw-transport').default;

export default class RequestGetPublicKeyNimiq extends RequestWithKeyPathNimiq<NimiqPrimitive<'PublicKey'>> {
    public readonly type: RequestTypeNimiq.GET_PUBLIC_KEY;

    constructor(nimiqVersion: NimiqVersion, keyPath: string, expectedWalletId?: string) {
        const type = RequestTypeNimiq.GET_PUBLIC_KEY;
        super(nimiqVersion, keyPath, expectedWalletId, { type });
        this.type = type;
    }

    public async call(transport: Transport): Promise<NimiqPrimitive<'PublicKey'>> {
        // These throw LOADING_DEPENDENCIES_FAILED on failure.
        const [api, { Nimiq }] = await Promise.all([this._getLowLevelApi(transport), this._loadDependencies()]);
        const { publicKey } = await api.getPublicKey(
            this.keyPath,
            true, // validate
            false, // display
            this.nimiqVersion,
        );

        return new Nimiq.PublicKey(publicKey);
    }

    protected async _loadDependencies(): Promise<{
        Nimiq: Nimiq,
    } & Awaited<ReturnType<RequestWithKeyPathNimiq<unknown>['_loadDependencies']>>> {
        const [parentDependencies, Nimiq] = await Promise.all([
            super._loadDependencies(),
            this._loadDependency(loadNimiq()),
        ]);
        return { ...parentDependencies, Nimiq };
    }
}
