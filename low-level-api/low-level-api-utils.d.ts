/// <reference types="node" />
export declare function parsePath(path: string): Buffer;
export declare function publicKeyToAddress(publicKey: Buffer): Promise<string>;
export declare function verifySignature(data: Buffer, signature: Buffer, publicKey: Buffer): Promise<boolean>;
