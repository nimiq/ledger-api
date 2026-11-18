type Transport = import('@ledgerhq/hw-transport').default;

export type TransportLibrary = {
    create(openTimeout?: number, listenTimeout?: number): Promise<Transport>,
};

export enum TransportType {
    WEB_HID = 'web-hid',
    WEB_USB = 'web-usb',
    WEB_BLE = 'web-ble',
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
            return 'usb' in window.navigator && typeof window.navigator.usb.getDevices === 'function';
        case TransportType.WEB_BLE:
            return 'bluetooth' in window.navigator;
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
export async function loadTransportLibrary(transportType: TransportType): Promise<TransportLibrary> {
    switch (transportType) {
        case TransportType.WEB_HID:
            return (await import('@ledgerhq/hw-transport-webhid')).default;
        case TransportType.WEB_USB:
            return (await import('@ledgerhq/hw-transport-webusb')).default;
        case TransportType.WEB_BLE:
            return (await import('@ledgerhq/hw-transport-web-ble')).default;
        case TransportType.NETWORK:
            return (await import('@ledgerhq/hw-transport-http')).default([networkEndpoint]);
        default:
            throw new Error(`Unknown transport type ${transportType}`);
    }
}
