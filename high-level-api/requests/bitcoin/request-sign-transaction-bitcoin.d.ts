import RequestBitcoin from './request-bitcoin';
import { Network, RequestTypeBitcoin } from '../../constants';
type Transport = import('@ledgerhq/hw-transport').default;
type BitcoinJsTransaction = import('bitcoinjs-lib').Transaction;
export interface TransactionInfoBitcoin {
    inputs: Array<{
        transaction: string | BitcoinJsTransaction;
        index: number;
        keyPath: string;
        customScript?: string;
        sequence?: number;
    }>;
    outputs: string | Array<{
        amount: number;
    } & ({
        outputScript: string;
    } | {
        address: string;
    })>;
    changePath?: string;
    locktime?: number;
    sigHashType?: number;
    useTrustedInputForSegwit?: false;
}
export default class RequestSignTransactionBitcoin extends RequestBitcoin<string> {
    readonly type: RequestTypeBitcoin.SIGN_TRANSACTION;
    readonly transaction: TransactionInfoBitcoin;
    readonly network: Exclude<Network, Network.DEVNET>;
    private _inputType;
    get requiredApp(): string;
    constructor(transaction: TransactionInfoBitcoin, expectedWalletId?: string);
    call(transport: Transport): Promise<string>;
    private _loadBitcoinLibIfNeeded;
}
export {};
