type Transport = import('@ledgerhq/hw-transport').default;

// Also see developers.ledger.com/docs/transport/open-close-info-on-apps/, github.com/LedgerHQ/ledgerjs/issues/365 and
// github.com/LedgerHQ/ledger-secure-sdk/blob/master/src/os_io_seproxyhal.c for other interesting requests.

export default async function getAppNameAndVersion(transport: Transport, scrambleKey: string, withApiLock = true)
    : Promise<{ name: string, version: string }> {
    // Taken from @ledgerhq/hw-app-btc/getAppAndVersion.js. We don't import it directly from there to avoid loading its
    // unnecessary dependencies. Note that this request is common to all apps and the dashboard and is no Bitcoin app
    // specific request (it's not on https://github.com/LedgerHQ/app-bitcoin-new/blob/master/doc/bitcoin.md but in the
    // Ledger SDKs, see https://github.com/LedgerHQ/ledger-secure-sdk/blob/master/src/os_io_seproxyhal.c. Also mind the
    // different cla). However, for u2f and WebAuthn the used scramble key must match the one of the connected app for
    // the Ledger to answer the request. Therefore, set the scrambleKey manually to make it compatible with all apps,
    // not only the Nimiq app.
    let getAppNameAndVersionHandler = async () => {
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
    };
    // Set the scramble key and enable the api lock (for ledger busy errors) if requested. Note that the lock is a
    // property of the transport, not the handler, thus work correctly across multiple independently decorated
    // getAppNameAndVersionHandler and other decorated methods. Also, other decorated methods always overwrite the
    // scramble key to their required key on each invocation, such that setting it here won't affect other api calls.
    if (withApiLock) {
        // Decorating the api method does not modify the transport instance, therefore decorating on each invocation of
        // getAppNameAndVersion does no harm.
        getAppNameAndVersionHandler = transport.decorateAppAPIMethod(
            'getAppNameAndVersionHandler',
            getAppNameAndVersionHandler,
            undefined,
            scrambleKey,
        );
    } else {
        // Setting the scramble key manually does no harm, as any decorated api method will overwrite it again.
        transport.setScrambleKey(scrambleKey);
    }
    return getAppNameAndVersionHandler();
}
