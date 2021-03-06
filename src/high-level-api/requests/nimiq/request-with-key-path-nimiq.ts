import RequestNimiq from './request-nimiq';
import { Coin } from '../../constants';
import { parseBip32Path } from '../../bip32-utils';
import ErrorState, { ErrorType } from '../../error-state';

export default abstract class RequestWithKeyPathNimiq<T> extends RequestNimiq<T> {
    public readonly keyPath: string;

    protected constructor(keyPath: string, expectedWalletId?: string, childClassProperties: Object = {}) {
        super(expectedWalletId);

        this.keyPath = keyPath;
        try {
            if (parseBip32Path(keyPath).coin !== Coin.NIMIQ) throw new Error('Not a Nimiq bip32 path');
        } catch (e) {
            // Set properties of child class such that these are present on the request in the thrown error state.
            for (const [key, value] of Object.entries(childClassProperties)) {
                (this as any)[key] = value;
            }
            throw new ErrorState(
                ErrorType.REQUEST_ASSERTION_FAILED,
                `Invalid keyPath ${keyPath}: ${e.message || e}`,
                this,
            );
        }
    }
}
