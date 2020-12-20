import { Network, AddressTypeBitcoin } from '../../constants';
declare type NetworkInfo = import('./bitcoin-lib').networks.Network;
export declare function getNetworkInfo(network: Network, addressType: AddressTypeBitcoin): Promise<NetworkInfo>;
export declare function compressPublicKey(publicKey: string): string;
export {};
