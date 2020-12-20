import RequestNimiq from './request-nimiq';
export default abstract class RequestWithKeyPathNimiq<T> extends RequestNimiq<T> {
    readonly keyPath: string;
    protected constructor(keyPath: string, expectedWalletId?: string, childClassProperties?: Object);
}
