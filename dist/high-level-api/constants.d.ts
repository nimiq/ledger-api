export declare enum Coin {
    NIMIQ = "Nimiq",
    BITCOIN = "Bitcoin"
}
export declare enum Network {
    MAINNET = "main",
    TESTNET = "test",
    DEVNET = "dev"
}
export declare const NetworkIdNimiq: {
    readonly main: 24;
    readonly test: 5;
    readonly dev: 6;
    readonly legacy: {
        readonly main: 42;
        readonly test: 1;
        readonly dev: 2;
    };
};
export declare enum AccountTypeNimiq {
    BASIC = 0,
    VESTING = 1,
    HTLC = 2,
    STAKING = 3
}
export declare enum TransactionFlagsNimiq {
    NONE = 0,
    CONTRACT_CREATION = 1,
    SIGNALING = 2
}
export declare enum AddressTypeBitcoin {
    LEGACY = "legacy-bitcoin",
    P2SH_SEGWIT = "p2sh-segwit-bitcoin",
    NATIVE_SEGWIT = "native-segwit-bitcoin"
}
export declare const LedgerAddressFormatMapBitcoin: {
    "legacy-bitcoin": "legacy";
    "p2sh-segwit-bitcoin": "p2sh";
    "native-segwit-bitcoin": "bech32";
};
export declare const REQUEST_EVENT_CANCEL = "cancel";
export declare enum RequestTypeNimiq {
    GET_WALLET_ID = "get-wallet-id-nimiq",
    DERIVE_ADDRESSES = "derive-addresses-nimiq",
    GET_PUBLIC_KEY = "get-public-key-nimiq",
    GET_ADDRESS = "get-address-nimiq",
    SIGN_TRANSACTION = "sign-transaction-nimiq",
    SIGN_MESSAGE = "sign-message-nimiq"
}
export declare enum RequestTypeBitcoin {
    GET_WALLET_ID = "get-wallet-id-bitcoin",
    GET_ADDRESS_AND_PUBLIC_KEY = "get-address-and-public-key-bitcoin",
    GET_EXTENDED_PUBLIC_KEY = "get-extended-public-key-bitcoin",
    SIGN_TRANSACTION = "sign-transaction-bitcoin",
    SIGN_MESSAGE = "sign-message-bitcoin"
}
