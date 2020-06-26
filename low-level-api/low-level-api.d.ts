/// <reference types="node" />
declare type Transport = import('@ledgerhq/hw-transport').default;
declare global {
    interface Window {
        Buffer?: typeof Buffer;
    }
}
/**
 * Nimiq API
 *
 * Low level api for communication with the Ledger wallet Nimiq app. This lib is compatible with all @ledgerhq/transport
 * libraries but does on the other hand not include optimizations for specific transport types and returns raw bytes.
 *
 * This library is in nature similar to other hw-app packages in @ledgerhq/ledgerjs and partially based on their code,
 * licenced under the Apache 2.0 licence.
 *
 * @example
 * const nim = new LowLevelApi(transport)
 */
export default class LowLevelApi {
    private _transport;
    constructor(transport: Transport);
    /**
     * Close the transport instance. Note that this does not emit a disconnect. Disconnects are only emitted when the
     * device actually disconnects (or switches it's descriptor which happens when switching to the dashboard or apps).
     */
    close(): void;
    /**
     * Get the version of the connected Ledger Nimiq App. Note that some other apps like the Ethereum app also respond
     * to this call.
     */
    getAppConfiguration(): Promise<{
        version: string;
    }>;
    /**
     * Get Nimiq address for a given BIP 32 path.
     * @param path - A path in BIP 32 format.
     * @param boolValidate - Optionally enable key pair validation.
     * @param boolDisplay - Optionally display the address on the ledger.
     * @returns An object with the address.
     * @example
     * nim.getAddress("44'/242'/0'/0'").then(o => o.address)
     */
    getAddress(path: string, boolValidate?: boolean, boolDisplay?: boolean): Promise<{
        address: string;
    }>;
    /**
     * Get Nimiq public key for a given BIP 32 path.
     * @param path - A path in BIP 32 format.
     * @param boolValidate - Optionally enable key pair validation.
     * @param boolDisplay - Optionally display the corresponding address on the ledger.
     * @returns An object with the publicKey.
     * @example
     * nim.getPublicKey("44'/242'/0'/0'").then(o => o.publicKey)
     */
    getPublicKey(path: string, boolValidate?: boolean, boolDisplay?: boolean): Promise<{
        publicKey: Uint8Array;
    }>;
    /**
     * Sign a Nimiq transaction.
     * @param path - A path in BIP 32 format.
     * @param txContent - Transaction content in serialized form.
     * @returns An object with the signature.
     * @example
     * nim.signTransaction("44'/242'/0'/0'", signatureBase).then(o => o.signature)
     */
    signTransaction(path: string, txContent: Uint8Array): Promise<{
        signature: Uint8Array;
    }>;
}
export {};
