import { Coin } from './constants';

const BIP32_BASE_PATH_NIMIQ = '44\'/242\'/0\'/';
const BIP32_PATH_REGEX_NIMIQ = new RegExp(`^${BIP32_BASE_PATH_NIMIQ}(\\d+)'$`);

/**
 * Convert an address's index to the full bip32 path.
 * @param coin - The coin for which to get the full bip32 path.
 * @param addressIndex - The address's index.
 * @returns The full bip32 path.
 */
export function getBip32Path(coin: Coin, addressIndex: number): string {
    switch (coin) {
        case Coin.NIMIQ:
            return `${BIP32_BASE_PATH_NIMIQ}${addressIndex}'`;
        default:
            throw new Error(`Unsupported coin: ${coin}`);
    }
}

/**
 * Extract an address's index / keyId from its bip32 path.
 * @param coin - The coin for which to get the full bip32 path.
 * @param path - The address's bip32 path.
 * @returns The address's index or null if the provided path is not a valid Nimiq key bip32 path.
 */
export function getKeyIdForBip32Path(coin: Coin, path: string): number {
    let pathMatch;
    switch (coin) {
        case Coin.NIMIQ:
            pathMatch = BIP32_PATH_REGEX_NIMIQ.exec(path);
            break;
        default:
            throw new Error(`Unsupported coin: ${coin}`);
    }

    if (!pathMatch) throw new Error(`${path} is not a valid bip32 path for coin ${coin}`);

    return parseInt(pathMatch[pathMatch.length - 1], 10);
}
