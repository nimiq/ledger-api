import {
    splitPath,
    encodeEd25519PublicKey,
    verifyEd25519Signature,
    checkNimiqBip32Path,
} from './low-level-api-utils';

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
 * libraries and does not require inclusion of Nimiq core classes but does on the other hand not include optimizations
 * for specific transport types and return raw bytes.
 *
 * This library is in nature similar to other hw-app packages in @ledgerhq/ledgerjs and partially based on their code,
 * licenced under the Apache 2.0 licence.
 *
 * @example
 * const nim = new LowLevelApi(transport)
 */
export default class LowLevelApi {
    private transport: Transport;

    constructor(transport: Transport) {
        this.transport = transport;
        transport.decorateAppAPIMethods(
            this,
            ['getAppConfiguration', 'getPublicKey', 'getAddress', 'signTransaction'],
            'w0w',
        );
    }

    public async getAppConfiguration(): Promise<{ version: string }> {
        // Note that no heartbeat is required here as INS_GET_CONF is not interactive but thus answers directly
        const [, major, minor, patch] = await this.transport.send(CLA, INS_GET_CONF, 0x00, 0x00);
        const version = `${major}.${minor}.${patch}`;
        return { version };
    }

    /**
     * get Nimiq address for a given BIP 32 path.
     * @param path a path in BIP 32 format
     * @param boolValidate optionally enable key pair validation
     * @param boolDisplay optionally display the address on the ledger
     * @return an object with the address
     * @example
     * nim.getAddress("44'/242'/0'/0'").then(o => o.address)
     */
    public async getAddress(
        path: string,
        boolValidate: boolean = true,
        boolDisplay: boolean = false,
    ): Promise<{ address: string }> {
        checkNimiqBip32Path(path);

        const pathElts = splitPath(path);
        const pathBuffer = Buffer.alloc(1 + pathElts.length * 4);
        pathBuffer[0] = pathElts.length;
        pathElts.forEach((element, index) => {
            pathBuffer.writeUInt32BE(element, 1 + 4 * index);
        });
        const verifyMsg = Buffer.from('p=np?', 'ascii');
        const data = Buffer.concat([pathBuffer, verifyMsg]);

        let response: Buffer;
        response = await this.transport.send(
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
            response = await this.transport.send(CLA, INS_KEEP_ALIVE, 0, 0, undefined, [SW_OK, SW_KEEP_ALIVE]);
        }

        let offset = 0;
        const rawPublicKey = response.slice(offset, offset + 32);
        offset += 32;
        if (boolValidate) {
            const signature = response.slice(offset, offset + 64);
            if (!verifyEd25519Signature(verifyMsg, signature, rawPublicKey)) {
                throw new Error(
                    'Bad signature. Keypair is invalid. Please report this.',
                );
            }
        }
        const address = encodeEd25519PublicKey(rawPublicKey);
        return { address };
    }

    /**
     * get Nimiq public key for a given BIP 32 path.
     * @param path a path in BIP 32 format
     * @param boolValidate optionally enable key pair validation
     * @param boolDisplay optionally display the corresponding address on the ledger
     * @return an object with the publicKey
     * @example
     * nim.getPublicKey("44'/242'/0'/0'").then(o => o.publicKey)
     */
    public async getPublicKey(
        path: string,
        boolValidate = true,
        boolDisplay = false,
    ): Promise<{ publicKey: Uint8Array }> {
        checkNimiqBip32Path(path);

        const pathElts = splitPath(path);
        const pathBuffer = Buffer.alloc(1 + pathElts.length * 4);
        pathBuffer[0] = pathElts.length;
        pathElts.forEach((element, index) => {
            pathBuffer.writeUInt32BE(element, 1 + 4 * index);
        });
        const verifyMsg = Buffer.from('p=np?', 'ascii');
        const data = Buffer.concat([pathBuffer, verifyMsg]);

        let response: Buffer;
        response = await this.transport.send(
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
            response = await this.transport.send(CLA, INS_KEEP_ALIVE, 0, 0, undefined, [SW_OK, SW_KEEP_ALIVE]);
        }

        let offset = 0;
        const publicKey = response.slice(offset, offset + 32);
        offset += 32;
        if (boolValidate) {
            const signature = response.slice(offset, offset + 64);
            if (!verifyEd25519Signature(verifyMsg, signature, publicKey)) {
                throw new Error(
                    'Bad signature. Keypair is invalid. Please report this.',
                );
            }
        }
        return {
            publicKey: Uint8Array.from(publicKey),
        };
    }

    /**
     * sign a Nimiq transaction.
     * @param path a path in BIP 32 format
     * @param txContent transaction content in serialized form
     * @return an object with the signature
     * @example
     * nim.signTransaction("44'/242'/0'/0'", signatureBase).then(o => o.signature)
     */
    public async signTransaction(
        path: string,
        txContent: Uint8Array,
    ): Promise<{ signature: Uint8Array }> {
        checkNimiqBip32Path(path);

        const apdus = [];

        const pathElts = splitPath(path);
        const pathBufferSize = 1 + pathElts.length * 4;
        const pathBuffer = Buffer.alloc(pathBufferSize);
        pathBuffer[0] = pathElts.length;
        pathElts.forEach((element, index) => {
            pathBuffer.writeUInt32BE(element, 1 + 4 * index);
        });
        const transaction = Buffer.from(txContent);
        let chunkSize = APDU_MAX_SIZE - pathBufferSize;
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
            response = await this.transport.send(
                CLA,
                isHeartbeat ? INS_KEEP_ALIVE : INS_SIGN_TX,
                chunkIndex === 0 ? P1_FIRST_APDU : P1_MORE_APDU, // note that for heartbeat p1, p2 and data are ignored
                chunkIndex === apdus.length - 1 ? P2_LAST_APDU : P2_MORE_APDU,
                data,
                [SW_OK, SW_CANCEL, SW_KEEP_ALIVE],
            );
            status = response.slice(response.length - 2).readUInt16BE(0);
            console.log('Status:', status);
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
