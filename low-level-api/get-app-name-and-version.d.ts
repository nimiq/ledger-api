type Transport = import('@ledgerhq/hw-transport').default;
export default function getAppNameAndVersion(transport: Transport, scrambleKey: string, withApiLock?: boolean): Promise<{
    name: string;
    version: string;
}>;
export {};
