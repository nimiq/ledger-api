import RequestNimiq from './request-nimiq';
import { CoinAppConnection } from '../request';
import { RequestTypeNimiq } from '../../constants';

type Transport = import('@ledgerhq/hw-transport').default;

export default class RequestGetWalletIdNimiq extends RequestNimiq<string> {
    private _coinAppConnection: CoinAppConnection | null = null;

    constructor() {
        super(RequestTypeNimiq.GET_WALLET_ID);
    }

    public async call(transport: Transport): Promise<string> {
        const { walletId } = this._coinAppConnection || await this.checkCoinAppConnection(transport);
        return walletId;
    }

    public async checkCoinAppConnection(transport: Transport): Promise<CoinAppConnection> {
        this._coinAppConnection = await super.checkCoinAppConnection(transport);
        return this._coinAppConnection;
    }
}
