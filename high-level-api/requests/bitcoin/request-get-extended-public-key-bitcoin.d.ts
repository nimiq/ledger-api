import RequestBitcoin from './request-bitcoin';
import { Network, RequestTypeBitcoin } from '../../constants';
declare type Transport = import('@ledgerhq/hw-transport').default;
export default class RequestGetExtendedPublicKeyBitcoin extends RequestBitcoin<string> {
    readonly type: RequestTypeBitcoin.GET_EXTENDED_PUBLIC_KEY;
    readonly keyPath: string;
    readonly network: Network;
    private readonly _addressType;
    constructor(keyPath: string, expectedWalletId?: string);
    call(transport: Transport): Promise<string>;
}
export {};
