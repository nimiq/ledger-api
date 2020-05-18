import TransportWebUsb from '@ledgerhq/hw-transport-webusb';
import TransportWebHid from '@ledgerhq/hw-transport-webhid';
import TransportWebBle from '@ledgerhq/hw-transport-web-ble';
import TransportU2F from '@ledgerhq/hw-transport-u2f';
import { listen as onLog } from '@ledgerhq/logs';
import { loadNimiqCore } from '../lib/load-nimiq';
// typescript needs the import as specified to find the .d.ts file, see rollup.config.js
import LowLevelApi from '../../dist/low-level-api/low-level-api';
import HighLevelApi, { EventType, State, TransportType } from '../../dist/high-level-api/ledger-api';

type Transport = import('@ledgerhq/hw-transport').default;

window.Buffer = Buffer;

enum ApiType {
    LOW_LEVEL = 'low-level',
    HIGH_LEVEL = 'high-level',
}

declare global {
    interface Window {
        _transport?: Transport;
        _api?: LowLevelApi | typeof HighLevelApi;
    }
}

window.addEventListener('load', () => {
    // You can create such a hash as follows:
    // const tx = new Nimiq.BasicTransaction(pubKey, recipient, value, fee, validityStartHeight, undefined, networkId);
    // Nimiq.bufferUtils.toHex(tx.serializeContent());
    const txHash = '0000573dbdf6a7d83925ecf0ba0022a9a86c9be3c081008626c5378734e05d71cb4034eb97741909764e6e'
        + '0000000000000f4240000000000000000a00000e790200';
    document.body.innerHTML = `
        <h1 class="nq-h1">Nimiq Ledger Api Demos</h1>

        <section class="nq-text center">
            Status: <span id="status" class="mono"></span>
            <div class="show-${ApiType.HIGH_LEVEL}">
                Api state: <span id="high-level-api-state" class="mono"></span>
            </div>
            <div class="show-${ApiType.HIGH_LEVEL}">
                Last api event: <span id="high-level-api-last-event" class="mono"></span>
            </div>
        </section>
        
        <section class="nq-text center">
            <div id="api-selector" class="selector">
                <label>
                    <input type="radio" name="api-selector" value="${ApiType.HIGH_LEVEL}" checked>
                    High Level Api
                </label>
                <label>
                    <input type="radio" name="api-selector" value="${ApiType.LOW_LEVEL}">
                    Low Level Api
                </label>
            </div>
            <div id="transport-selector" class="selector">
                <label>
                    <input type="radio" name="transport-selector" value="${TransportType.WEB_USB}" checked>
                    WebUsb
                </label>
                <label>
                    <input type="radio" name="transport-selector" value="${TransportType.WEB_HID}">
                    WebHid
                </label>
                <label>
                    <input type="radio" name="transport-selector" value="${TransportType.WEB_BLE}">
                    WebBle
                </label>
                <label>
                    <input type="radio" name="transport-selector" value="${TransportType.U2F}">
                    U2F
                </label>
            </div>
            <label>
                <input type="checkbox" id="no-user-interaction-checkbox">
                Call without user interaction
            </label>
            <div>
                <button class="nq-button-s" id="connect-button">Connect</button>
                <button class="nq-button-s" id="disconnect-button">Disconnect</button>
                <button class="nq-button-s show-${ApiType.HIGH_LEVEL}" id="high-level-api-cancel-button">
                    Cancel Request
                </button>
            </div>
        </section>

        <section class="nq-text nq-card">
            <h2 class="nq-card-header nq-h2">Get Public Key</h2>
            <div class="nq-card-body">
                <input class="nq-input" id="bip32-path-public-key-input" value="44'/242'/0'/0'">
                <button class="nq-button-s" id="get-public-key-button">Get Public Key</button>
                <button class="nq-button-s show-${ApiType.LOW_LEVEL}" id="low-level-api-confirm-public-key-button">
                    Confirm Public Key
                </button>
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
                <div class="nq-text">Fill the input with a transaction's serializeContent hex.</div>
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
            
            .center {
                text-align: center;
            }
            
            .selector {
                margin-bottom: 1.5rem;
            }
            
            #connect-button,
            #disconnect-button {
                margin-top: 2rem;
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

            .${ApiType.LOW_LEVEL} .show-${ApiType.HIGH_LEVEL},
            .${ApiType.HIGH_LEVEL} .show-${ApiType.LOW_LEVEL} {
                display: none;
            }
        </style>
    `;

    const $status = document.getElementById('status')!;
    const $highLevelApiState = document.getElementById('high-level-api-state')!;
    const $highLevelApiLastEvent = document.getElementById('high-level-api-last-event')!;
    const $apiSelector = document.getElementById('api-selector')!;
    const $transportSelector = document.getElementById('transport-selector')!;
    const $noUserInteractionCheckbox = document.getElementById('no-user-interaction-checkbox') as HTMLInputElement;
    const $connectButton = document.getElementById('connect-button')!;
    const $disconnectButton = document.getElementById('disconnect-button')!;
    const $highLevelApiCancelButton = document.getElementById('high-level-api-cancel-button')!;
    const $bip32PathPublicKeyInput = document.getElementById('bip32-path-public-key-input') as HTMLInputElement;
    const $getPublicKeyButton = document.getElementById('get-public-key-button')!;
    const $lowLevelApiConfirmPublicKeyButton = document.getElementById('low-level-api-confirm-public-key-button')!;
    const $publicKey = document.getElementById('public-key')!;
    const $bip32PathAddressInput = document.getElementById('bip32-path-address-input') as HTMLInputElement;
    const $getAddressButton = document.getElementById('get-address-button')!;
    const $confirmAddressButton = document.getElementById('confirm-address-button')!;
    const $address = document.getElementById('address')!;
    const $txHexInput = document.getElementById('tx-hex-input') as HTMLInputElement;
    const $signTxButton = document.getElementById('sign-tx-button')!;
    const $signature = document.getElementById('signature')!;

    function displayStatus(msg: string) {
        console.log(msg);
        $status.textContent = msg;
    }

    function disableSelector(selector: HTMLElement) {
        for (const el of selector.getElementsByTagName('input')) {
            el.disabled = true;
        }
    }

    function switchApi() {
        const api = ($apiSelector.querySelector(':checked') as HTMLInputElement).value;
        document.body.classList.toggle(ApiType.LOW_LEVEL, api === ApiType.LOW_LEVEL);
        document.body.classList.toggle(ApiType.HIGH_LEVEL, api === ApiType.HIGH_LEVEL);
    }

    async function clearUserInteraction() {
        // Wait until user interaction flag is reset. See https://mustaqahmed.github.io/user-activation-v2/,
        // https://developers.google.com/web/updates/2019/01/user-activation and
        // https://github.com/whatwg/html/issues/1903 to learn more about how user interaction is tracked in Chrome.
        displayStatus('Waiting a moment for user interaction flag to get cleared.');
        return new Promise((resolve) => setTimeout(resolve, 5000));
    }

    async function createApi() {
        if (window._api) return window._api;
        try {
            disableSelector($apiSelector);
            displayStatus('Creating Api');
            const apiType = ($apiSelector.querySelector(':checked') as HTMLInputElement).value;
            const transportType = ($transportSelector.querySelector(':checked') as HTMLInputElement).value;
            if (apiType === ApiType.LOW_LEVEL) {
                disableSelector($transportSelector);
                // Note that for the high-level api, the ledger log does not work as the logger in the demo is a
                // different instance than the one in the lazy loaded transports.
                onLog((logEntry: any) => console.log('%cLog:', 'color: teal', logEntry));
                switch (transportType) {
                    case TransportType.WEB_USB:
                        // Automatically creates a transport with a connected known device or opens a browser popup to
                        // select a device if no known device is connected.
                        window._transport = await TransportWebUsb.create();
                        break;
                    case TransportType.WEB_HID:
                        window._transport = await TransportWebHid.create();
                        break;
                    case TransportType.WEB_BLE:
                        window._transport = await TransportWebBle.create();
                        break;
                    default:
                        window._transport = await TransportU2F.create();
                }
                window._transport.on('disconnect', () => displayStatus('Disconnected.'));
                window._api = new LowLevelApi(window._transport);
            } else {
                window._api = HighLevelApi;
                window._api.on(EventType.STATE_CHANGE, (state: State) => {
                    console.log('%cState change', 'color: teal', state);
                    $highLevelApiState.textContent = `${state.type}${state.error ? `: ${state.error.type}` : ''}`;
                });
                window._api.on(EventType.CONNECTED, (walletId: string) => {
                    console.log(`%cConnected to wallet ${walletId}`, 'color: teal');
                    $highLevelApiLastEvent.textContent = `Connected to wallet ${walletId}`;
                });
                window._api.on(EventType.REQUEST_SUCCESSFUL, (...args) => {
                    console.log('%cRequest successful', 'color: teal', ...args);
                    $highLevelApiLastEvent.textContent = 'Request successful';
                });
                window._api.on(EventType.REQUEST_CANCELLED, (...args) => {
                    console.log('%cRequest cancelled', 'color: teal', ...args);
                    $highLevelApiLastEvent.textContent = 'Request cancelled';
                });
                window._api.setTransportType(transportType as TransportType);
                $transportSelector.addEventListener('change', (e) => {
                    const input = e.target as HTMLInputElement;
                    (window._api as typeof HighLevelApi).setTransportType(input.value as TransportType);
                });
            }

            displayStatus('Api created');
            return window._api;
        } catch (error) {
            displayStatus(`Error creating api: ${error}`);
            throw error;
        }
    }

    async function connect() {
        if ($noUserInteractionCheckbox.checked) await clearUserInteraction();
        const api = window._api || await createApi();
        if (api instanceof LowLevelApi) {
            const { version } = await api.getAppConfiguration();
            // @ts-ignore: deviceModel does not exist on all transport types
            const deviceModel = (window._transport.deviceModel || {}).productName || 'device type unknown';
            displayStatus(`Connected (app version ${version}, ${deviceModel})`);
        } else {
            const connected = await api.connect();
            displayStatus(connected ? 'Connected' : 'Connection cancelled');
        }
    }

    async function disconnect() {
        if (!window._api) return;
        if ($noUserInteractionCheckbox.checked) await clearUserInteraction();
        displayStatus('Disconnecting api...');
        if (window._api instanceof LowLevelApi) {
            await window._api.close();
        } else {
            await window._api.disconnect();
        }
        displayStatus('Api disconnected');
    }

    async function cancelRequest() {
        if (!window._api || window._api instanceof LowLevelApi || !window._api.currentRequest) return;
        displayStatus('Cancelling request');
        window._api.currentRequest.cancel();
    }

    async function getPublicKey(confirm: boolean) {
        if ($noUserInteractionCheckbox.checked) await clearUserInteraction();
        try {
            $publicKey.textContent = '';
            const bip32Path = $bip32PathPublicKeyInput.value;
            const loadNimiqPromise = loadNimiqCore();
            const api = await createApi();
            const msg = confirm ? 'Confirm public key...' : 'Getting public key...';
            displayStatus(msg);
            let publicKey: Uint8Array;
            if (api instanceof LowLevelApi) {
                ({ publicKey } = await api.getPublicKey(bip32Path, false, confirm));
            } else {
                if (confirm) throw new Error('High level api does not provide the option to confirm a public key');
                publicKey = (await api.getPublicKey(bip32Path)).serialize();
            }
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
        if ($noUserInteractionCheckbox.checked) await clearUserInteraction();
        try {
            $address.textContent = '';
            const bip32Path = $bip32PathAddressInput.value;
            const api = await createApi();
            const msg = confirm ? 'Confirm address...' : 'Getting address...';
            displayStatus(msg);
            let address: string;
            if (api instanceof LowLevelApi) {
                ({ address } = await api.getAddress(bip32Path, true, confirm));
            } else {
                address = confirm ? await api.getConfirmedAddress(bip32Path) : await api.getAddress(bip32Path);
            }
            $address.textContent = address;
            displayStatus('Received address');
            return address;
        } catch (error) {
            displayStatus(`Failed to get address: ${error}`);
            throw error;
        }
    }

    async function signTransaction() {
        if ($noUserInteractionCheckbox.checked) await clearUserInteraction();
        try {
            $signature.textContent = '';
            const tx = $txHexInput.value;
            const [api, Nimiq] = await Promise.all([
                createApi(),
                loadNimiqCore(),
            ]);
            const buffer = Nimiq.BufferUtils.fromHex(tx);
            const bip32Path = $bip32PathAddressInput.value;
            displayStatus('Signing transaction...');
            let signature: Uint8Array;
            if (api instanceof LowLevelApi) {
                ({ signature } = await api.signTransaction(bip32Path, buffer));
            } else {
                // TODO provide a nicer ui to set these
                const dataLength = buffer.readUint16();
                const extraData = buffer.read(dataLength);
                const sender = Nimiq.Address.unserialize(buffer);
                const senderType = buffer.readUint8() as 0 | 1 | 2 | undefined;
                const recipient = Nimiq.Address.unserialize(buffer);
                const recipientType = buffer.readUint8() as 0 | 1 | 2 | undefined;
                const value = buffer.readUint64();
                const fee = buffer.readUint64();
                const validityStartHeight = buffer.readUint32();
                buffer.readUint8(); // networkId
                const flags = buffer.readUint8();
                const proofBytes = new Nimiq.SerialBuffer((await api.signTransaction(
                    { sender, senderType, recipient, recipientType, value, fee, validityStartHeight, flags, extraData },
                    bip32Path,
                )).proof);
                signature = Nimiq.SignatureProof.unserialize(proofBytes).signature.serialize();
            }
            $signature.textContent = Nimiq.BufferUtils.toHex(signature);
        } catch (error) {
            displayStatus(error);
        }
    }

    function init() {
        console.log('Nimiq Ledger Api demo. Note that another great place to directly experiment with the apis'
            + ' provided by Ledger is https://ledger-repl.now.sh/');
        console.log('To experiment with how connecting to the Ledger works on a fresh system, don\'t forget to revoke'
            + ' previously granted permissions.');
        $apiSelector.addEventListener('change', switchApi);
        $connectButton.addEventListener('click', connect);
        $disconnectButton.addEventListener('click', disconnect);
        $highLevelApiCancelButton.addEventListener('click', cancelRequest);
        $getPublicKeyButton.addEventListener('click', () => getPublicKey(false));
        $lowLevelApiConfirmPublicKeyButton.addEventListener('click', () => getPublicKey(true));
        $getAddressButton.addEventListener('click', () => getAddress(false));
        $confirmAddressButton.addEventListener('click', () => getAddress(true));
        $signTxButton.addEventListener('click', signTransaction);

        switchApi();
    }

    init();
});
