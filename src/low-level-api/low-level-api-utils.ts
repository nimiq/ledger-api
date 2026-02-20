import { NimiqVersion } from '../shared/constants';
import { isNimiqLegacy, loadNimiq } from '../shared/load-nimiq';

export function parsePath(path: string): Uint8Array {
    if (!path.startsWith('44\'/242\'')) {
        throw new Error(
            `Not a Nimiq BIP32 path. Path: ${path}. The Nimiq app is authorized only for paths starting with 44'/242'. `
            + ' Example: 44\'/242\'/0\'/0\'',
        );
    }

    const pathParts: number[] = path.split('/').map((part) => {
        let number = parseInt(part, 10);
        if (Number.isNaN(number)) {
            throw new Error(`Invalid path: ${path}`);
        }
        if (part.endsWith('\'')) {
            number += 0x80000000;
        } else {
            throw new Error(
                'Detected a non-hardened path element in requested BIP32 path.'
                + ' Non-hardended paths are not supported at this time. Please use an all-hardened path.'
                + ' Example: 44\'/242\'/0\'/0\'',
            );
        }
        return number;
    });

    const pathBytes = new Uint8Array(1 + pathParts.length * 4);
    const pathBytesView = new DataView(pathBytes.buffer);
    pathBytes[0] = pathParts.length;
    pathParts.forEach((element, index) => {
        pathBytesView.setUint32(1 + 4 * index, element);
    });
    return pathBytes;
}

export async function publicKeyToAddress(publicKey: Uint8Array, nimiqVersion: NimiqVersion): Promise<string> {
    // Cryptography is needed for hashing public key to an address.
    const Nimiq = await loadNimiq(nimiqVersion, /* include cryptography */ true);
    return new Nimiq.PublicKey(publicKey).toAddress().toUserFriendlyAddress();
}

export async function verifySignature(
    data: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
    nimiqVersion: NimiqVersion,
): Promise<boolean> {
    // Cryptography is needed for verifying signatures.
    const Nimiq = await loadNimiq(nimiqVersion, /* include cryptography */ true);
    if (isNimiqLegacy(Nimiq)) {
        const nimiqSignature = new Nimiq.Signature(signature);
        const nimiqPublicKey = new Nimiq.PublicKey(publicKey);
        return nimiqSignature.verify(nimiqPublicKey, data);
    } else {
        const nimiqSignature = Nimiq.Signature.deserialize(signature);
        const nimiqPublicKey = new Nimiq.PublicKey(publicKey);
        return nimiqPublicKey.verify(nimiqSignature, data);
    }
}
