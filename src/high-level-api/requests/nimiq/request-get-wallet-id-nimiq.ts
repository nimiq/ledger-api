import RequestNimiq from './request-nimiq';
import { CoinAppConnection } from '../request';
import { RequestTypeNimiq } from '../../constants';
import { NimiqVersion } from '../../../lib/constants';

type Transport = import('@ledgerhq/hw-transport').default;

export default class RequestGetWalletIdNimiq extends RequestNimiq<NimiqVersion, string> {
    public readonly type: RequestTypeNimiq.GET_WALLET_ID = RequestTypeNimiq.GET_WALLET_ID;

    public constructor(nimiqVersion: NimiqVersion) {
        // public constructor calling the parent protected constructor
        super(nimiqVersion);
    }

    public async call(transport: Transport): Promise<string> {
        if (!this._coinAppConnection || !this._coinAppConnection.walletId) {
            this._coinAppConnection = await this.checkCoinAppConnection(transport);
        }
        return this._coinAppConnection.walletId!;
    }

    public canReuseCoinAppConnection(coinAppConnection: CoinAppConnection): boolean {
        return super.canReuseCoinAppConnection(coinAppConnection) && !!coinAppConnection.walletId;
    }

    protected get _isWalletIdDerivationRequired() {
        return true;
    }
}
