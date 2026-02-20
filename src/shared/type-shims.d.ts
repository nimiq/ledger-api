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
