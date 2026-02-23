<img src="https://user-images.githubusercontent.com/211411/34776833-6f1ef4da-f618-11e7-8b13-f0697901d6a8.png" height="100" />

## Ledger Nimiq app API

## Prerequisites

See [here](https://github.com/nimiq/ledger-api/blob/master/README.md#prerequisites).

## Usage

```js
import Transport from "@ledgerhq/hw-transport-webhid";
// import Transport from "@ledgerhq/hw-transport-node-hid"; // for node; experimental
import LowLevelApi from "@nimiq/ledger-api/low-level-api/low-level-api.es.js";

const getNimAppVersion = async () => {
    const transport = await Transport.create();
    const nim = new LowLevelApi(transport);
    const { name, version } = await nim.getAppNameAndVersion();
    if (name !== 'Nimiq') throw new Error('Wrong app connected');
    return version;
}
getNimAppVersion().then(v => console.log(v));

const getNimPublicKey = async () => {
    const transport = await Transport.create();
    const nim = new LowLevelApi(transport);
    const result = await nim.getPublicKey("44'/242'/0'/0'");
    return result.publicKey;
};
getNimPublicKey().then(console.log);

const signNimTransaction = async () => {
    const transaction = new Nimiq.BasicTransaction(...);
    const transport = await Transport.create();
    const nim = new LowLevelApi(transport);
    const signatureBytes = await nim.signTransaction("44'/242'/0'/0'", transaction.serializeContent());

    const signature = new Nimiq.Signature(signatureBytes);
    transaction.signature = signature;
    return signature;
}
signNimTransaction().then(console.log);

const signMessage = async () => {
    const message = 'Nimiq rocks!';
    const transport = await Transport.create();
    const nim = new LowLevelApi(transport);
    return await nim.signMessage("44'/242'/0'/0'", message, { preferDisplayTypeHex: true });
}
signMessage().then(console.log);
```


[Github](https://github.com/LedgerHQ/ledgerjs/),
[API Doc](http://ledgerhq.github.io/ledgerjs/),
[Ledger Devs Slack](https://ledger-dev.slack.com/)
