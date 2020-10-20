import { Network, AddressTypeBitcoin } from '../../constants';

type NetworkInfo = import('./bitcoin-lib').networks.Network;

// TODO if in the future the interchangeability of bitcoin-lib with the Nimiq hub's BitcoinJS is not needed anymore,
//  this can move directly into the lazy loaded bitcoin-lib and then also be lazy loaded.
export async function getNetworkInfo(network: Network, addressType: AddressTypeBitcoin): Promise<NetworkInfo> {
    // async because bitcoin-lib is lazy loaded
    const { networks } = await import('./bitcoin-lib');

    const result: NetworkInfo = {
        [Network.MAINNET]: networks.bitcoin,
        [Network.TESTNET]: networks.testnet,
    }[network];
    if (!result) throw new Error(`Unsupported network ${network}`);

    // Bip32 version bytes for different address types which are not all defined by the bip32 lib,
    // see https://github.com/satoshilabs/slips/blob/master/slip-0132.md#registered-hd-version-bytes
    const versionBytes = {
        [AddressTypeBitcoin.LEGACY]: {
            [Network.MAINNET]: networks.bitcoin.bip32,
            [Network.TESTNET]: networks.testnet.bip32,
        },
        [AddressTypeBitcoin.P2SH_SEGWIT]: {
            [Network.MAINNET]: {
                public: 0x049d7cb2, // ypub
                private: 0x049d7878, // yprv
            },
            [Network.TESTNET]: {
                public: 0x044a5262, // upub
                private: 0x044a4e28, // uprv
            },
        },
        [AddressTypeBitcoin.NATIVE_SEGWIT]: {
            [Network.MAINNET]: {
                public: 0x04b24746, // zpub
                private: 0x04b2430c, // zprv
            },
            [Network.TESTNET]: {
                public: 0x045f1cf6, // vpub
                private: 0x045f18bc, // vprv
            },
        },
    }[addressType][network]; // TODO should be using optional chaining here once we update rollup
    if (!versionBytes) throw new Error(`Unknown version bytes for network ${network}, address type ${addressType}`);

    return {
        ...result,
        bip32: versionBytes,
    };
}

// Taken from https://github.com/LedgerHQ/ledger-wallet-webtool/blob/master/src/PathFinderUtils.js#L31
// Also see https://github.com/LedgerHQ/ledgerjs/blob/master/packages/hw-app-btc/src/compressPublicKey.js for a version
// operating on buffers. However, usage requires then loading the Buffer polyfill.
export function compressPublicKey(publicKey: string): string {
    let compressedKeyIndex;
    if (publicKey.substring(0, 2) !== '04') {
        throw new Error('Invalid public key format');
    }
    if (parseInt(publicKey.substring(128, 130), 16) % 2 !== 0) {
        compressedKeyIndex = '03';
    } else {
        compressedKeyIndex = '02';
    }
    return compressedKeyIndex + publicKey.substring(2, 66);
}
