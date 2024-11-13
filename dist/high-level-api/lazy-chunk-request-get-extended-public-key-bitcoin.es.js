import { b as buffer } from './lazy-chunk-index.es.js';
import { R as RequestBitcoin } from './lazy-chunk-request-bitcoin.es.js';
import { Network, AddressTypeBitcoin, RequestTypeBitcoin, ErrorState, ErrorType, L as LedgerAddressFormatMapBitcoin } from './ledger-api.es.js';
import './lazy-chunk-request.es.js';

// TODO if in the future the interchangeability of bitcoin-lib with the Nimiq hub's BitcoinJS is not needed anymore,
//  this can move directly into the lazy loaded bitcoin-lib and then also be lazy loaded.
async function getNetworkInfo(network, addressType) {
    // async because bitcoin-lib is lazy loaded
    const { networks } = await [import('./lazy-chunk-index.es.js'), import('./lazy-chunk-sha256.es.js'), import('./lazy-chunk-_virtual_process.es.js'), import('./lazy-chunk-_commonjsHelpers.es.js'), import('./lazy-chunk-events.es.js'), import('./lazy-chunk-bitcoin-lib.es.js')][5].then(function (n) { return n.d; });
    const result = {
        [Network.MAINNET]: networks.bitcoin,
        [Network.TESTNET]: networks.testnet,
    }[network];
    if (!result)
        throw new Error(`Unsupported network ${network}`);
    // Bip32 version bytes for different address types which are not all defined by the bip32 lib,
    // see https://github.com/satoshilabs/slips/blob/master/slip-0132.md#registered-hd-version-bytes
    const versionBytes = {
        [AddressTypeBitcoin.LEGACY]: {
            [Network.MAINNET]: networks.bitcoin.bip32,
            [Network.TESTNET]: networks.testnet.bip32,
        },
        [AddressTypeBitcoin.P2SH_SEGWIT]: {
            [Network.MAINNET]: {
                public: 0x049d7cb2,
                private: 0x049d7878, // yprv
            },
            [Network.TESTNET]: {
                public: 0x044a5262,
                private: 0x044a4e28, // uprv
            },
        },
        [AddressTypeBitcoin.NATIVE_SEGWIT]: {
            [Network.MAINNET]: {
                public: 0x04b24746,
                private: 0x04b2430c, // zprv
            },
            [Network.TESTNET]: {
                public: 0x045f1cf6,
                private: 0x045f18bc, // vprv
            },
        },
    }[addressType][network]; // TODO should be using optional chaining here once we update rollup
    if (!versionBytes)
        throw new Error(`Unknown version bytes for network ${network}, address type ${addressType}`);
    return {
        ...result,
        bip32: versionBytes,
    };
}
// Taken from https://github.com/LedgerHQ/ledger-wallet-webtool/blob/master/src/PathFinderUtils.js#L31
// Also see https://github.com/LedgerHQ/ledger-live/blob/main/libs/ledgerjs/packages/hw-app-btc/src/compressPublicKey.ts
// for a version operating on buffers. However, usage requires then loading the Buffer polyfill.
function compressPublicKey(publicKey) {
    let compressedKeyIndex;
    if (publicKey.substring(0, 2) !== '04') {
        throw new Error('Invalid public key format');
    }
    if (parseInt(publicKey.substring(128, 130), 16) % 2 !== 0) {
        compressedKeyIndex = '03';
    }
    else {
        compressedKeyIndex = '02';
    }
    return compressedKeyIndex + publicKey.substring(2, 66);
}

const KEY_PATH_REGEX = new RegExp('^'
    + '(?:m/)?' // optional m/ prefix
    + '(44|49|84)\'' // purpose id; BIP44 (BTC legacy) / BIP49 (BTC nested SegWit) / BIP84 (BTC native SegWit)
    + '/(0|1)\'' // coin type; 0 for Bitcoin Mainnet, 1 for Bitcoin Testnet
    + '/\\d+\'' // account index; allow only xpubs for specific accounts
    + '(?:/\\d+\'?)*' // sub paths; No constraints as they can be circumvented anyway by deriving from higher level xpub
    + '$');
