import { parsePath, publicKeyToAddress, verifySignature } from './low-level-api-utils';
import getAppNameAndVersion from './get-app-name-and-version';
import { NimiqVersion } from '../shared/constants';
import { loadNimiq } from '../shared/load-nimiq';
import {
    bufferFromAscii,
    bufferFromUtf8,
    bufferFromUint32,
    bufferToUint16,
    concatenateBuffers,
} from '../shared/buffer-utils';

type Transport = import('@ledgerhq/hw-transport').default;

const CLA = 0xe0;
const INS_GET_PK = 0x02;
const INS_SIGN_TX = 0x04;
const INS_KEEP_ALIVE = 0x08;
const INS_SIGN_MESSAGE = 0x0a;

const APDU_MAX_SIZE = 255; // see IO_APDU_BUFFER_SIZE in os.h in ledger sdk
const P1_FIRST_APDU = 0x00;
const P1_MORE_APDU = 0x80;
const P1_NO_VALIDATE = 0x00;
const P1_VALIDATE = 0x01;
const P2_LAST_APDU = 0x00;
const P2_MORE_APDU = 0x80;
const P2_NO_CONFIRM = 0x00;
const P2_CONFIRM = 0x01;

const MESSAGE_FLAG_PREFER_DISPLAY_TYPE_HEX = 1 << 0; // eslint-disable-line no-bitwise
const MESSAGE_FLAG_PREFER_DISPLAY_TYPE_HASH = 1 << 1; // eslint-disable-line no-bitwise

// Definition of common status words:
// - https://github.com/LedgerHQ/ledger-secure-sdk/blob/master/include/errors.h
// - https://github.com/LedgerHQ/app-bitcoin-new/blob/master/src/boilerplate/sw.h
// - https://github.com/LedgerHQ/app-bitcoin/blob/master/include/btchip_apdu_constants.h
// - https://ledgerhq.github.io/btchip-doc/bitcoin-technical-beta.html#_status_words
const SW_OK = 0x9000;
const SW_CANCEL = 0x6985;
const SW_KEEP_ALIVE = 0x6e02;

