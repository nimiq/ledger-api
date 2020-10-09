import RequestNimiq from './request-nimiq';
import { RequestTypeNimiq } from '../../constants';
import { getKeyIdForBip32Path } from '../../bip32-utils';
import ErrorState, { ErrorType } from '../../error-state';

export default abstract class RequestWithKeyPathNimiq<T> extends RequestNimiq<T> {
    public readonly keyPath: string;

    protected constructor(type: RequestTypeNimiq, keyPath: string, walletId?: string) {
        super(type, walletId);

        this.keyPath = keyPath;
        try {
            getKeyIdForBip32Path(this.coin, keyPath);
        } catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, `Invalid keyPath ${keyPath}`, this);
        }
    }
}
