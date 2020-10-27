import RequestBitcoin from './request-bitcoin';
import { compressPublicKey, getNetworkInfo } from './bitcoin-utils';
import { AddressTypeBitcoin, Network, RequestTypeBitcoin } from '../../constants';
import ErrorState, { ErrorType } from '../../error-state';

type Transport = import('@ledgerhq/hw-transport').default;

const KEY_PATH_REGEX = new RegExp(
    '^'
    + '(44|49|84)\'' // purpose id; BIP44 (BTC legacy) / BIP49 (BTC nested SegWit) / BIP84 (BTC native SegWit)
    + '/(0|1)\'' // coin type; 0 for Bitcoin Mainnet, 1 for Bitcoin Testnet
    + '/\\d+\'' // account index; allow only xpubs for specific accounts
    + '(?:/\\d+\'?)*' // sub paths; No constraints as they can be circumvented anyway by deriving from higher level xpub
    + '$',
);

export default class RequestGetExtendedPublicKeyBitcoin extends RequestBitcoin<string> {
    public readonly keyPath: string;
    public readonly network: Network;
    private readonly _addressType: AddressTypeBitcoin;

    constructor(keyPath: string, walletId?: string) {
        super(RequestTypeBitcoin.GET_EXTENDED_PUBLIC_KEY, walletId);
        this.keyPath = keyPath;

        // Check for keyPath validity. Not using parseBip32Path from bip32-utils as we allow exporting xpubs at
        // arbitrary levels. Further restrictions could be circumvented anyways by deriving from higher level xpub.
        const keyPathMatch = keyPath.match(KEY_PATH_REGEX);
        if (!keyPathMatch) {
            throw new ErrorState(
                ErrorType.REQUEST_ASSERTION_FAILED,
                `Invalid keyPath ${keyPath}. Paths must follow bip44 and at least specify the purpose id`
                    + ' (allowed are 44\', 49\', 84\'), coin type (allowed are 0\', 1\') and account index (hardened).',
                this,
            );
        }

        const [, purposeId, networkId] = keyPathMatch;
        this._addressType = {
            44: AddressTypeBitcoin.LEGACY,
            49: AddressTypeBitcoin.P2SH_SEGWIT,
            84: AddressTypeBitcoin.NATIVE_SEGWIT,
        }[purposeId as '44' | '49' | '84'];
        this.network = {
            0: Network.MAINNET,
            1: Network.TESTNET,
        }[networkId as '0' | '1'];

        // Preload bitcoin lib. Ledger Bitcoin api is already preloaded by parent class. Ignore errors.
        RequestBitcoin._loadBitcoinLib().catch(() => {});
    }

