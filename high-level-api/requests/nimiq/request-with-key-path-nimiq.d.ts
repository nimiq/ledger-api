import RequestNimiq from './request-nimiq';
import { NimiqVersion } from '../../../lib/constants';
export default abstract class RequestWithKeyPathNimiq<Version extends NimiqVersion, T> extends RequestNimiq<Version, T> {
    readonly keyPath: string;
    protected constructor(nimiqVersion: Version, keyPath: string, expectedWalletId?: string, childClassProperties?: Object);
}
