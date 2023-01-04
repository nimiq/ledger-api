import RequestBitcoin from './request-bitcoin';
import { AddressTypeBitcoin, Coin, LedgerAddressFormatMapBitcoin, Network, RequestTypeBitcoin } from '../../constants';
import { parseBip32Path } from '../../bip32-utils';
import ErrorState, { ErrorType } from '../../error-state';

type Transport = import('@ledgerhq/hw-transport').default;
type BtcAddressInfo = {
    publicKey: string,
    address: string,
    chainCode: string,
};

export default class RequestGetAddressAndPublicKeyBitcoin extends RequestBitcoin<BtcAddressInfo> {
    public readonly type: RequestTypeBitcoin.GET_ADDRESS_AND_PUBLIC_KEY = RequestTypeBitcoin.GET_ADDRESS_AND_PUBLIC_KEY;
    public readonly keyPath: string;
    public readonly display?: boolean;
    public readonly expectedAddress?: string;
    public readonly network: Network;
    private readonly _addressType: AddressTypeBitcoin;

    constructor(keyPath: string, display?: boolean, expectedAddress?: string, expectedWalletId?: string) {
        super(expectedWalletId);
        this.keyPath = keyPath;
        this.display = display;
        this.expectedAddress = expectedAddress;

        try {
            const parsedKeyPath = parseBip32Path(keyPath);
            if (parsedKeyPath.coin !== Coin.BITCOIN) throw new Error('Not a Bitcoin bip32 path following bip44');
            this.network = parsedKeyPath.network;
            this._addressType = parsedKeyPath.addressType;
        } catch (e) {
            throw new ErrorState(
                ErrorType.REQUEST_ASSERTION_FAILED,
                `Invalid keyPath ${keyPath}: ${e.message || e}`,
                this,
            );
        }
    }

    public async call(transport: Transport): Promise<BtcAddressInfo> {
        const api = await this._getLowLevelApi(transport); // throws LOADING_DEPENDENCIES_FAILED on failure

        // TODO Requesting the pubic key causes a confirmation screen to be displayed on the Ledger for u2f and WebAuthn
        //  if the user has this privacy feature enabled. Subsequent requests can provide a permission token to avoid
        //  this screen (see https://github.com/LedgerHQ/app-bitcoin/blob/master/doc/btc.asc#get-wallet-public-key).
        //  This token is however not supported in @ledgerhq/hw-app-btc lib and therefore has to be implemented by
        //  ourselves.
        const { bitcoinAddress: address, publicKey, chainCode } = await api.getWalletPublicKey(this.keyPath, {
            verify: this.display,
            format: LedgerAddressFormatMapBitcoin[this._addressType],
        });

        if (this.expectedAddress && this.expectedAddress !== address) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, 'Address mismatch', this);
        }

        return { address, publicKey, chainCode };
    }
}
