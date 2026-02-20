// Constants for the high-level-api needed in lazy chunks and the main chunk.
// As a separate file to be able to use these constants in the main chunk without the need to import the entire lazy
// chunks and to avoid circular dependencies between main entry and other files.

import { NimiqVersion } from '../shared/constants';

export enum Coin {
    NIMIQ = 'Nimiq',
    BITCOIN = 'Bitcoin',
}

export enum Network {
    MAINNET = 'main',
    TESTNET = 'test',
    DEVNET = 'dev',
}

// See https://github.com/nimiq/core-rs-albatross/blob/albatross/primitives/src/networks.rs
export const NetworkIdNimiq = {
    [Network.MAINNET]: 24,
    [Network.TESTNET]: 5,
    [Network.DEVNET]: 6,
    [NimiqVersion.LEGACY]: {
        [Network.MAINNET]: 42,
        [Network.TESTNET]: 1,
        [Network.DEVNET]: 2,
    },
} as const;

// See https://github.com/nimiq/core-rs-albatross/blob/albatross/primitives/src/account.rs
// We redefine this enum, to avoid Nimiq core being bundled, or parts of it.
export enum AccountTypeNimiq {
    BASIC = 0,
    VESTING = 1,
    HTLC = 2,
    STAKING = 3,
}

// See https://github.com/nimiq/core-rs-albatross/blob/albatross/primitives/transaction/src/lib.rs
export enum TransactionFlagsNimiq {
    NONE = 0b0,
    CONTRACT_CREATION = 0b1,
    SIGNALING = 0b10,
}

export enum AddressTypeBitcoin {
    LEGACY = 'legacy-bitcoin',
    P2SH_SEGWIT = 'p2sh-segwit-bitcoin',
    NATIVE_SEGWIT = 'native-segwit-bitcoin',
}

export const LedgerAddressFormatMapBitcoin = {
    [AddressTypeBitcoin.LEGACY]: 'legacy' as 'legacy',
    [AddressTypeBitcoin.P2SH_SEGWIT]: 'p2sh' as 'p2sh',
    [AddressTypeBitcoin.NATIVE_SEGWIT]: 'bech32' as 'bech32',
};

export const REQUEST_EVENT_CANCEL = 'cancel';

export enum RequestTypeNimiq {
    GET_WALLET_ID = 'get-wallet-id-nimiq',
    DERIVE_ADDRESSES = 'derive-addresses-nimiq',
    GET_PUBLIC_KEY = 'get-public-key-nimiq',
    GET_ADDRESS = 'get-address-nimiq',
    SIGN_TRANSACTION = 'sign-transaction-nimiq',
    SIGN_MESSAGE = 'sign-message-nimiq',
}

export enum RequestTypeBitcoin {
    GET_WALLET_ID = 'get-wallet-id-bitcoin',
    GET_ADDRESS_AND_PUBLIC_KEY = 'get-address-and-public-key-bitcoin',
    GET_EXTENDED_PUBLIC_KEY = 'get-extended-public-key-bitcoin',
    SIGN_TRANSACTION = 'sign-transaction-bitcoin',
    SIGN_MESSAGE = 'sign-message-bitcoin',
}
