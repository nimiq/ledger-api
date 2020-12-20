import { RequestTypeBitcoin, parseBip32Path, Coin, ErrorState, ErrorType, AddressTypeBitcoin } from './ledger-api.es.js';
import './lazy-chunk-request.es.js';
import { R as RequestBitcoin } from './lazy-chunk-request-bitcoin.es.js';

class RequestGetAddressAndPublicKeyBitcoin extends RequestBitcoin {
    constructor(keyPath, display, expectedAddress, expectedWalletId) {
        super(expectedWalletId);
        this.type = RequestTypeBitcoin.GET_ADDRESS_AND_PUBLIC_KEY;
        this.keyPath = keyPath;
        this.display = display;
        this.expectedAddress = expectedAddress;
        try {
            const parsedKeyPath = parseBip32Path(keyPath);
            if (parsedKeyPath.coin !== Coin.BITCOIN)
                throw new Error('Not a Bitcoin bip32 path following bip44');
            this.network = parsedKeyPath.network;
            this._addressType = parsedKeyPath.addressType;
        }
        catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, `Invalid keyPath ${keyPath}: ${e.message || e}`, this);
        }
    }
    async call(transport) {
        const api = await this._getLowLevelApi(transport); // throws LOADING_DEPENDENCIES_FAILED on failure
        const format = {
            [AddressTypeBitcoin.LEGACY]: 'legacy',
            [AddressTypeBitcoin.P2SH_SEGWIT]: 'p2sh',
            [AddressTypeBitcoin.NATIVE_SEGWIT]: 'bech32',
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

export default RequestGetAddressAndPublicKeyBitcoin;
//# sourceMappingURL=lazy-chunk-request-get-address-and-public-key-bitcoin.es.js.map
