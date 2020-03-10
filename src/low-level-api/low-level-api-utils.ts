import { loadNimiqCore, loadNimiqCryptography } from '../lib/load-nimiq';

export function parsePath(path: string): Buffer {
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

    const pathBuffer = Buffer.alloc(1 + pathParts.length * 4);
    pathBuffer[0] = pathParts.length;
    pathParts.forEach((element, index) => {
        pathBuffer.writeUInt32BE(element, 1 + 4 * index);
    });
    return pathBuffer;
}

export async function publicKeyToAddress(publicKey: Buffer): Promise<string> {
    const [Nimiq] = await Promise.all([
        loadNimiqCore(),
        loadNimiqCryptography(), // needed for hashing public key to an address
    ]);
    return Nimiq.PublicKey.unserialize(new Nimiq.SerialBuffer(publicKey)).toAddress().toUserFriendlyAddress();
}

export async function verifySignature(
    data: Buffer,
    signature: Buffer,
    publicKey: Buffer,
): Promise<boolean> {
    const [Nimiq] = await Promise.all([loadNimiqCore(), loadNimiqCryptography()]);
    const nimiqSignature = Nimiq.Signature.unserialize(new Nimiq.SerialBuffer(signature));
    const nimiqPublicKey = Nimiq.PublicKey.unserialize(new Nimiq.SerialBuffer(publicKey));
    return nimiqSignature.verify(nimiqPublicKey, data);
}
