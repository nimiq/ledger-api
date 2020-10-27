type Transport = import('@ledgerhq/hw-transport').default;

// Also see https://github.com/LedgerHQ/ledgerjs/issues/365 for other requests which might be interesting.

export async function getAppAndVersion(transport: Transport, scrambleKey: string)
    : Promise<{ name: string, version: string }> {
    // Taken from @ledgerhq/hw-app-btc/getAppAndVersion.js. We don't import it directly from there to avoid loading its
    // unnecessary dependencies. Also we left out reading the flags we don't need and decorate the api method manually.
    // Note that this request is common to all apps and the dashboard and is no Bitcoin app specific request (it's not
    // on https://github.com/LedgerHQ/app-bitcoin/blob/master/doc/btc.asc and mind the different cla). However, for u2f
    // and WebAuthn the used scramble key must match the one of the connected app for the Ledger to answer the request.
    const getAppAndVersionApi = {
        async getAppAndVersion() {
            const response = await transport.send(0xb0, 0x01, 0x00, 0x00);
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
    // Takes care of setting the api lock (for ledger busy errors) and scramble key.
    transport.decorateAppAPIMethods(getAppAndVersionApi, ['getAppAndVersion'], scrambleKey);
    return getAppAndVersionApi.getAppAndVersion();
}
