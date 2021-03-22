type Transport = import('@ledgerhq/hw-transport').default;

// Also see https://github.com/LedgerHQ/ledgerjs/issues/365 for other requests which might be interesting.

export default async function getAppNameAndVersion(transport: Transport, scrambleKey: string)
    : Promise<{ name: string, version: string }> {
    // Taken from @ledgerhq/hw-app-btc/getAppAndVersion.js. We don't import it directly from there to avoid loading its
    // unnecessary dependencies. Note that this request is common to all apps and the dashboard and is no Bitcoin app
    // specific request (it's not on https://github.com/LedgerHQ/app-bitcoin/blob/master/doc/btc.asc but rather imple-
    // mented in the Ledger Nano S and Nano X SDKs, see os_io_seproxyhal.c. Also mind the different cla). However, for
    // u2f and WebAuthn the used scramble key must match the one of the connected app for the Ledger to answer the
    // request. Therefore, decorate the api method manually to make it compatible with all apps, not only the Nimiq app.
    const getAppNameAndVersionApi = {
        async getAppNameAndVersion() {
            // Note that no u2f heartbeat is required here as the call is not interactive but answers directly.
            const response = await transport.send(0xb0, 0x01, 0x00, 0x00);
            const status = response.slice(response.length - 2).readUInt16BE(0);
            if (status !== 0x9000) throw new Error('getAppNameAndVersion failed'); // should not actually happen
            let offset = 0;
            const format = response[offset++];
            if (format !== 1) throw new Error('Unsupported format');
            const nameLength = response[offset++];
            const name = response.slice(offset, (offset += nameLength)).toString('ascii');
            const versionLength = response[offset++];
            const version = response.slice(offset, (offset += versionLength)).toString('ascii');
            return { name, version };
        },
    };
    // Takes care of setting the api lock (for ledger busy errors) and scramble key. Note that decorating the api method
    // does not modify the transport instance, therefore decorating on each invocation of getAppNameAndVersion does no
    // harm. Also note that the lock is a property of the transport, thus works correctly across multiple independently
    // decorated methods.
    transport.decorateAppAPIMethods(getAppNameAndVersionApi, ['getAppNameAndVersion'], scrambleKey);
    return getAppNameAndVersionApi.getAppNameAndVersion();
}
