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