    public async call(transport: Transport): Promise<string> {
        // Build xpub as specified in bip32
        // (https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki#serialization-format)
        const verificationPath = '0/0';

        // Note: We make api calls outside of the try...catch block to let the exceptions fall through such that
        // _callLedger can decide how to behave depending on the api error. Load errors are converted to
        // LOADING_DEPENDENCIES_FAILED error states by _getLowLevelApi and _LoadBitcoinLib. All other errors
        // are converted to REQUEST_ASSERTION_FAILED errors which stop the execution of the request.
        const [
            { bip32 },
            [parentPubKey, parentChainCode, pubKey, chainCode, verificationPubKey, verificationChainCode],
        ] = await Promise.all([
            RequestBitcoin._loadBitcoinLib(),
            (async () => {
                // Fetch the data from Ledger required for xpub calculation
                // TODO Requesting the public key causes a confirmation screen to be displayed on the Ledger for u2f and
                //  WebAuthn for every request if the user has this privacy feature enabled in the Bitcoin app.
                //  Subsequent requests can provide a permission token in _getLowLevelApi to avoid this screen (see
                //  https://github.com/LedgerHQ/app-bitcoin/blob/master/doc/btc.asc#get-wallet-public-key). This token
                //  is however not supported in @ledgerhq/hw-app-btc and therefore has to be implemented by ourselves.
                const api = await RequestBitcoin._getLowLevelApi(transport);
                const parentPath = this.keyPath.substring(0, this.keyPath.lastIndexOf('/'));
                // ledger requests have to be sent sequentially as ledger can only perform one request at a time
                const {
                    publicKey: parentPubKeyHex,
                    chainCode: parentChainCodeHex,
                } = await api.getWalletPublicKey(parentPath);
                const {
                    publicKey: pubKeyHex,
                    chainCode: chainCodeHex,
                } = await api.getWalletPublicKey(this.keyPath);
                const {
                    publicKey: verificationPubKeyHex,
                    chainCode: verificationChainCodeHex,
                } = await api.getWalletPublicKey(`${this.keyPath}/${verificationPath}`);
                return [
                    Buffer.from(compressPublicKey(parentPubKeyHex), 'hex'),
                    Buffer.from(parentChainCodeHex, 'hex'),
                    Buffer.from(compressPublicKey(pubKeyHex), 'hex'),
                    Buffer.from(chainCodeHex, 'hex'),
                    Buffer.from(compressPublicKey(verificationPubKeyHex), 'hex'),
                    Buffer.from(verificationChainCodeHex, 'hex'),
                ];
            })(),
        ]);

        try {
            // Note getNetworkInfo is only async because it lazy loads the bitcoin lib, which is already loaded at this
            // point. Therefore putting it into the Promise.all has no further upside and errors within the call should
            // become REQUEST_ASSERTION_FAILED exceptions.
            const networkInfo = await getNetworkInfo(this.network, this._addressType);
            const parent = bip32.fromPublicKey(parentPubKey, parentChainCode, networkInfo);
            const parentFingerprint = parent.fingerprint.readUInt32BE(0); // this is calculated from the pub key only
            const keyPathParts = this.keyPath.split('/');
            const depth = keyPathParts.length;
            const index = Number.parseInt(keyPathParts[depth - 1], 10)
                + (this.keyPath.endsWith('\'') ? 0x80000000 : 0); // set index for hardened paths according to bip32

            // Create the xpub from the data we collected. Unfortunately, the bip32 lib does not expose the generic
            // constructor, such that we have to set some private properties manually. But we try to do it in a future
            // proof and minification safe manner.
            // TODO make this less hacky
            /* eslint-disable dot-notation */
            const extendedPubKey = bip32.fromPublicKey(pubKey, chainCode, networkInfo) as
                ReturnType<typeof bip32.fromPublicKey> & {
                    __DEPTH: number,
                    __INDEX: number,
                    __PARENT_FINGERPRINT: number,
                };
            if (extendedPubKey.__DEPTH === 0) {
                extendedPubKey.__DEPTH = depth;
            } else if (extendedPubKey['__DEPTH'] === 0) {
                extendedPubKey['__DEPTH'] = depth;
            } else {
                throw new Error('Failed to construct xpub, couldn\'t set __DEPTH.');
            }
            if (extendedPubKey.__INDEX === 0) {
                extendedPubKey.__INDEX = index;
            } else if (extendedPubKey['__INDEX'] === 0) {
                extendedPubKey['__INDEX'] = index;
            } else {
                throw new Error('Failed to construct xpub, couldn\'t set __INDEX.');
            }
            if (extendedPubKey.__PARENT_FINGERPRINT === 0) {
                extendedPubKey.__PARENT_FINGERPRINT = parentFingerprint;
            } else if (extendedPubKey['__PARENT_FINGERPRINT'] === 0) {
                extendedPubKey['__PARENT_FINGERPRINT'] = parentFingerprint;
            } else {
                throw new Error('Failed to construct xpub, couldn\'t set __PARENT_FINGERPRINT.');
            }
            /* eslint-disable dot-notation */

            // Verify that the generated xpub is correct by deriving an example child and comparing it to the result
            // calculated by the Ledger device. Do not verify the Ledger generated address as it is derived from the
            // pub key anyways.
            const verificationDerivation = extendedPubKey.derivePath(verificationPath);
            if (!verificationDerivation.publicKey.equals(verificationPubKey)
                || !verificationDerivation.chainCode.equals(verificationChainCode)) {
                throw new Error('Failed to verify the constructed xpub.');
            }

            return extendedPubKey.toBase58();
        } catch (e) {
            throw new ErrorState(ErrorType.REQUEST_ASSERTION_FAILED, e, this);
        }
    }
}
