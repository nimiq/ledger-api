import RequestBitcoin from './request-bitcoin';
import { AddressTypeBitcoin, Coin, Network, RequestTypeBitcoin } from '../../constants';
import { parseBip32Path } from '../../bip32-utils';
import ErrorState, { ErrorType } from '../../error-state';

type Transport = import('@ledgerhq/hw-transport').default;
type BtcAddressInfo = {
    publicKey: string,
    address: string,
    chainCode: string,
};

export default class RequestGetAddressAndPublicKeyBitcoin extends RequestBitcoin<BtcAddressInfo> {
    public readonly keyPath: string;
    public readonly display?: boolean;
    public readonly expectedAddress?: string;
    private readonly _addressType: AddressTypeBitcoin;

    constructor(keyPath: string, display?: boolean, expectedAddress?: string, walletId?: string) {
        super(RequestTypeBitcoin.GET_ADDRESS_AND_PUBLIC_KEY, walletId);
        this.keyPath = keyPath;
        this.display = display;
        this.expectedAddress = expectedAddress;

        try {
            const parsedKeyPath = parseBip32Path(keyPath);
            if (parsedKeyPath.coin !== Coin.BITCOIN) throw new Error('Not a Bitcoin bip32 path');
            // TODO The ledger BTC app only returns mainnet addresses (even for testnet paths). For the testnet there
            //  is a separate ledger app. So should we calculate testnet addresses ourselves from the public key? At
            //  least in combination with the display flag this doesn't make much sense though.
            if (parsedKeyPath.network !== Network.MAINNET) throw new Error('Only mainnet addresses supported');
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
        const api = await RequestBitcoin._getLowLevelApi(transport);

        const format = {
            [AddressTypeBitcoin.LEGACY]: 'legacy' as 'legacy',
            [AddressTypeBitcoin.P2SH_SEGWIT]: 'p2sh' as 'p2sh',
            [AddressTypeBitcoin.NATIVE_SEGWIT]: 'bech32' as 'bech32',
        }[this._addressType] || 'bech32';

        // TODO Requesting the pubic key causes a confirmation screen to be displayed on the Ledger for u2f and WebAuthn
        //  if the user has this privacy feature enabled. Subsequent requests can provide a permission token to avoid
        //  this screen (see https://github.com/LedgerHQ/app-bitcoin/blob/master/doc/btc.asc#get-wallet-public-key).
        //  This token is however not supported in @ledgerhq/hw-app-btc lib and therefore has to be implemented by
        //  ourselves.
        const { bitcoinAddress: address, publicKey, chainCode } = await api.getWalletPublicKey(this.keyPath, {
            verify: this.display,
            format,
        });

        if (this.expectedAddress && this.expectedAddress !== address) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, 'Address mismatch', this);
        }

        return { address, publicKey, chainCode };
    }
}
