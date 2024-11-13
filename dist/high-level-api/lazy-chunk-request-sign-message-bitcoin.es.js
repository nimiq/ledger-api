import { b as buffer } from './lazy-chunk-index.es.js';
import { R as RequestBitcoin } from './lazy-chunk-request-bitcoin.es.js';
import { RequestTypeBitcoin, parseBip32Path, Coin, ErrorState, ErrorType, Network, AddressTypeBitcoin, L as LedgerAddressFormatMapBitcoin } from './ledger-api.es.js';
import './lazy-chunk-request.es.js';

class RequestSignMessageBitcoin extends RequestBitcoin {
    type = RequestTypeBitcoin.SIGN_MESSAGE;
    keyPath;
    message; // utf8 string or Uint8Array of arbitrary data
    network;
    _addressType;
    constructor(keyPath, message, expectedWalletId) {
        super(expectedWalletId);
        this.keyPath = keyPath;
        this.message = message;
        try {
            const parsedKeyPath = parseBip32Path(keyPath);
            if (parsedKeyPath.coin !== Coin.BITCOIN)
                throw new Error('Not a Bitcoin bip32 path following bip44');
            this.network = parsedKeyPath.network;
            this._addressType = parsedKeyPath.addressType;
        }
        catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, `Invalid keyPath ${keyPath}: ${e instanceof Error ? e.message : e}`, this);
        }
    }
    async call(transport) {
        // Resources:
        // - Message signature specification (bip137):
        //   https://github.com/bitcoin/bips/blob/master/bip-0137.mediawiki
        //   Note that the message signatures generated by the Ledger are not based on the newer bip322 yet.
        // - Description of v, r, s values the signature consists of:
        //   https://bitcoin.stackexchange.com/a/38909
        // - Ledger Bitcoin App's api description:
        //   Old app <2.0: https://github.com/LedgerHQ/app-bitcoin/blob/master/doc/btc.asc#sign-message
        //   New app >=2.0: https://github.com/LedgerHQ/app-bitcoin-new/blob/master/doc/bitcoin.md#sign_message
        // - The implementation of the api call in @ledgerhq/hw-app-btc:
        //   https://github.com/LedgerHQ/ledger-live/blob/develop/libs/ledgerjs/packages/hw-app-btc/src/signMessage.ts
        //   Also handles the conversion of the ASN-1 encoded signature created by the Ledger (defined in
        //   https://www.secg.org/sec1-v2.pdf) to BitcoinQT format. However note that the returned v value does not
        //   contain the address type constant yet. For converting this result to the final concatenated base64
        //   signature including the address type see the jsdoc documentation of signMessage here:
        //   https://github.com/LedgerHQ/ledger-live/blob/main/libs/ledgerjs/packages/hw-app-btc/src/Btc.ts
        //   For new apps >=2.0 message signing is implemented here:
        //   github.com/LedgerHQ/ledger-live/blob/develop/libs/ledgerjs/packages/hw-app-btc/src/newops/appClient.ts#L174
        //   or alternatively here in the all-new ts client for app-bitcoin-new:
        //   https://github.com/LedgerHQ/app-bitcoin-new/blob/develop/bitcoin_client_js/src/lib/appClient.ts
        // - For confirming signed messages online:
        //   https://www.verifybitcoinmessage.com/
        // - bitcoinjs-message library for client side signing and verification of message signatures:
        //   https://github.com/bitcoinjs/bitcoinjs-message
        const api = await this._getLowLevelApi(transport); // throws LOADING_DEPENDENCIES_FAILED on failure
        let messageBuffer;
        try {
            messageBuffer = typeof this.message === 'string'
                ? buffer.Buffer.from(this.message, 'utf8') // throws if invalid utf8
                : buffer.Buffer.from(this.message);
            if (messageBuffer.length >= 2 ** 16) {
                // the message length is encoded in an uint16.
                throw new Error('Message too long');
            }
        }
        catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, e instanceof Error ? e : String(e), this);
        }
        if (this.network === Network.TESTNET && this._addressType === AddressTypeBitcoin.LEGACY) {
            console.warn('Ledgers seem to generate invalid signatures for testnet legacy p2pkh addresses. '
                + 'Prefer using nested p2sh segwit or native bech32 segwit addresses.');
        }
        // Note: We make api calls outside of the try...catch block to let the exceptions fall through such that
        // _callLedger can decide how to behave depending on the api error.
        const { bitcoinAddress: signerAddress } = await api.getWalletPublicKey(this.keyPath, { format: LedgerAddressFormatMapBitcoin[this._addressType] });
        const { v, // recId (not including the address type constant)
        r, // r of ECDSA signature
        s, // s of ECDSA signature
         } = await api.signMessage(this.keyPath, messageBuffer.toString('hex'));
        // Create the signature header, see
        // https://github.com/bitcoin/bips/blob/master/bip-0137.mediawiki#procedure-for-signingverifying-a-signature
        const headerAddressTypeConstant = {
            [AddressTypeBitcoin.LEGACY]: 31,
            [AddressTypeBitcoin.P2SH_SEGWIT]: 35,
            [AddressTypeBitcoin.NATIVE_SEGWIT]: 39,
        }[this._addressType];
        const header = (v + headerAddressTypeConstant).toString(16);
        const signature = buffer.Buffer.from(`${header}${r}${s}`, 'hex').toString('base64');
        return {
            signerAddress,
            signature,
        };
    }
}

export { RequestSignMessageBitcoin as default };
//# sourceMappingURL=lazy-chunk-request-sign-message-bitcoin.es.js.map
