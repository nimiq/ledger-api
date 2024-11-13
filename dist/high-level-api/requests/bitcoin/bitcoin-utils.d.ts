import { Network, AddressTypeBitcoin } from '../../constants';
type NetworkInfo = import('./bitcoin-lib').networks.Network;
export declare function getNetworkInfo(network: Exclude<Network, Network.DEVNET>, addressType: AddressTypeBitcoin): Promise<NetworkInfo>;
export declare function compressPublicKey(publicKey: string): string;
export {};
