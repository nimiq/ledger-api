declare type Transport = import('@ledgerhq/hw-transport').default;
export declare function getAppAndVersion(transport: Transport, scrambleKey: string): Promise<{
    name: string;
    version: string;
}>;
export {};
