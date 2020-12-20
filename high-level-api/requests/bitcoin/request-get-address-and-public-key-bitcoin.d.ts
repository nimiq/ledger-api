import RequestBitcoin from './request-bitcoin';
import { Network, RequestTypeBitcoin } from '../../constants';
declare type Transport = import('@ledgerhq/hw-transport').default;
declare type BtcAddressInfo = {
    publicKey: string;
    address: string;
    chainCode: string;
};
export default class RequestGetAddressAndPublicKeyBitcoin extends RequestBitcoin<BtcAddressInfo> {
    readonly type: RequestTypeBitcoin.GET_ADDRESS_AND_PUBLIC_KEY;
    readonly keyPath: string;
    readonly display?: boolean;
    readonly expectedAddress?: string;
    readonly network: Network;
    private readonly _addressType;
    constructor(keyPath: string, display?: boolean, expectedAddress?: string, expectedWalletId?: string);
    call(transport: Transport): Promise<BtcAddressInfo>;
}
export {};
