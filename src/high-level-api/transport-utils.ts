type TransportConstructor = typeof import('@ledgerhq/hw-transport').default;
type TransportWebUsbConstructor = typeof import('@ledgerhq/hw-transport-webusb').default;

export enum TransportType {
    WEB_HID = 'web-hid',
    WEB_USB = 'web-usb',
    WEB_BLE = 'web-ble',
    WEB_AUTHN = 'web-authn',
    U2F = 'u2f',
    NETWORK = 'network',
}

export function isSupported(transportType?: TransportType): boolean {
    if (!transportType) return !!autoDetectTransportTypeToUse();
    if (transportType !== TransportType.NETWORK && window.location.protocol !== 'https:') return false;
    // inspired by @ledgerhq/hw-transport libs
    switch (transportType) {
        case TransportType.WEB_HID:
            return 'hid' in window.navigator;
        case TransportType.WEB_USB:
            // @ts-ignore
            return 'usb' in window.navigator && typeof window.navigator.usb.getDevices === 'function';
        case TransportType.WEB_BLE:
            return 'bluetooth' in window.navigator;
        case TransportType.WEB_AUTHN:
            return !!navigator.credentials;
        case TransportType.U2F:
            // Note that Chrome, Opera and Edge use an internal, hidden cryptotoken extension to handle u2f
            // (https://github.com/google/u2f-ref-code/blob/master/u2f-gae-demo/war/js/u2f-api.js) which does not
            // expose the u2f api on window. Support via that extension is not detected by this check. However, as
            // these browsers support WebUSB, this is acceptable and we don't use a more elaborate check like the one
            // in the 'u2f-api' package to avoid bundling it and also because it's async, complicating the code.
            // @ts-ignore
            return 'u2f' in window && typeof window.u2f.sign === 'function';
        case TransportType.NETWORK:
            return 'fetch' in window && 'WebSocket' in window;
        default:
            return false;
    }
}

export function autoDetectTransportTypeToUse(): TransportType | null {
    // Determine the best available transport type. Exclude WebBle as it's only suitable for Nano X.
    // See transport-comparison.md for a more complete comparison of different transport types.
    // TODO once the Ledger Live WebSocket bridge is available to users, add TransportType.NETWORK
    const transportTypesByPreference = [
        // WebHID is preferable over WebUSB because Chrome 91 broke the WebUSB support. Also WebHID has better
        // compatibility on Windows due to driver issues for WebUSB for the Nano X.
        TransportType.WEB_HID,
        // If WebHID is not available, WebUSB generally also works well.
        TransportType.WEB_USB,
        // WebAuthn and U2F as fallbacks which are generally less stable though and can time out. They also cause native
        // Windows security prompts in Windows and additionally Firefox internal popups in Firefox on all platforms.
        // WebAuthn preferred over U2F, as compared to U2F better browser support and less quirky / not deprecated
        // and works better with Nano X. But causes a popup in Chrome which U2F does not.
        TransportType.WEB_AUTHN,
        // U2F as last resort.
        TransportType.U2F,
    ];
    return transportTypesByPreference.find(isSupported) || null;
}

let networkEndpoint: string = 'ws://127.0.0.1:8435'; // Ledger Live WebSocket bridge default endpoint

/**
 * Set the network endpoint for TransportType.NETWORK. Supported are http/https and ws/wss endpoints.
 * @param endpoint
 */
export function setNetworkEndpoint(endpoint: string): void {
    networkEndpoint = endpoint;
}

export function getNetworkEndpoint(): string {
    return networkEndpoint;
}

/**
 * Lazy load the library for a transport type.
 * @param transportType
 */
export async function loadTransportLibrary(transportType: TransportType)
    : Promise<TransportWebUsbConstructor|TransportConstructor> {
    switch (transportType) {
        case TransportType.WEB_HID:
            return (await import('@ledgerhq/hw-transport-webhid')).default;
        case TransportType.WEB_USB:
            return (await import('@ledgerhq/hw-transport-webusb')).default;
        case TransportType.WEB_BLE:
            return (await import('@ledgerhq/hw-transport-web-ble')).default;
        case TransportType.WEB_AUTHN:
            return (await import('@ledgerhq/hw-transport-webauthn')).default;
        case TransportType.U2F:
            return (await import('@ledgerhq/hw-transport-u2f')).default;
        case TransportType.NETWORK:
            return (await import('@ledgerhq/hw-transport-http')).default([networkEndpoint]);
        default:
            throw new Error(`Unknown transport type ${transportType}`);
    }
}
