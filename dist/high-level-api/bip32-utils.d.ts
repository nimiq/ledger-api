import { AddressTypeBitcoin, Coin, Network } from './constants';
type Bip32PathParams = {
    addressIndex: number;
    accountIndex?: number;
} & ({
    coin: Coin.NIMIQ;
} | {
    coin: Coin.BITCOIN;
    addressType?: AddressTypeBitcoin;
    network?: Exclude<Network, Network.DEVNET>;
    isInternal?: boolean;
});
/**
 * Generate a bip32 path according to path layout specified in bip44 for the specified parameters.
 */
export declare function getBip32Path(params: Bip32PathParams): string;
/**
 * Parse bip32 path according to path layout specified in bip44.
 */
export declare function parseBip32Path(path: string): Required<Bip32PathParams> & {
    accountPath: string;
};
export {};
