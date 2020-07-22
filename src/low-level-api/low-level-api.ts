import {
    parsePath,
    publicKeyToAddress,
    verifySignature,
} from './low-level-api-utils';
import { loadNimiqCore, loadNimiqCryptography } from '../lib/load-nimiq';

type Transport = import('@ledgerhq/hw-transport').default;

const CLA = 0xe0;
const INS_GET_PK = 0x02;
const INS_SIGN_TX = 0x04;
const INS_GET_CONF = 0x06;
const INS_KEEP_ALIVE = 0x08;

const APDU_MAX_SIZE = 150;
const P1_FIRST_APDU = 0x00;
const P1_MORE_APDU = 0x80;
const P1_NO_VALIDATE = 0x00;
const P1_VALIDATE = 0x01;
const P2_LAST_APDU = 0x00;
const P2_MORE_APDU = 0x80;
const P2_NO_CONFIRM = 0x00;
const P2_CONFIRM = 0x01;

const SW_OK = 0x9000;
const SW_CANCEL = 0x6985;
const SW_KEEP_ALIVE = 0x6e02;

// The @ledgerhq libraries use Node Buffers which need to be polyfilled in the browser. To avoid the need to bundle such
// polyfills that an app likely already has bundled in the @ledgerhq libraries, this library expects a global polyfill
// declared on window.
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
    private _transport: Transport;

    constructor(transport: Transport) {
        this._transport = transport;
        transport.decorateAppAPIMethods(
            this,
            ['getAppConfiguration', 'getPublicKey', 'signTransaction'],
            'w0w',
        );
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
     * Get the version of the connected Ledger Nimiq App. Note that some other apps like the Ethereum app also respond
     * to this call.
     */
    public async getAppConfiguration(): Promise<{ version: string }> {
        // Note that no heartbeat is required here as INS_GET_CONF is not interactive but thus answers directly
        const [, major, minor, patch] = await this._transport.send(CLA, INS_GET_CONF, 0x00, 0x00);
        const version = `${major}.${minor}.${patch}`;
        return { version };
    }

    /**
     * Get Nimiq address for a given BIP 32 path.
     * @param path - A path in BIP 32 format.
     * @param boolValidate - Optionally enable key pair validation.
     * @param boolDisplay - Optionally display the address on the ledger.
     * @returns An object with the address.
     * @example
     * nim.getAddress("44'/242'/0'/0'").then(o => o.address)
     */
    public async getAddress(
        path: string,
        boolValidate: boolean = true,
        boolDisplay: boolean = false,
    ): Promise<{ address: string }> {
        // start loading Nimiq core later needed for transforming public key to address and optional validation
        loadNimiqCore();
        loadNimiqCryptography();

        const { publicKey } = await this.getPublicKey(path, boolValidate, boolDisplay);
        const address = await publicKeyToAddress(Buffer.from(publicKey));
        return { address };
    }

    /**
     * Get Nimiq public key for a given BIP 32 path.
     * @param path - A path in BIP 32 format.
     * @param boolValidate - Optionally enable key pair validation.
     * @param boolDisplay - Optionally display the corresponding address on the ledger.
     * @returns An object with the publicKey.
     * @example
     * nim.getPublicKey("44'/242'/0'/0'").then(o => o.publicKey)
     */
    public async getPublicKey(
        path: string,
        boolValidate: boolean = true,
        boolDisplay: boolean = false,
    ): Promise<{ publicKey: Uint8Array }> {
        if (boolValidate) {
            // start loading Nimiq core later needed for validation
            loadNimiqCore();
            loadNimiqCryptography();
        }

        const pathBuffer = parsePath(path);
        const verifyMsg = Buffer.from('p=np?', 'ascii');
        const data = Buffer.concat([pathBuffer, verifyMsg]);

        let response: Buffer;
        response = await this._transport.send(
            CLA,
            INS_GET_PK,
            boolValidate ? P1_VALIDATE : P1_NO_VALIDATE,
            boolDisplay ? P2_CONFIRM : P2_NO_CONFIRM,
            data,
            [SW_OK, SW_KEEP_ALIVE],
        );
        // handle heartbeat
        while (response.slice(response.length - 2).readUInt16BE(0) === SW_KEEP_ALIVE) {
            // eslint-disable-next-line no-await-in-loop
            response = await this._transport.send(CLA, INS_KEEP_ALIVE, 0, 0, undefined, [SW_OK, SW_KEEP_ALIVE]);
        }

        let offset = 0;
        const publicKey = response.slice(offset, offset + 32);
        offset += 32;
        if (boolValidate) {
            const signature = response.slice(offset, offset + 64);
            if (!await verifySignature(verifyMsg, signature, publicKey)) {
                throw new Error(
                    'Bad signature. Keypair is invalid. Please report this.',
                );
            }
        }
        return { publicKey };
    }

    /**
     * Sign a Nimiq transaction.
     * @param path - A path in BIP 32 format.
     * @param txContent - Transaction content in serialized form.
     * @returns An object with the signature.
     * @example
     * nim.signTransaction("44'/242'/0'/0'", signatureBase).then(o => o.signature)
     */
    public async signTransaction(
        path: string,
        txContent: Uint8Array,
    ): Promise<{ signature: Uint8Array }> {
        const pathBuffer = parsePath(path);
        const transaction = Buffer.from(txContent);
        const apdus = [];
        let chunkSize = APDU_MAX_SIZE - pathBuffer.length;
        if (transaction.length <= chunkSize) {
            // it fits in a single apdu
            apdus.push(Buffer.concat([pathBuffer, transaction]));
        } else {
            // we need to send multiple apdus to transmit the entire transaction
            let chunk = Buffer.alloc(chunkSize);
            let offset = 0;
            transaction.copy(chunk, 0, offset, chunkSize);
            apdus.push(Buffer.concat([pathBuffer, chunk]));
            offset += chunkSize;
            while (offset < transaction.length) {
                const remaining = transaction.length - offset;
                chunkSize = remaining < APDU_MAX_SIZE ? remaining : APDU_MAX_SIZE;
                chunk = Buffer.alloc(chunkSize);
                transaction.copy(chunk, 0, offset, offset + chunkSize);
                offset += chunkSize;
                apdus.push(chunk);
            }
        }

        let isHeartbeat = false;
        let chunkIndex = 0;
        let status: number;
        let response: Buffer;
        do {
            const data = apdus[chunkIndex];
            // eslint-disable-next-line no-await-in-loop
            response = await this._transport.send(
                CLA,
                isHeartbeat ? INS_KEEP_ALIVE : INS_SIGN_TX,
                chunkIndex === 0 ? P1_FIRST_APDU : P1_MORE_APDU, // note that for heartbeat p1, p2 and data are ignored
                chunkIndex === apdus.length - 1 ? P2_LAST_APDU : P2_MORE_APDU,
                data,
                [SW_OK, SW_CANCEL, SW_KEEP_ALIVE],
            );
            status = response.slice(response.length - 2).readUInt16BE(0);
            isHeartbeat = status === SW_KEEP_ALIVE;
            if (!isHeartbeat) {
                // we can continue sending data or end the loop when all data was sent
                ++chunkIndex;
            }
        } while (isHeartbeat || chunkIndex < apdus.length);

        if (status !== SW_OK) throw new Error('Transaction approval request was rejected');
        const signature = Buffer.from(response.slice(0, response.length - 2));
        return {
            signature: Uint8Array.from(signature),
        };
    }
}
