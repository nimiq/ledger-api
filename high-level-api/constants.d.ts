export declare enum Coin {
    NIMIQ = "Nimiq",
    BITCOIN = "Bitcoin"
}
export declare enum Network {
    MAINNET = "main",
    TESTNET = "test"
}
export declare enum AddressTypeBitcoin {
    LEGACY = "legacy-bitcoin",
    P2SH_SEGWIT = "p2sh-segwit-bitcoin",
    NATIVE_SEGWIT = "native-segwit-bitcoin"
}
export declare const REQUEST_EVENT_CANCEL = "cancel";
export declare enum RequestTypeNimiq {
    GET_WALLET_ID = "get-wallet-id-nimiq",
    DERIVE_ADDRESSES = "derive-addresses-nimiq",
    GET_PUBLIC_KEY = "get-public-key-nimiq",
    GET_ADDRESS = "get-address-nimiq",
    SIGN_TRANSACTION = "sign-transaction-nimiq"
}
export declare enum RequestTypeBitcoin {
    GET_WALLET_ID = "get-wallet-id-bitcoin",
    GET_ADDRESS_AND_PUBLIC_KEY = "get-address-and-public-key-bitcoin",
    GET_EXTENDED_PUBLIC_KEY = "get-extended-public-key-bitcoin",
    SIGN_TRANSACTION = "sign-transaction-bitcoin"
}
