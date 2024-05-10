import { loadNimiqCore, loadNimiqLegacyCore, loadNimiqLegacyCryptography, type Nimiq } from '../lib/load-nimiq';
// Our built library.
// Typescript needs the import as specified to find the .d.ts file, see rollup.config.js
import { NimiqVersion } from '../../dist/high-level-api/ledger-api';

export function getInputElement(selector: string, $parent: HTMLElement | Document = document): HTMLInputElement {
    const input = $parent.querySelector(selector);
    if (!input || input.tagName !== 'INPUT') throw new Error(`No input found by selector ${selector}.`);
    return input as HTMLInputElement;
}

export function getSelectorValue<T extends string | number>($selector: HTMLElement, type: T[]): T;
// For numerical enums filter out typescript reverse mappings from numbers to enum member names.
export function getSelectorValue<T extends string | number, E extends Record<string, T>>(
    $selector: HTMLElement, type: E): E[Exclude<keyof E, number | `${number}`>];
export function getSelectorValue<T extends string | number>($selector: HTMLElement, type: T[] | Record<string, T>): T {
    const stringValue = getInputElement(':checked', $selector).value;
    const numericValue = parseFloat(stringValue);
    const allowedValues = !Array.isArray(type)
        // For numerical enums filter out typescript reverse mappings from numbers to enum member names.
        ? Object.entries(type).filter(([key]) => key !== parseFloat(key).toString()).map(([, value]) => value)
        : type;
    for (const allowedValue of allowedValues) {
        if (stringValue === allowedValue || numericValue === allowedValue) return allowedValue;
    }
    throw new Error(`Invalid selector value ${stringValue}`);
}

export function enableSelector($selector: HTMLElement, enable: boolean) {
    for (const el of $selector.getElementsByTagName('input')) {
        el.disabled = !enable;
    }
}

export function bufferToHex(buffer: Uint8Array): string {
    return Buffer.from(buffer).toString('hex');
}

export function bufferFromHex(hex: string): Uint8Array {
    return Buffer.from(hex, 'hex');
}

export function bufferFromAscii(ascii: string): Uint8Array {
    return Buffer.from(ascii, 'ascii');
}

export function bufferFromUtf8(utf8: string): Uint8Array {
    return Buffer.from(utf8, 'utf8');
}

export function bufferFromUint32(uint32: number): Uint8Array {
    const uint8Array = new Uint8Array(4);
    new DataView(uint8Array.buffer).setUint32(0, uint32);
    return uint8Array;
}

export function bufferFromUint64(uint64: bigint): Uint8Array {
    const uint8Array = new Uint8Array(8);
    new DataView(uint8Array.buffer).setBigUint64(0, uint64);
    return uint8Array;
}

export async function loadNimiq<Version extends NimiqVersion>(
    nimiqVersion: Version,
    inlcudeNimiqLegacyCryptography = false,
): Promise<Nimiq<Version>> {
    const [Nimiq] = await Promise.all(nimiqVersion === NimiqVersion.ALBATROSS
        ? [loadNimiqCore()]
        : [loadNimiqLegacyCore(), ...(inlcudeNimiqLegacyCryptography ? [loadNimiqLegacyCryptography()] : [])],
    );
    return Nimiq as Nimiq<Version>;
}
