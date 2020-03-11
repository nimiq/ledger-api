import TransportWebUsb from '@ledgerhq/hw-transport-webusb';
import TransportWebHid from '@ledgerhq/hw-transport-webhid';
import TransportWebBle from '@ledgerhq/hw-transport-web-ble';
import TransportU2F from '@ledgerhq/hw-transport-u2f';
import { listen as onLog } from '@ledgerhq/logs';
import LowLevelApi from '../../dist/low-level-api/low-level-api';
import { loadNimiqCore } from '../lib/load-nimiq';

type Transport = import('@ledgerhq/hw-transport').default;

window.Buffer = Buffer;

window.addEventListener('load', () => {
    // You can create such a hash as follows:
    // const tx = new Nimiq.BasicTransaction(pubKey, recipient, value, fee, validityStartHeight, undefined, networkId);
    // Nimiq.bufferUtils.toHex(tx.serializeContent());
    const txHash = '0000573dbdf6a7d83925ecf0ba0022a9a86c9be3c081008626c5378734e05d71cb4034eb97741909764e6e'
        + '0000000000000f4240000000000000000a00000e790200';
    document.body.innerHTML = `
        <h1 class="nq-h1">Nimiq Ledger Api Demos</h1>

        <section class="nq-text">
            Status: <span id="status" class="mono"></span>
        </section>
        
        <section class="nq-text">
            <span id="transport-selector">
                <label>
                    <input type="radio" name="transport" value="webusb" checked>
                    WebUsb
                </label>
                <label>
                    <input type="radio" name="transport" value="webhid">
                    WebHid
                </label>
                <label>
                    <input type="radio" name="transport" value="webble">
                    WebBle
                </label>
                <label>
                    <input type="radio" name="transport" value="u2f">
                    U2F
                </label>
            </span>
            <button class="nq-button-s" id="connect-button">Connect</button>
            <button class="nq-button-s" id="connect-without-user-interaction-button">
                Connect without user interaction
            </button>
        </section>

        <section class="nq-text nq-card">
            <h2 class="nq-card-header nq-h2">Get Public Key</h2>
            <div class="nq-card-body">
                <input class="nq-input" id="bip32-path-public-key-input" value="44'/242'/0'/0'">
                <button class="nq-button-s" id="get-public-key-button">Get Public Key</button>
                <button class="nq-button-s" id="confirm-public-key-button">Confirm Public Key</button>
                <br>
                <div class="nq-text">Public Key: <span id="public-key" class="mono"></span></div>
            </div>
        </section>

        <section class="nq-text nq-card">
            <h2 class="nq-card-header nq-h2">Get Address</h2>
            <div class="nq-card-body">
                <input class="nq-input" id="bip32-path-address-input" value="44'/242'/0'/0'">
                <button class="nq-button-s" id="get-address-button">Get Address</button>
                <button class="nq-button-s" id="confirm-address-button">Confirm Address</button>
                <br>
                <div class="nq-text">Address: <span id="address" class="mono"></span></div>
            </div>
        </section>

        <section class="nq-text nq-card">
            <h2 class="nq-card-header nq-h2">Sign Transaction</h2>
            <div class="nq-card-body">
                <div class="nq-text">Fill the input with a hex transaction that belongs to your address.</div>
                <input class="nq-input" id="tx-hex-input" value="${txHash}">
                <button class="nq-button-s" id="sign-tx-button">Sign</button>
                <br>
                <div class="nq-text">Signature: <span id="signature" class="mono"></span></div>
                </div>
        </section>

        <style>
            body {
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            
            .nq-card {
                min-width: 75rem;
                margin-bottom: 0;
            }

            .nq-card-header {
                padding-top: 2rem;
                margin-bottom: 0;
            }

            .nq-input {
                margin-right: 2rem;
            }

            .mono {
                font-family: monospace;
                word-break: break-word;
            }
        </style>
    `;

    const $status = document.getElementById('status')!;
    const $transportSelector = document.getElementById('transport-selector')!;
    const $connectButton = document.getElementById('connect-button')!;
    const $connectWithoutUserInteractionButton = document.getElementById('connect-without-user-interaction-button')!;
    const $bip32PathPublicKeyInput = document.getElementById('bip32-path-public-key-input') as HTMLInputElement;
    const $getPublicKeyButton = document.getElementById('get-public-key-button')!;
    const $confirmPublicKeyButton = document.getElementById('confirm-public-key-button')!;
    const $publicKey = document.getElementById('public-key')!;
    const $bip32PathAddressInput = document.getElementById('bip32-path-address-input') as HTMLInputElement;
    const $getAddressButton = document.getElementById('get-address-button')!;
    const $confirmAddressButton = document.getElementById('confirm-address-button')!;
    const $address = document.getElementById('address')!;
    const $txHexInput = document.getElementById('tx-hex-input') as HTMLInputElement;
    const $signTxButton = document.getElementById('sign-tx-button')!;
    const $signature = document.getElementById('signature')!;

    let _api: LowLevelApi | null = null;

    function displayStatus(msg: string) {
        console.log(msg);
        $status.textContent = msg;
    }

    async function createApi() {
        try {
            displayStatus('Creating Api');
            $transportSelector.style.display = 'none';
            let transport: Transport;
            switch (($transportSelector.querySelector(':checked') as HTMLInputElement).value) {
                case 'webusb':
                    // Automatically creates a transport with a connected known device or opens a browser popup to
                    // select a device if no known device is connected.
                    transport = await TransportWebUsb.create();
                    break;
                case 'webhid':
                    transport = await TransportWebHid.create();
                    break;
                case 'webble':
                    transport = await TransportWebBle.create();
                    break;
                default:
                    transport = await TransportU2F.create();
            }
            _api = new LowLevelApi(transport);
            onLog((logEntry: any) => console.log('Log:', logEntry));
            displayStatus('Opened');
            return _api;
        } catch (error) {
            displayStatus(`Error creating api: ${error}`);
            throw error;
        }
    }

    async function connect() {
        try {
            const api = _api || await createApi();
            const { version } = await api.getAppConfiguration();
            displayStatus(`Connected (app version ${version})`);
            return api;
        } catch (error) {
            _api = null;
            throw error;
        }
    }

    async function connectWithoutUserInteraction() {
        // Wait until user interaction flag is reset. See https://mustaqahmed.github.io/user-activation-v2/ and
        // https://github.com/whatwg/html/issues/1903 to learn more about how user interaction is tracked in Chrome.
        displayStatus('Waiting a moment for user interaction flag to get cleared.');
        setTimeout(connect, 5000);
    }

    async function getPublicKey(confirm: boolean) {
        try {
            $publicKey.textContent = '';
            const bip32Path = $bip32PathPublicKeyInput.value;
            const loadNimiqPromise = loadNimiqCore();
            const api = await connect();
            const msg = confirm ? 'Confirm public key...' : 'Getting public key...';
            displayStatus(msg);
            const { publicKey } = await api.getPublicKey(bip32Path, false, confirm);
            const Nimiq = await loadNimiqPromise;
            $publicKey.textContent = Nimiq.BufferUtils.toHex(publicKey);
            displayStatus('Received public key');
            return publicKey;
        } catch (error) {
            displayStatus(`Failed to get public key: ${error}`);
            throw error;
        }
    }

    async function getAddress(confirm: boolean) {
        try {
            $address.textContent = '';
            const bip32Path = $bip32PathAddressInput.value;
            const api = await connect();
            const msg = confirm ? 'Confirm address...' : 'Getting address...';
            displayStatus(msg);
            const { address } = await api.getAddress(bip32Path, true, confirm);
            $address.textContent = address;
            displayStatus('Received address');
            return address;
        } catch (error) {
            displayStatus(`Failed to get address: ${error}`);
            throw error;
        }
    }

    async function signTransaction() {
        try {
            $signature.textContent = '';
            const tx = $txHexInput.value;
            const [api, Nimiq] = await Promise.all([
                connect(),
                loadNimiqCore(),
            ]);
            const buffer = Nimiq.BufferUtils.fromHex(tx);
            const bip32Path = $bip32PathAddressInput.value;
            displayStatus('Signing transaction...');
            const { signature } = await api.signTransaction(bip32Path, buffer);
            $signature.textContent = Nimiq.BufferUtils.toHex(signature);
        } catch (error) {
            displayStatus(error);
        }
    }

    function init() {
        console.log('Nimiq Ledger Api demo. Note that another great place to directly experiment with the apis'
            + ' provided by Ledger is https://ledger-repl.now.sh/');
        $connectButton.addEventListener('click', connect);
        $connectWithoutUserInteractionButton.addEventListener('click', connectWithoutUserInteraction);
        $getPublicKeyButton.addEventListener('click', () => getPublicKey(false));
        $confirmPublicKeyButton.addEventListener('click', () => getPublicKey(true));
        $getAddressButton.addEventListener('click', () => getAddress(false));
        $confirmAddressButton.addEventListener('click', () => getAddress(true));
        $signTxButton.addEventListener('click', signTransaction);
    }

    init();
});
