import RequestBitcoin from './request-bitcoin';
import { Network, RequestTypeBitcoin } from '../../constants';
declare type Transport = import('@ledgerhq/hw-transport').default;
declare type BitcoinJsTransaction = import('bitcoinjs-lib').Transaction;
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
    lockTime?: number;
    sigHashType?: number;
    useTrustedInputForSegwit?: false;
}
export default class RequestSignTransactionBitcoin extends RequestBitcoin<string> {
    readonly type: RequestTypeBitcoin.SIGN_TRANSACTION;
    readonly transaction: TransactionInfoBitcoin;
    readonly network: Network;
    private _inputType;
    constructor(transaction: TransactionInfoBitcoin, expectedWalletId?: string);
    call(transport: Transport): Promise<string>;
    private _loadBitcoinLibIfNeeded;
}
export {};
