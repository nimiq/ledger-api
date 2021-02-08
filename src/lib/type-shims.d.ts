declare module '@ledgerhq/hw-transport-webhid' {
    // eslint-disable-next-line import/no-duplicates
    import Transport from '@ledgerhq/hw-transport';

    export default Transport;
}

declare module '@ledgerhq/hw-transport-web-ble' {
    // eslint-disable-next-line import/no-duplicates
    import Transport from '@ledgerhq/hw-transport';

    export default Transport;
}

declare module '@ledgerhq/hw-transport-webauthn' {
    // eslint-disable-next-line import/no-duplicates
    import Transport from '@ledgerhq/hw-transport';

    export default Transport;
}

declare module '@ledgerhq/hw-transport-http' {
    // eslint-disable-next-line import/no-duplicates
    import Transport from '@ledgerhq/hw-transport';

    const NetworkTransportForUrls: (urls: string[]) => typeof Transport;

    export default NetworkTransportForUrls;
}

declare module '@ledgerhq/logs';

declare module 'sha.js/sha256' {
    class Sha256 {
        // Note: we're just shimming part of the class here
        update(data: Uint8Array): Sha256;
        update(data: string, encoding: string): Sha256;
        digest(): Buffer;
        digest(encoding: string): string;
    }

    export default Sha256;
}
