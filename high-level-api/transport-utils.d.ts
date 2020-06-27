declare type Transport = import('@ledgerhq/hw-transport').default;
export declare enum TransportType {
    WEB_HID = "web-hid",
    WEB_USB = "web-usb",
    WEB_BLE = "web-ble",
    WEB_AUTHN = "web-authn",
    U2F = "u2f"
}
export declare function isSupported(transportType?: TransportType): boolean;
export declare function autoDetectTransportTypeToUse(): TransportType | null;
/**
 * Create a new transport to a connected Ledger device. All transport types but U2F and WebAuthn must be invoked on user
 * interaction. If an already known device is connected, a transport instance to that device is established. Otherwise,
 * a browser popup with a selector is opened.
 * @param transportType
 */
export declare function createTransport(transportType: TransportType): Promise<Transport>;
export {};
