// Constants needed in lazy chunks and the main chunk.
// As a separate file to be able to use these constants in the main chunk without the need to import the entire lazy
// chunks and to avoid circular dependencies between main entry and other files.

export enum Coin {
    NIMIQ = 'Nimiq',
    BITCOIN = 'Bitcoin',
}

export enum Network {
    MAINNET = 'main',
    TESTNET = 'test',
}

export enum AddressTypeBitcoin {
    LEGACY = 'legacy-bitcoin',
    P2SH_SEGWIT = 'p2sh-segwit-bitcoin',
    NATIVE_SEGWIT = 'native-segwit-bitcoin',
}

export const REQUEST_EVENT_CANCEL = 'cancel';

export enum RequestTypeNimiq {
    GET_WALLET_ID = 'get-wallet-id-nimiq',
    DERIVE_ADDRESSES = 'derive-addresses-nimiq',
    GET_PUBLIC_KEY = 'get-public-key-nimiq',
    GET_ADDRESS = 'get-address-nimiq',
    SIGN_TRANSACTION = 'sign-transaction-nimiq',
}
