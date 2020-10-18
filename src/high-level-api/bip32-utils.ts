import { AddressTypeBitcoin, Coin, Network } from './constants';

type Bip32PathParams = {
    addressIndex: number,
    accountIndex?: number,
} & ({
    coin: Coin.NIMIQ,
} | {
    coin: Coin.BITCOIN,
    addressType?: AddressTypeBitcoin,
    network?: Network,
    isInternal?: boolean,
});

// See BIP44
const PATH_REGEX = new RegExp(
    '^'
    + '(\\d+)\'' // purpose id; BIP44 (BTC legacy or Nimiq) / BIP49 (BTC nested SegWit) / BIP84 (BTC native SegWit)
    + '/(\\d+)\'' // coin type; 0 for Bitcoin Mainnet, 1 for Bitcoin Testnet, 242 for Nimiq
    + '/(\\d+)\'' // account index
    + '(?:/(\\d+))?' // 0 for external or 1 for internal address (change); non-hardened; unset for Nimiq
    + '/(\\d+)(\'?)' // address index; non-hardened for BTC, hardened for Nimiq
    + '$',
);

const PURPOSE_ID_MAP_BITCOIN = new Map<AddressTypeBitcoin, number>([
    [AddressTypeBitcoin.LEGACY, 44],
    [AddressTypeBitcoin.P2SH_SEGWIT, 49],
    [AddressTypeBitcoin.NATIVE_SEGWIT, 84],
]);

/**
 * Generate a bip32 path according to path layout specified in bip44 for the specified parameters.
 */
export function getBip32Path(params: Bip32PathParams): string {
    // set defaults
    params = {
        accountIndex: 0,
        ...params,
    };
    switch (params.coin) {
        case Coin.NIMIQ:
            return `44'/242'/${params.accountIndex}'/${params.addressIndex}'`; // Nimiq paths are fully hardened
        case Coin.BITCOIN: {
            // set bitcoin specific defaults
            params = {
                addressType: AddressTypeBitcoin.NATIVE_SEGWIT,
                network: Network.MAINNET,
                isInternal: false,
                ...params,
            };
            const purposeId = PURPOSE_ID_MAP_BITCOIN.get(params.addressType!);
            const coinType = params.network === Network.TESTNET ? 1 : 0;
            const changeType = params.isInternal ? 1 : 0;
            return `${purposeId}'/${coinType}'/${params.accountIndex}'/${changeType}/${params.addressIndex}`;
        }
        default:
            throw new Error(`Unsupported coin: ${(params as any).coin}`);
    }
}

/**
 * Parse bip32 path according to path layout specified in bip44.
 */
export function parseBip32Path(path: string): Required<Bip32PathParams> {
    const pathMatch = path.match(PATH_REGEX);
    if (!pathMatch) throw new Error(`${path} is not a supported bip32 path.`);
    const purposeId = parseInt(pathMatch[1], 10);
    const coinType = parseInt(pathMatch[2], 10);
    const accountIndex = parseInt(pathMatch[3], 10);
    const changeType = pathMatch[4];
    const addressIndex = parseInt(pathMatch[5], 10);
    const isAddressIndexHardened = !!pathMatch[6];

    // Check indices for validity according to bip32. No need to check for negative or fractional numbers, as these are
    // not accepted by the regex.
    if (accountIndex >= 2 ** 31 || addressIndex >= 2 ** 31) throw new Error('Invalid index');

    switch (coinType) {
        case 242:
            // Nimiq
            if (purposeId !== 44) throw new Error('Purpose id must be 44 for Nimiq');
            if (changeType !== undefined) throw new Error('Specifying a change type is not supported for Nimiq');
            if (!isAddressIndexHardened) throw new Error('Address index must be hardened for Nimiq');
            return {
                coin: Coin.NIMIQ,
                accountIndex,
                addressIndex,
            };
        case 0:
        case 1: {
            // Bitcoin
            const knownPurposeIds = [...PURPOSE_ID_MAP_BITCOIN.values()];
            if (!knownPurposeIds.includes(purposeId)) throw new Error('Purpose id must be 44, 49 or 84 for Bitcoin');
            if (changeType === undefined) throw new Error('Specifying a change type is required for Bitcoin');
            if (changeType !== '0' && changeType !== '1') throw new Error('Invalid change type for Bitcoin');
            if (isAddressIndexHardened) throw new Error('Address index must not be hardened for Bitcoin');
            const addressType = [...PURPOSE_ID_MAP_BITCOIN.entries()].find(([,pId]) => pId === purposeId)![0];
            const network = coinType === 0 ? Network.MAINNET : Network.TESTNET;
            const isInternal = changeType === '1';
            return {
                coin: Coin.BITCOIN,
                accountIndex,
                addressIndex,
                addressType,
                network,
                isInternal,
            };
        }
        default:
            throw new Error(`Unsupported coin type ${coinType}`);
    }
}