class RequestGetExtendedPublicKeyBitcoin extends RequestBitcoin {
    type = RequestTypeBitcoin.GET_EXTENDED_PUBLIC_KEY;
    keyPath;
    network;
    _addressType;
    constructor(keyPath, expectedWalletId) {
        super(expectedWalletId);
        this.keyPath = keyPath;
        // TODO check which paths are actually still allowed, ledgerjs' old implementation, new implementation and
        //  https://github.com/LedgerHQ/app-bitcoin-new/blob/master/doc/bitcoin.md#description seem to differ.
        // Check for keyPath validity. Not using parseBip32Path from bip32-utils as we allow exporting xpubs at
        // arbitrary levels. Further restrictions could be circumvented anyways by deriving from higher level xpub.
        const keyPathMatch = keyPath.match(KEY_PATH_REGEX);
        if (!keyPathMatch) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, `Invalid keyPath ${keyPath}. Paths must follow bip44 and at least specify the purpose id`
                + ' (allowed are 44\', 49\', 84\'), coin type (allowed are 0\', 1\') and account index (hardened).', this);
        }
        const [, purposeId, networkId] = keyPathMatch;
        this._addressType = {
            44: AddressTypeBitcoin.LEGACY,
            49: AddressTypeBitcoin.P2SH_SEGWIT,
            84: AddressTypeBitcoin.NATIVE_SEGWIT,
        }[purposeId];
        this.network = {
            0: Network.MAINNET,
            1: Network.TESTNET,
        }[networkId];
        // Preload bitcoin lib. Ledger Bitcoin api is already preloaded by parent class. Ignore errors.
        this._loadBitcoinLib().catch(() => { });
    }
    async call(transport) {
        // Get xpub as specified in bip32.
        // (https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki#serialization-format)
        const verificationPath = '0/0';
        // The new api implemented in the Bitcoin app starting with 2.0 only supports original xpub (for mainnet)
        // and tpub (for testnet) versions, which were initially defined for the legacy address type, see
        // https://github.com/satoshilabs/slips/blob/master/slip-0132.md#registered-hd-version-bytes
        const ledgerXpubVersion = this.network === Network.MAINNET ? /* xpub */ 0x0488b21e : /* tpub */ 0x043587cf;
        // Note: We make api calls outside of the try...catch block to let the exceptions fall through such that
        // _callLedger can decide how to behave depending on the api error. Load errors are converted to
        // LOADING_DEPENDENCIES_FAILED error states by _getLowLevelApi and _LoadBitcoinLib. All other errors
        // are converted to REQUEST_ASSERTION_FAILED errors which stop the execution of the request.
        const [{ bip32 }, [ledgerXpub, verificationPubKey, verificationChainCode],] = await Promise.all([
            this._loadBitcoinLib(),
            (async () => {
                const api = await this._getLowLevelApi(transport); // throws LOADING_DEPENDENCIES_FAILED on failure
                // Don't use Promise.all here because ledger requests have to be sent sequentially as ledger can only
                // perform one request at a time.
                const xpub = await api.getWalletXpub({
                    path: this.keyPath,
                    xpubVersion: ledgerXpubVersion,
                });
                // TODO Requesting the public key causes a confirmation screen to be displayed on the Ledger for u2f and
                //  WebAuthn for every request if the user has this privacy feature enabled in the Bitcoin app.
                //  Subsequent requests can provide a permission token in _getLowLevelApi to avoid this screen (see
                //  https://github.com/LedgerHQ/app-bitcoin/blob/master/doc/btc.asc#get-wallet-public-key). This token
                //  is however not supported in @ledgerhq/hw-app-btc and therefore has to be implemented by ourselves.
                const { publicKey: verificationPubKeyHex, chainCode: verificationChainCodeHex, } = await api.getWalletPublicKey(`${this.keyPath}/${verificationPath}`, { format: LedgerAddressFormatMapBitcoin[this._addressType] });
                return [
                    xpub,
                    buffer.Buffer.from(compressPublicKey(verificationPubKeyHex), 'hex'),
                    buffer.Buffer.from(verificationChainCodeHex, 'hex'),
                ];
            })(),
        ]);
        try {
            // Note getNetworkInfo is only async because it lazy loads the bitcoin lib, which is already loaded at this
            // point. Therefore, putting it into the Promise.all has no further upside and errors within the call should
            // become REQUEST_ASSERTION_FAILED exceptions anyway.
            const networkInfo = await getNetworkInfo(this.network, this._addressType);
            const extendedPubKey = bip32.fromBase58(ledgerXpub, {
                ...networkInfo,
                bip32: { ...networkInfo.bip32, public: ledgerXpubVersion },
            });
            // Verify that the generated xpub is correct by deriving an example child and comparing it to the result
            // calculated by the Ledger device. No need to verify the Ledger generated address as it is derived from the
            // pub key anyway.
            const verificationDerivation = extendedPubKey.derivePath(verificationPath);
            if (!verificationDerivation.publicKey.equals(verificationPubKey)
                || !verificationDerivation.chainCode.equals(verificationChainCode)) {
                throw new Error('Failed to verify the constructed xpub.');
            }
            // Export extended public key versioned as xpub, ypub, zpub, tpub, upub or vpub, according to the network
            // and address type. We do this for compatibility with previous versions of our api and the Nimiq Keyguard
            // and because it's still common practice. However, encoding as versions other than xpub and tpub is
            // a somewhat deprecated standard nowadays. They're for example not used in PSBTs or descriptor wallets.
            extendedPubKey.network = networkInfo;
            return extendedPubKey.toBase58();
        }
        catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, e instanceof Error ? e : String(e), this);
        }
    }
}

export { RequestGetExtendedPublicKeyBitcoin as default };
//# sourceMappingURL=lazy-chunk-request-get-extended-public-key-bitcoin.es.js.map
