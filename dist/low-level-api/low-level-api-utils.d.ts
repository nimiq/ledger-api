/// <reference types="node" />
import { NimiqVersion } from '../lib/constants';
export declare function parsePath(path: string): Buffer;
export declare function publicKeyToAddress(publicKey: Buffer, nimiqVersion: NimiqVersion): Promise<string>;
export declare function verifySignature(data: Buffer | Uint8Array, signature: Buffer | Uint8Array, publicKey: Buffer | Uint8Array, nimiqVersion: NimiqVersion): Promise<boolean>;