const U2F_SCRAMBLE_KEY = 'w0w';

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
    private _transport: Transport;

    constructor(transport: Transport) {
        this._transport = transport;
        // Note that getAppNameAndVersion does not need to be decorated, as we're decorating it manually. Also note that
        // the registered methods here do not intersect with the methods of the Bitcoin api, therefore, we can re-use
        // the same transport instance for both, NIM and BTC apis (as long as a switch between NIM and BTC apps doesn't
        // cause a disconnect).
        transport.decorateAppAPIMethods(
            this,
            ['getPublicKey', 'signTransaction'],
            U2F_SCRAMBLE_KEY,
        );
    }

    public get transport(): Transport {
        return this._transport;
    }

    /**
     * Close the transport instance. Note that this does not emit a disconnect. Disconnects are only emitted when the
     * device actually disconnects (or switches it's descriptor which happens when switching to the dashboard or apps).
     */
    public async close() {
        try {
            await this._transport.close();
        } catch (e) {
            // Ignore. Transport might already be closed.
        }
    }

    /**
     * Get the name of the connected app and the app version.
     * @returns An object with the name and version.
     * @example
     * nim.getAppNameAndVersion().then(o => o.version)
     */
    public async getAppNameAndVersion(): Promise<{ name: string, version: string }> {
        return getAppNameAndVersion(this._transport, U2F_SCRAMBLE_KEY);
    }

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
    public async getAddress(
        path: string,
        boolValidate: boolean = true,
        boolDisplay: boolean = false,
        nimiqVersion: NimiqVersion = NimiqVersion.ALBATROSS,
    ): Promise<{ address: string }> {
        // Start loading Nimiq core later needed for hashing public key to address and optional validation.
        loadNimiq(nimiqVersion, /* include cryptography */ true).catch(() => {});

        const { publicKey } = await this.getPublicKey(path, boolValidate, boolDisplay, nimiqVersion);
        const address = await publicKeyToAddress(publicKey, nimiqVersion);
        return { address };
    }

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
    public async getPublicKey(
        path: string,
        boolValidate: boolean = true,
        boolDisplay: boolean = false,
        nimiqVersion: NimiqVersion = NimiqVersion.ALBATROSS,
    ): Promise<{ publicKey: Uint8Array }> {
        if (boolValidate) {
            // Start loading Nimiq core later needed for validation.
            loadNimiq(nimiqVersion, /* include cryptography */ true).catch(() => {});
        }

        const pathBytes = parsePath(path);
        // Validation message including prefix "dummy-data:" as required since app version 2.0 to avoid the risks of
        // blind signing.
        const validationMessage = bufferFromAscii('dummy-data:p=np?');
        const data = boolValidate ? concatenateBuffers(pathBytes, validationMessage) : pathBytes;

        let response: Uint8Array;
        response = await this._transport.send(
            CLA,
            INS_GET_PK,
            boolValidate ? P1_VALIDATE : P1_NO_VALIDATE,
            boolDisplay ? P2_CONFIRM : P2_NO_CONFIRM,
            data as Buffer, // send currently expects a Buffer, while a Uint8Array suffices
            [SW_OK, SW_KEEP_ALIVE],
        );
        // handle heartbeat
        while (bufferToUint16(response.slice(response.length - 2)) === SW_KEEP_ALIVE) {
            // eslint-disable-next-line no-await-in-loop
            response = await this._transport.send(CLA, INS_KEEP_ALIVE, 0, 0, undefined, [SW_OK, SW_KEEP_ALIVE]);
        }

        let offset = 0;
        const publicKey = response.slice(offset, offset + 32);
        offset += 32;
        if (boolValidate) {
            const signature = response.slice(offset, offset + 64);
            if (!await verifySignature(validationMessage, signature, publicKey, nimiqVersion)) {
                throw new Error(
                    'Bad signature. Keypair is invalid. Please report this.',
                );
            }
        }
        return { publicKey };
    }

    /* eslint-disable lines-between-class-members */
    /**
     * Sign a Nimiq transaction.
     * @param path - A path in BIP 32 format.
     * @param transaction - Transaction content in serialized form.
     * @param [nimiqVersion] - Of which format / version the serialized transaction is. By default Albatross.
     * @param [appVersion] - For legacy transactions used to determine whether to transmit a version byte. If the
     *  connected app version is already known, you can pass it to avoid the overhead of querying it again.
     * @returns An object with the signature.
     * @example
     * nim.signTransaction("44'/242'/0'/0'", transaction).then(o => o.signature)
     */
    public async signTransaction(
        path: string,
        transaction: Uint8Array,
        nimiqVersion: NimiqVersion.LEGACY,
        appVersion?: string,
    ): Promise<{ signature: Uint8Array, stakerSignature?: undefined }>;
    public async signTransaction(
        path: string,
        transaction: Uint8Array,
        nimiqVersion?: NimiqVersion,
    ): Promise<{ signature: Uint8Array, stakerSignature?: Uint8Array }>;
    public async signTransaction(
        path: string,
        transaction: Uint8Array,
        nimiqVersion: NimiqVersion = NimiqVersion.ALBATROSS,
        appVersion?: string,
    ): Promise<{ signature: Uint8Array, stakerSignature?: Uint8Array }> {
        // The Nimiq version byte was added in app version 2. It supports both, legacy and Albatross transactions, and
        // is the first app version to support Albatross. Note that wrongly sending a legacy transaction without version
        // byte to the 2.0 app does no harm, as the app will reject it. Neither does sending an Albatross transaction,
        // with version byte, to a legacy app before 2.0 as the app will interpret the version byte of value 1 as the
        // first byte of the uint16 data length, resulting in a data length longer than the allowed max which will be
        // rejected.
        if (nimiqVersion === NimiqVersion.LEGACY && !appVersion) {
            ({ version: appVersion } = await getAppNameAndVersion(
                this._transport,
                U2F_SCRAMBLE_KEY,
                /* withApiLock */ false, // Don't lock the api, as we already locked it for signTransaction.
            ));
        }
        const includeVersionByte = nimiqVersion === NimiqVersion.ALBATROSS || parseInt(appVersion || '') >= 2;

        const pathBytes = parsePath(path);
        const versionByte = includeVersionByte
            ? new Uint8Array([nimiqVersion === NimiqVersion.ALBATROSS ? 1 : 0])
            : new Uint8Array();

        const apdus: Array<Uint8Array> = [];
        let transactionChunkSize = Math.min(transaction.length, APDU_MAX_SIZE - pathBytes.length - versionByte.length);
        let transactionOffset = 0;
        let transactionChunk = transaction.subarray(transactionOffset, transactionOffset + transactionChunkSize);
        apdus.push(concatenateBuffers(pathBytes, versionByte, transactionChunk));
        transactionOffset += transactionChunkSize;
        while (transactionOffset < transaction.length) {
            transactionChunkSize = Math.min(transaction.length - transactionOffset, APDU_MAX_SIZE);
            transactionChunk = transaction.subarray(transactionOffset, transactionOffset + transactionChunkSize);
            transactionOffset += transactionChunkSize;
            apdus.push(transactionChunk);
        }

        let isHeartbeat = false;
        let chunkIndex = 0;
        let status: number;
        let response: Uint8Array;
        do {
            const data = apdus[chunkIndex];
            // eslint-disable-next-line no-await-in-loop
            response = await this._transport.send(
                CLA,
                isHeartbeat ? INS_KEEP_ALIVE : INS_SIGN_TX,
                chunkIndex === 0 ? P1_FIRST_APDU : P1_MORE_APDU, // note that for heartbeat p1, p2 and data are ignored
                chunkIndex === apdus.length - 1 ? P2_LAST_APDU : P2_MORE_APDU,
                data as Buffer, // send currently expects a Buffer, while a Uint8Array suffices
                [SW_OK, SW_CANCEL, SW_KEEP_ALIVE],
            );
            status = bufferToUint16(response.slice(response.length - 2));
            isHeartbeat = status === SW_KEEP_ALIVE;
            if (!isHeartbeat) {
                // we can continue sending data or end the loop when all data was sent
                ++chunkIndex;
            }
        } while (isHeartbeat || chunkIndex < apdus.length);

        if (status !== SW_OK) throw new Error('Transaction approval request was rejected');
        const signatureCount = (response.length - /* sw */ 2) / 64;
        if (signatureCount !== 1 && signatureCount !== 2) {
            throw new Error('Unexpected response length');
        }
        const signature = response.slice(0, 64);
        let stakerSignature: Uint8Array | undefined;
        if (signatureCount === 2) {
            if (nimiqVersion === NimiqVersion.LEGACY) {
                throw new Error('Unexpected staker signature on legacy transaction');
            }
            stakerSignature = response.slice(64, 128);
        }
        return { signature, stakerSignature };
    }
    /* eslint-enable lines-between-class-members */

    /**
     * Sign a message with a Nimiq key.
     * @param path - A path in BIP 32 format.
     * @param message - Message to sign as utf8 string or arbitrary bytes.
     * @param [flags] - Flags to pass. Currently supported: `preferDisplayTypeHex` and `preferDisplayTypeHash`.
     * @returns An object with the signature.
     * @example
     * nim.signMessage("44'/242'/0'/0'", message).then(o => o.signature)
     */
    public async signMessage(
        path: string,
        message: string | Uint8Array,
        flags?: number | {
            preferDisplayTypeHex: boolean, // first choice, if multiple flags are set
            preferDisplayTypeHash: boolean, // second choice, if multiple flags are set
        },
    ): Promise<{ signature: Uint8Array }> {
        const pathBytes = parsePath(path);
        const messageBytes = typeof message === 'string' ? bufferFromUtf8(message) : message;
        flags = typeof flags === 'object'
            // eslint-disable-next-line no-bitwise
            ? (flags.preferDisplayTypeHex ? MESSAGE_FLAG_PREFER_DISPLAY_TYPE_HEX : 0)
                | (flags.preferDisplayTypeHash ? MESSAGE_FLAG_PREFER_DISPLAY_TYPE_HASH : 0)
            : flags || 0;
        const flagsByte = new Uint8Array([flags]);
        if (messageBytes.length >= 2 ** 32) {
            // the message length must fit an uint32
            throw new Error('Message too long');
        }
        const messageLengthBytes = bufferFromUint32(messageBytes.length);

        const apdus: Array<Uint8Array> = [];
        let messageChunkSize = Math.min(
            messageBytes.length,
            APDU_MAX_SIZE - pathBytes.length - flagsByte.length - messageLengthBytes.length,
        );
        let messageOffset = 0;
        let messageChunk = messageBytes.subarray(messageOffset, messageOffset + messageChunkSize);
        apdus.push(concatenateBuffers(pathBytes, flagsByte, messageLengthBytes, messageChunk));
        messageOffset += messageChunkSize;
        while (messageOffset < messageBytes.length) {
            messageChunkSize = Math.min(messageBytes.length - messageOffset, APDU_MAX_SIZE);
            messageChunk = messageBytes.subarray(messageOffset, messageOffset + messageChunkSize);
            messageOffset += messageChunkSize;
            apdus.push(messageChunk);
        }

        let isHeartbeat = false;
        let chunkIndex = 0;
        let status: number;
        let response: Uint8Array;
        do {
            const data = apdus[chunkIndex];
            // eslint-disable-next-line no-await-in-loop
            response = await this._transport.send(
                CLA,
                isHeartbeat ? INS_KEEP_ALIVE : INS_SIGN_MESSAGE,
                chunkIndex === 0 ? P1_FIRST_APDU : P1_MORE_APDU, // note that for heartbeat p1, p2 and data are ignored
                chunkIndex === apdus.length - 1 ? P2_LAST_APDU : P2_MORE_APDU,
                data as Buffer, // send currently expects a Buffer, while a Uint8Array suffices
                [SW_OK, SW_CANCEL, SW_KEEP_ALIVE],
            );
            status = bufferToUint16(response.slice(response.length - 2));
            isHeartbeat = status === SW_KEEP_ALIVE;
            if (!isHeartbeat) {
                // we can continue sending data or end the loop when all data was sent
                ++chunkIndex;
            }
        } while (isHeartbeat || chunkIndex < apdus.length);

        if (status !== SW_OK) throw new Error('Message approval request was rejected');
        const signature = response.slice(0, response.length - 2);
        return { signature };
    }
}
