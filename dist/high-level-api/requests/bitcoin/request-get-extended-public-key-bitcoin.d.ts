import RequestBitcoin from './request-bitcoin';
import { Network, RequestTypeBitcoin } from '../../constants';
type Transport = import('@ledgerhq/hw-transport').default;
export default class RequestGetExtendedPublicKeyBitcoin extends RequestBitcoin<string> {
    readonly type: RequestTypeBitcoin.GET_EXTENDED_PUBLIC_KEY;
    readonly keyPath: string;
    readonly network: Exclude<Network, Network.DEVNET>;
    private readonly _addressType;
    constructor(keyPath: string, expectedWalletId?: string);
    call(transport: Transport): Promise<string>;
}
export {};
