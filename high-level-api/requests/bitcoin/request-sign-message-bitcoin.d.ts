import RequestBitcoin from './request-bitcoin';
import { Network, RequestTypeBitcoin } from '../../constants';
type Transport = import('@ledgerhq/hw-transport').default;
type MessageSignatureInfo = {
    signerAddress: string;
    signature: string;
};
export default class RequestSignMessageBitcoin extends RequestBitcoin<MessageSignatureInfo> {
    readonly type: RequestTypeBitcoin.SIGN_MESSAGE;
    readonly keyPath: string;
    readonly message: string | Uint8Array;
    readonly network: Exclude<Network, Network.DEVNET>;
    private readonly _addressType;
    constructor(keyPath: string, message: string | Uint8Array, expectedWalletId?: string);
    call(transport: Transport): Promise<MessageSignatureInfo>;
}
export {};
