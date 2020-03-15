type Transport = import('@ledgerhq/hw-transport').default;

export enum TransportType {
    WEB_HID = 'web-hid',
    WEB_USB = 'web-usb',
    WEB_BLE = 'web-ble',
    U2F = 'u2f',
}

export function isSupported(transportType?: TransportType) {
    if (window.location.protocol !== 'https:') return false;
    if (!transportType) return !!determineTransportTypeToUse();
    // inspired by @ledgerhq/hw-transport libs
    switch (transportType) {
        case TransportType.WEB_HID:
            return 'hid' in window.navigator;
        case TransportType.WEB_USB:
            // @ts-ignore
            return 'usb' in window.navigator && typeof window.navigator.usb.getDevices === 'function';
        case TransportType.WEB_BLE:
            return 'bluetooth' in window.navigator;
        case TransportType.U2F:
            // Note that Chrome, Opera and Edge use an internal, hidden cryptotoken extension to handle u2f
            // (https://github.com/google/u2f-ref-code/blob/master/u2f-gae-demo/war/js/u2f-api.js) which does not
            // expose an u2f api on window. Support via that extension is not detected by this check. However, as
            // these browsers support WebUsb, this is acceptable.
            // @ts-ignore
            return 'u2f' in window && typeof window.u2f.sign === 'function';
        default:
            return false;
    }
}

export function determineTransportTypeToUse(): TransportType | null {
    return [
        TransportType.WEB_HID, // WebHID preferred over WebUSB because of better compatibility on windows
        TransportType.WEB_USB, // WebUSB preferred over U2F because U2F can time out and causes popups in Windows
        TransportType.U2F, // U2F as legacy fallback
    ].find(isSupported) || null;
}

/**
 * Create a new transport to a connected Ledger device. All transport types but U2F must be invoked on user interaction.
 * If an already known device is connected, a transport instance to that device is established. Otherwise, a browser
 * popup with a selector is opened.
 * @param transportType
 */
export async function createTransport(transportType: TransportType): Promise<Transport> {
    switch (transportType) {
        case TransportType.WEB_HID:
            return (await import('@ledgerhq/hw-transport-webhid')).default.create();
        case TransportType.WEB_USB:
            return (await import('@ledgerhq/hw-transport-webusb')).default.create();
        case TransportType.WEB_BLE:
            return (await import('@ledgerhq/hw-transport-web-ble')).default.create();
        case TransportType.U2F:
            return (await import('@ledgerhq/hw-transport-u2f')).default.create();
        default:
            throw new Error(`Unknown transport type ${transportType}`);
    }
}
