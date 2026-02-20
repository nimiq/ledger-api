import RequestNimiq from './request-nimiq';
import { Coin } from '../../constants';
import { parseBip32Path } from '../../bip32-utils';
import ErrorState, { ErrorType } from '../../error-state';
import { NimiqVersion } from '../../../shared/constants';

export default abstract class RequestWithKeyPathNimiq<Version extends NimiqVersion, T>
    extends RequestNimiq<Version, T> {
    public readonly keyPath: string;

    protected constructor(
        nimiqVersion: Version,
        keyPath: string,
        expectedWalletId?: string,
        childClassProperties: Object = {},
    ) {
        super(nimiqVersion, expectedWalletId);

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
                `Invalid keyPath ${keyPath}: ${e instanceof Error ? e.message : e}`,
                this,
            );
        }
    }
}
