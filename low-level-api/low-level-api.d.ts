/// <reference types="node" />
import { NimiqVersion } from '../lib/constants';
type Transport = import('@ledgerhq/hw-transport').default;
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
    get transport(): Transport;
    /**
     * Close the transport instance. Note that this does not emit a disconnect. Disconnects are only emitted when the
     * device actually disconnects (or switches it's descriptor which happens when switching to the dashboard or apps).
     */
    close(): Promise<void>;
    /**
     * Get the name of the connected app and the app version.
     * @returns An object with the name and version.
     * @example
     * nim.getAppNameAndVersion().then(o => o.version)
     */
    getAppNameAndVersion(): Promise<{
        name: string;
        version: string;
    }>;
    /**
     * Get Nimiq address for a given BIP 32 path.
     * @param path - A path in BIP 32 format.
     * @param [boolValidate] - Optionally enable key pair validation.
     * @param [boolDisplay] - Optionally display the address on the ledger.
     * @param [nimiqVersion] - Optionally choose which Nimiq library version to use for internal computations.
     * @returns An object with the address.
     * @example
     * nim.getAddress("44'/242'/0'/0'").then(o => o.address)
     */
    getAddress(path: string, boolValidate?: boolean, boolDisplay?: boolean, nimiqVersion?: NimiqVersion): Promise<{
        address: string;
    }>;
    /**
     * Get Nimiq public key for a given BIP 32 path.
     * @param path - A path in BIP 32 format.
     * @param [boolValidate] - Optionally enable key pair validation.
     * @param [boolDisplay] - Optionally display the corresponding address on the ledger.
     * @param [nimiqVersion] - Optionally choose which Nimiq library version to use for internal computations.
     * @returns An object with the publicKey.
     * @example
     * nim.getPublicKey("44'/242'/0'/0'").then(o => o.publicKey)
     */
    getPublicKey(path: string, boolValidate?: boolean, boolDisplay?: boolean, nimiqVersion?: NimiqVersion): Promise<{
        publicKey: Uint8Array;
    }>;
    /**
     * Sign a Nimiq transaction.
     * @param path - A path in BIP 32 format.
     * @param txContent - Transaction content in serialized form.
     * @param [nimiqVersion] - Of which format / version the serialized transaction is. By default Albatross.
     * @param [appVersion] - For legacy transactions used to determine whether to transmit a version byte. If the
     *  connected app version is already known, you can pass it to avoid the overhead of querying it again.
     * @returns An object with the signature.
     * @example
     * nim.signTransaction("44'/242'/0'/0'", txContent).then(o => o.signature)
     */
    signTransaction(path: string, txContent: Uint8Array, nimiqVersion: NimiqVersion.LEGACY, appVersion?: string): Promise<{
        signature: Uint8Array;
        stakerSignature?: undefined;
    }>;
    signTransaction(path: string, txContent: Uint8Array, nimiqVersion?: NimiqVersion): Promise<{
        signature: Uint8Array;
        stakerSignature?: Uint8Array;
    }>;
    /**
     * Sign a message with a Nimiq key.
     * @param path - A path in BIP 32 format.
     * @param message - Message to sign as utf8 string or arbitrary bytes.
     * @param [flags] - Flags to pass. Currently supported: `preferDisplayTypeHex` and `preferDisplayTypeHash`.
     * @returns An object with the signature.
     * @example
     * nim.signMessage("44'/242'/0'/0'", message).then(o => o.signature)
     */
    signMessage(path: string, message: string | Uint8Array, flags?: number | {
        preferDisplayTypeHex: boolean;
        preferDisplayTypeHash: boolean;
    }): Promise<{
        signature: Uint8Array;
    }>;
}
export {};
