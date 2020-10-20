import TransportWebUsb from '@ledgerhq/hw-transport-webusb';
import TransportWebHid from '@ledgerhq/hw-transport-webhid';
import TransportWebBle from '@ledgerhq/hw-transport-web-ble';
import TransportWebAuthn from '@ledgerhq/hw-transport-webauthn';
import TransportU2F from '@ledgerhq/hw-transport-u2f';
import { listen as onLog } from '@ledgerhq/logs';
import { loadNimiqCore } from '../lib/load-nimiq';
// typescript needs the import as specified to find the .d.ts file, see rollup.config.js
import LowLevelApi from '../../dist/low-level-api/low-level-api';
import HighLevelApi, {
    Coin,
    CoinAppConnection,
    ErrorState,
    EventType,
    State,
    TransportType,
} from '../../dist/high-level-api/ledger-api';

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
            <div id="coin-selector" class="selector">
                <label>
                    <input type="radio" name="coin-selector" value="${Coin.NIMIQ}" checked>
                    Nimiq
                </label>
                <label>
                    <input type="radio" name="coin-selector" value="${Coin.BITCOIN}">
                    Bitcoin
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
                    <input type="radio" name="transport-selector" value="${TransportType.WEB_AUTHN}">
                    WebAuthn
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

        <!-- Nimiq requests -->
        <div class="show-${Coin.NIMIQ}">
            <section class="nq-text nq-card">
                <h2 class="nq-card-header nq-h2">Get Public Key</h2>
                <div class="nq-card-body">
                    <input class="nq-input" id="bip32-path-public-key-input-nimiq" value="44'/242'/0'/0'">
                    <button class="nq-button-s" id="get-public-key-button-nimiq">Get Public Key</button>
                    <button class="nq-button-s show-${ApiType.LOW_LEVEL}" id="confirm-public-key-button-nimiq">
                        Confirm Public Key
                    </button>
                    <br>
                    <div class="nq-text">Public Key: <span id="public-key-nimiq" class="mono"></span></div>
                </div>
            </section>

            <section class="nq-text nq-card">
                <h2 class="nq-card-header nq-h2">Get Address</h2>
                <div class="nq-card-body">
                    <input class="nq-input" id="bip32-path-address-input-nimiq" value="44'/242'/0'/0'">
                    <button class="nq-button-s" id="get-address-button-nimiq">Get Address</button>
                    <button class="nq-button-s" id="confirm-address-button-nimiq">Confirm Address</button>
                    <br>
                    <div class="nq-text">Address: <span id="address-nimiq" class="mono"></span></div>
                </div>
            </section>

            <section class="nq-text nq-card">
                <h2 class="nq-card-header nq-h2">Sign Transaction</h2>
                <div class="nq-card-body">
                    <div class="nq-text">Fill the input with a transaction's serializeContent hex.</div>
                    <input class="nq-input" id="tx-hex-input-nimiq" value="${txHash}">
                    <button class="nq-button-s" id="sign-tx-button-nimiq">Sign</button>
                    <br>
                    <div class="nq-text">Signature: <span id="signature-nimiq" class="mono"></span></div>
                    </div>
            </section>
        </div>

        <!-- Bitcoin requests -->
        <div class="show-${Coin.BITCOIN}">
            <section class="nq-text nq-card">
                <h2 class="nq-card-header nq-h2">Get Address and Public Key</h2>
                <div class="nq-card-body">
                    <input class="nq-input" id="bip32-path-address-input-bitcoin" value="84'/0'/0'/0/0"
                        style="max-width: 20rem">
                    <button class="nq-button-s" id="get-address-button-bitcoin">Get Address and Public Key</button>
                    <button class="nq-button-s" id="confirm-address-button-bitcoin">Confirm Address</button>
                    <br>
                    <div class="nq-text">Address: <span id="address-bitcoin" class="mono"></span></div>
                    <div class="nq-text">Public Key: <span id="public-key-bitcoin" class="mono"></span></div>
                    <div class="nq-text">Chain Code: <span id="chain-code-bitcoin" class="mono"></span></div>
                </div>
            </section>

            <section class="nq-text nq-card">
                <h2 class="nq-card-header nq-h2">Get Extended Public Key</h2>
                <div class="nq-card-body">
                    <input class="nq-input" id="bip32-path-extended-public-key-input-bitcoin" value="84'/0'/0'"
                        style="max-width: 20rem">
                    <button class="nq-button-s" id="get-extended-public-key-button-bitcoin">
                        Get Extended Public Key
                    </button>
                    <br>
                    <div class="nq-text">
                        Extended Public Key:
                        <span id="extended-public-key-bitcoin" class="mono"></span>
                    </div>
                </div>
            </section>
        </div>

        <style>
            body {
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 3rem;
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
            .${ApiType.HIGH_LEVEL} .show-${ApiType.LOW_LEVEL},
            .${Coin.NIMIQ} .show-${Coin.BITCOIN},
            .${Coin.BITCOIN} .show-${Coin.NIMIQ} {
                display: none;
            }
        </style>
    `;

    function getInputElement(selector: string, parent: HTMLElement | Document = document): HTMLInputElement {
        const input = parent.querySelector(selector);
        if (!input || input.tagName !== 'INPUT') throw new Error(`No input found by selector ${selector}.`);
        return input as HTMLInputElement;
    }

    const $status = document.getElementById('status')!;
    const $highLevelApiState = document.getElementById('high-level-api-state')!;
    const $highLevelApiLastEvent = document.getElementById('high-level-api-last-event')!;
    const $apiSelector = document.getElementById('api-selector')!;
    const $coinSelector = document.getElementById('coin-selector')!;
    const $transportSelector = document.getElementById('transport-selector')!;
    const $noUserInteractionCheckbox = getInputElement('#no-user-interaction-checkbox');
    const $connectButton = document.getElementById('connect-button')!;
    const $disconnectButton = document.getElementById('disconnect-button')!;
    const $highLevelApiCancelButton = document.getElementById('high-level-api-cancel-button')!;

    // UI elements for Nimiq requests
    const $bip32PathPublicKeyInputNimiq = getInputElement('#bip32-path-public-key-input-nimiq');
    const $getPublicKeyButtonNimiq = document.getElementById('get-public-key-button-nimiq')!;
    const $confirmPublicKeyButtonNimiq = document.getElementById('confirm-public-key-button-nimiq')!;
    const $publicKeyNimiq = document.getElementById('public-key-nimiq')!;
    const $bip32PathAddressInputNimiq = getInputElement('#bip32-path-address-input-nimiq');
    const $getAddressButtonNimiq = document.getElementById('get-address-button-nimiq')!;
    const $confirmAddressButtonNimiq = document.getElementById('confirm-address-button-nimiq')!;
    const $addressNimiq = document.getElementById('address-nimiq')!;
    const $txHexInputNimiq = getInputElement('#tx-hex-input-nimiq');
    const $signTxButtonNimiq = document.getElementById('sign-tx-button-nimiq')!;
    const $signatureNimiq = document.getElementById('signature-nimiq')!;

    // UI elements for Bitcoin requests
    const $bip32PathAddressInputBitcoin = getInputElement('#bip32-path-address-input-bitcoin');
    const $getAddressButtonBitcoin = document.getElementById('get-address-button-bitcoin')!;
    const $confirmAddressButtonBitcoin = document.getElementById('confirm-address-button-bitcoin')!;
    const $addressBitcoin = document.getElementById('address-bitcoin')!;
    const $publicKeyBitcoin = document.getElementById('public-key-bitcoin')!;
    const $chainCodeBitcoin = document.getElementById('chain-code-bitcoin')!;
    const $bip32PathExtendedPublicKeyInputBitcoin = getInputElement('#bip32-path-extended-public-key-input-bitcoin');
    const $getExtendedPublicKeyButtonBitcoin = document.getElementById('get-extended-public-key-button-bitcoin')!;
    const $extendedPublicKeyBitcoin = document.getElementById('extended-public-key-bitcoin')!;

    function displayStatus(msg: string) {
        console.log(msg);
        $status.textContent = msg;
    }

    function enableSelector(selector: HTMLElement, enable: boolean) {
        for (const el of selector.getElementsByTagName('input')) {
            el.disabled = !enable;
        }
    }

    function switchApi() {
        const api = getInputElement(':checked', $apiSelector).value;
        document.body.classList.toggle(ApiType.LOW_LEVEL, api === ApiType.LOW_LEVEL);
        document.body.classList.toggle(ApiType.HIGH_LEVEL, api === ApiType.HIGH_LEVEL);
        enableSelector($coinSelector, api === ApiType.HIGH_LEVEL); // other coins than Nimiq only for high level api
        getInputElement(`[value=${Coin.NIMIQ}]`, $coinSelector).checked = true;
    }

    function switchCoin() {
        const coin = getInputElement(':checked', $coinSelector).value;
        document.body.classList.toggle(Coin.NIMIQ, coin === Coin.NIMIQ);
        document.body.classList.toggle(Coin.BITCOIN, coin === Coin.BITCOIN);
        enableSelector($apiSelector, coin === Coin.NIMIQ && !window._api); // only for Nimiq and only until initialized
        getInputElement(`[value=${ApiType.HIGH_LEVEL}]`, $apiSelector).checked = true;
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
            enableSelector($apiSelector, false);
            displayStatus('Creating Api');
            const apiType = getInputElement(':checked', $apiSelector).value;
            const transportType = getInputElement(':checked', $transportSelector).value;
            if (apiType === ApiType.LOW_LEVEL) {
                enableSelector($transportSelector, false);
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
                    case TransportType.WEB_AUTHN:
                        window._transport = await TransportWebAuthn.create();
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
                    $highLevelApiState.textContent = `${state.type}${state instanceof ErrorState
                        ? `: ${state.errorType}` : ''}`;
                });
                window._api.on(EventType.CONNECTED, (connection: CoinAppConnection) => {
                    console.log(`%cConnected to coin ${connection.coin}, wallet ${connection.walletId}`, 'color: teal');
                    $highLevelApiLastEvent.textContent = `Connected to coin ${connection.coin},`
                        + ` wallet ${connection.walletId}`;
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
            const coin = getInputElement(':checked', $coinSelector).value as Coin;
            const connected = await api.connect(coin);
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

    async function getPublicKeyNimiq(confirm: boolean) {
        if ($noUserInteractionCheckbox.checked) await clearUserInteraction();
        try {
            $publicKeyNimiq.textContent = '';
            const bip32Path = $bip32PathPublicKeyInputNimiq.value;
            const loadNimiqPromise = loadNimiqCore();
            const api = await createApi();
            const msg = confirm ? 'Confirm public key...' : 'Getting public key...';
            displayStatus(msg);
            let publicKey: Uint8Array;
            if (api instanceof LowLevelApi) {
                ({ publicKey } = await api.getPublicKey(bip32Path, false, confirm));
            } else {
                if (confirm) throw new Error('High level api does not provide the option to confirm a public key');
                publicKey = (await api.Nimiq.getPublicKey(bip32Path)).serialize();
            }
            const Nimiq = await loadNimiqPromise;
            $publicKeyNimiq.textContent = Nimiq.BufferUtils.toHex(publicKey);
            displayStatus('Received public key');
            return publicKey;
        } catch (error) {
            displayStatus(`Failed to get public key: ${error}`);
            throw error;
        }
    }

    async function getAddressNimiq(confirm: boolean) {
        if ($noUserInteractionCheckbox.checked) await clearUserInteraction();
        try {
            $addressNimiq.textContent = '';
            const bip32Path = $bip32PathAddressInputNimiq.value;
            const api = await createApi();
            const msg = confirm ? 'Confirm address...' : 'Getting address...';
            displayStatus(msg);
            let address: string;
            if (api instanceof LowLevelApi) {
                ({ address } = await api.getAddress(bip32Path, true, confirm));
            } else {
                address = confirm
                    ? await api.Nimiq.getConfirmedAddress(bip32Path)
                    : await api.Nimiq.getAddress(bip32Path);
            }
            $addressNimiq.textContent = address;
            displayStatus('Received address');
            return address;
        } catch (error) {
            displayStatus(`Failed to get address: ${error}`);
            throw error;
        }
    }

    async function signTransactionNimiq() {
        if ($noUserInteractionCheckbox.checked) await clearUserInteraction();
        try {
            $signatureNimiq.textContent = '';
            const tx = $txHexInputNimiq.value;
            const [api, Nimiq] = await Promise.all([
                createApi(),
                loadNimiqCore(),
            ]);
            const buffer = Nimiq.BufferUtils.fromHex(tx);
            const bip32Path = $bip32PathAddressInputNimiq.value;
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
                const proofBytes = new Nimiq.SerialBuffer((await api.Nimiq.signTransaction(
                    { sender, senderType, recipient, recipientType, value, fee, validityStartHeight, flags, extraData },
                    bip32Path,
                )).proof);
                signature = Nimiq.SignatureProof.unserialize(proofBytes).signature.serialize();
            }
            $signatureNimiq.textContent = Nimiq.BufferUtils.toHex(signature);
        } catch (error) {
            displayStatus(error);
        }
    }

    async function getAddressAndPublicKeyBitcoin(confirm: boolean) {
        if ($noUserInteractionCheckbox.checked) await clearUserInteraction();
        try {
            $addressBitcoin.textContent = '';
            $publicKeyBitcoin.textContent = '';
            $chainCodeBitcoin.textContent = '';
            const bip32Path = $bip32PathAddressInputBitcoin.value;
            const api = await createApi();
            if (api instanceof LowLevelApi) throw new Error('Bitcoin not supported by LowLevelApi');
            const msg = confirm ? 'Confirm address...' : 'Getting address...';
            displayStatus(msg);
            const { address, publicKey, chainCode } = confirm
                ? await api.Bitcoin.getConfirmedAddressAndPublicKey(bip32Path)
                : await api.Bitcoin.getAddressAndPublicKey(bip32Path);
            $addressBitcoin.textContent = address;
            $publicKeyBitcoin.textContent = publicKey;
            $chainCodeBitcoin.textContent = chainCode;
            displayStatus('Received address and public key');
            return address;
        } catch (error) {
            displayStatus(`Failed to get address: ${error}`);
            throw error;
        }
    }

    async function getExtendedPublicKeyBitcoin() {
        if ($noUserInteractionCheckbox.checked) await clearUserInteraction();
        try {
            $extendedPublicKeyBitcoin.textContent = '';
            const bip32Path = $bip32PathExtendedPublicKeyInputBitcoin.value;
            const api = await createApi();
            if (api instanceof LowLevelApi) throw new Error('Bitcoin not supported by LowLevelApi');
            displayStatus('Getting extended public key...');
            const extendedPublicKey = await api.Bitcoin.getExtendedPublicKey(bip32Path);
            $extendedPublicKeyBitcoin.textContent = extendedPublicKey;
            displayStatus('Received extended public key');
            return extendedPublicKey;
        } catch (error) {
            displayStatus(`Failed to get extended public key: ${error}`);
            throw error;
        }
    }

    function init() {
        console.log('Nimiq Ledger Api demo. Note that another great place to directly experiment with the apis'
            + ' provided by Ledger is https://ledger-repl.now.sh/');
        console.log('To experiment with how connecting to the Ledger works on a fresh system, don\'t forget to revoke'
            + ' previously granted permissions.');
        $apiSelector.addEventListener('change', switchApi);
        $coinSelector.addEventListener('change', switchCoin);
        $connectButton.addEventListener('click', connect);
        $disconnectButton.addEventListener('click', disconnect);
        $highLevelApiCancelButton.addEventListener('click', cancelRequest);

        $getPublicKeyButtonNimiq.addEventListener('click', () => getPublicKeyNimiq(false));
        $confirmPublicKeyButtonNimiq.addEventListener('click', () => getPublicKeyNimiq(true));
        $getAddressButtonNimiq.addEventListener('click', () => getAddressNimiq(false));
        $confirmAddressButtonNimiq.addEventListener('click', () => getAddressNimiq(true));
        $signTxButtonNimiq.addEventListener('click', signTransactionNimiq);

        $getAddressButtonBitcoin.addEventListener('click', () => getAddressAndPublicKeyBitcoin(false));
        $confirmAddressButtonBitcoin.addEventListener('click', () => getAddressAndPublicKeyBitcoin(true));
        $getExtendedPublicKeyButtonBitcoin.addEventListener('click', () => getExtendedPublicKeyBitcoin());

        switchApi();
        switchCoin();
    }

    init();
});
