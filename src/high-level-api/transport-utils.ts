type Transport = import('@ledgerhq/hw-transport').default;

export enum TransportType {
    WEB_HID = 'web-hid',
    WEB_USB = 'web-usb',
    WEB_BLE = 'web-ble',
    U2F = 'u2f',
}

export function isSupported(transportType?: TransportType): boolean {
    if (window.location.protocol !== 'https:') return false;
    if (!transportType) return !!autoDetectTransportTypeToUse();
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

export function autoDetectTransportTypeToUse(): TransportType | null {
    // Determine the best available transport type. Exclude WebBle as it's only suitable for Nano X.
    let transportTypesByPreference;
    // HID has better compatibility on Windows due to driver issues for WebUSB for the Nano X (see
    // https://github.com/LedgerHQ/ledgerjs/issues/456 and https://github.com/WICG/webusb/issues/143). On other
    // platforms however, WebUSB is preferable for multiple reasons (Chrome):
    // - Currently HID permission is only valid until device is disconnected while WebUSB remembers a granted
    //   permission. This results in a device selection popup every time the Ledger is reconnected (or changes to
    //   another app or the dashboard, where Ledger reports different device descriptors, i.e. appears as a
    //   different device). This also requires a user gesture every time.
    // - HID device selection popup does not update on changes, for example on switch from Ledger dashboard to app
    //   or when Ledger gets connected.
    // - HID does not emit disconnects immediately but only at next request.
    // TODO this situation needs to be re-evaluated once WebHID is stable
    const isWindows = /Win/.test(window.navigator.platform); // see https://stackoverflow.com/a/38241481
    if (isWindows) {
        transportTypesByPreference = [TransportType.WEB_HID, TransportType.WEB_USB];
    } else {
        transportTypesByPreference = [TransportType.WEB_USB, TransportType.WEB_HID];
    }
    // U2F as legacy fallback. The others are preferred as U2F can time out and causes native Windows security popups
    // in Windows and additionally Firefox internal popups in Firefox on all platforms.
    transportTypesByPreference.push(TransportType.U2F);
    return transportTypesByPreference.find(isSupported) || null;
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
