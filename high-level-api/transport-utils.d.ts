declare type TransportConstructor = typeof import('@ledgerhq/hw-transport').default;
declare type TransportWebUsbConstructor = typeof import('@ledgerhq/hw-transport-webusb').default;
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
 * Lazy load the library for a transport type.
 * @param transportType
 */
export declare function loadTransportLibrary(transportType: TransportType): Promise<TransportWebUsbConstructor | TransportConstructor>;
export {};
