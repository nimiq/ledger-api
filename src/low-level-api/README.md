<img src="https://user-images.githubusercontent.com/211411/34776833-6f1ef4da-f618-11e7-8b13-f0697901d6a8.png" height="100" />

## Ledger Nimiq app API

## Usage


```js
import Transport from "@ledgerhq/hw-transport-webhid";
// import Transport from "@ledgerhq/hw-transport-node-hid"; // for node; experimental
import LowLevelApi from "@ledgerhq/hw-app-nim";

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
  const result = await nim.getPublicKey("44'/242'/0'");
  return result.publicKey;
};
getNimPublicKey().then(pk => console.log(pk));

const signNimTransaction = async () => {
  const transaction = ...;
  const transport = await Transport.create();
  const nim = new LowLevelApi(transport);
  const result = await nim.signTransaction("44'/242'/0'", transaction.signatureBase());

  // add signature to transaction
  // FIXME
  transaction.signatures.push(decorated);

  return transaction;
}
signNimTransaction().then(s => console.log(s.toString('hex')));
```


[Github](https://github.com/LedgerHQ/ledgerjs/),
[API Doc](http://ledgerhq.github.io/ledgerjs/),
[Ledger Devs Slack](https://ledger-dev.slack.com/)
