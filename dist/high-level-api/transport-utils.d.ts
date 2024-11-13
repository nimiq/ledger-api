/// <reference path="../../src/lib/type-shims.d.ts" />
type TransportConstructor = typeof import('@ledgerhq/hw-transport').default;
type TransportWebUsbConstructor = typeof import('@ledgerhq/hw-transport-webusb').default;
export declare enum TransportType {
    WEB_HID = "web-hid",
    WEB_USB = "web-usb",
    WEB_BLE = "web-ble",
    WEB_AUTHN = "web-authn",
    U2F = "u2f",
    NETWORK = "network"
}
export declare function isSupported(transportType?: TransportType): boolean;
export declare function autoDetectTransportTypeToUse(): TransportType | null;
/**
 * Set the network endpoint for TransportType.NETWORK. Supported are http/https and ws/wss endpoints.
 * @param endpoint
 */
export declare function setNetworkEndpoint(endpoint: string): void;
export declare function getNetworkEndpoint(): string;
/**
 * Lazy load the library for a transport type.
 * @param transportType
 */
export declare function loadTransportLibrary(transportType: TransportType): Promise<TransportWebUsbConstructor | TransportConstructor>;
export {};
