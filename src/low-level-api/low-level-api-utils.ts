// Note: this code is partially taken from @ledgerhq/hw-app-str licenced under Apache 2.0

import nacl from 'tweetnacl';
import { encode as base32Encode } from 'base32.js/base32.js';
import { blake2b } from 'blakejs/blake2b.js';

// TODO use bip32-path library
export function splitPath(path: string): number[] {
    const result: number[] = [];
    const components = path.split('/');
    components.forEach((element) => {
        let number = parseInt(element, 10);
        if (Number.isNaN(number)) {
            return; // FIXME shouldn't it throws instead?
        }
        if (element.length > 1 && element[element.length - 1] === '\'') {
            number += 0x80000000;
        }
        result.push(number);
    });
    return result;
}

export function foreach<T, A>(
    arr: T[],
    callback: (entry: T, index: number) => Promise<A>,
): Promise<A[]> {
    function iterate(index: number, array: T[], result: A[]): Promise<A[]> {
        if (index >= array.length) {
            return Promise.resolve(result);
        }
        return callback(array[index], index).then((res) => {
            result.push(res);
            return iterate(index + 1, array, result);
        });
    }

    return iterate(0, arr, []);
}

export function encodeEd25519PublicKey(rawPublicKey: Buffer): string {
    function _ibanCheck(str: string): number {
        const num: string = str.split('').map((c: string) => {
            const code: number = c.toUpperCase().charCodeAt(0);
            return code >= 48 && code <= 57 ? c : (code - 55).toString();
        }).join('');
        let tmp: string = '';

        for (let i = 0; i < Math.ceil(num.length / 6); i++) {
            tmp = (Number.parseInt(tmp + num.substr(i * 6, 6), 10) % 97).toString();
        }
        return Number.parseInt(tmp, 10);
    }

    const hash: Uint8Array = blake2b(rawPublicKey, undefined, 32).subarray(0, 20);
    const base32enconded: string = base32Encode(hash, {
        type: 'crockford',
        alphabet: '0123456789ABCDEFGHJKLMNPQRSTUVXY',
    });
    const check: string = (`00${98 - _ibanCheck(`${base32enconded}NQ00`)}`).slice(-2);
    let res: string = `NQ${check}${base32enconded}`;
    res = res.replace(/.{4}/g, '$& ').trim();
    return res;
}

export function verifyEd25519Signature(
    data: Buffer,
    signature: Buffer,
    publicKey: Buffer,
): boolean {
    return nacl.sign.detached.verify(
        new Uint8Array(data.toJSON().data),
        new Uint8Array(signature.toJSON().data),
        new Uint8Array(publicKey.toJSON().data),
    );
}

export function checkNimiqBip32Path(path: string): void {
    if (!path.startsWith('44\'/242\'')) {
        throw new Error(
            `Not a Nimiq BIP32 path. Path: ${path}. The Nimiq app is authorized only for paths starting with 44'/242'. `
            + ' Example: 44\'/242\'/0\'/0\'',
        );
    }
    path.split('/').forEach((element) => {
        if (!element.toString().endsWith('\'')) {
            throw new Error(
                'Detected a non-hardened path element in requested BIP32 path.'
                + ' Non-hardended paths are not supported at this time. Please use an all-hardened path.'
                + ' Example: 44\'/242\'/0\'/0\'',
            );
        }
    });
}
