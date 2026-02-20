export function bufferFromAscii(ascii: string): Uint8Array {
    return new Uint8Array(ascii.split('').map((char) => char.charCodeAt(0)));
}

export function bufferFromUtf8(utf8: string): Uint8Array {
    return new TextEncoder().encode(utf8);
}

export function bufferFromHex(hex: string): Uint8Array {
    return new Uint8Array((hex.match(/.{2}/g) || []).map(byte => parseInt(byte, 16)));
}

export function bufferToHex(buffer: Uint8Array): string {
    return [...buffer].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function bufferFromBase64(base64: string): Uint8Array {
    return new Uint8Array(atob(base64).split('').map(c => c.charCodeAt(0)));
}

export function bufferToBase64(buffer: Uint8Array): string {
    return btoa(String.fromCharCode(...buffer));
}

export function bufferFromUint32(
    uint32: number,
    endianness: 'big-endian' | 'little-endian' = 'big-endian',
): Uint8Array {
    const buffer = new Uint8Array(4);
    new DataView(buffer.buffer).setUint32(0, uint32, endianness === 'little-endian');
    return buffer;
}

export function bufferFromUint64(
    uint64: bigint | number,
    endianness: 'big-endian' | 'little-endian' = 'big-endian',
): Uint8Array {
    const buffer = new Uint8Array(8);
    new DataView(buffer.buffer).setBigUint64(0, BigInt(uint64), endianness === 'little-endian');
    return buffer;
}

export function bufferToUint16(
    buffer: Uint8Array,
    endianness: 'big-endian' | 'little-endian' = 'big-endian',
): number {
    return new DataView(buffer.buffer).getUint16(buffer.byteOffset, endianness === 'little-endian');
}

export function areBuffersEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; ++i) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

export function concatenateBuffers(...buffers: Array<Uint8Array | number[]>): Uint8Array {
    const concatenatedLength = buffers.reduce((sum, { length }) => sum + length, 0);
    const concatenatedBuffer = new Uint8Array(concatenatedLength);
    let offset = 0;
    for (const buffer of buffers) {
        concatenatedBuffer.set(buffer, offset);
        offset += buffer.length;
    }
    return concatenatedBuffer;
}
