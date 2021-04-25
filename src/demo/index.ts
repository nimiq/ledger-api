import TransportWebUsb from '@ledgerhq/hw-transport-webusb';
import TransportWebHid from '@ledgerhq/hw-transport-webhid';
import TransportWebBle from '@ledgerhq/hw-transport-web-ble';
import TransportWebAuthn from '@ledgerhq/hw-transport-webauthn';
import TransportU2F from '@ledgerhq/hw-transport-u2f';
import NetworkTransportForUrls from '@ledgerhq/hw-transport-http';
// dev dependencies for the demo page
/* eslint-disable import/no-extraneous-dependencies */
import { listen as onLog } from '@ledgerhq/logs';
import { verify as verifySignedMessageBitcoin } from 'bitcoinjs-message';
/* eslint-enable import/no-extraneous-dependencies */
import { loadNimiqCore } from '../lib/load-nimiq';

// Our built library.
// Typescript needs the import as specified to find the .d.ts file, see rollup.config.js
import LowLevelApi from '../../dist/low-level-api/low-level-api';
import HighLevelApi, {
    Coin,
    CoinAppConnection,
    ErrorState,
    EventType,
    Network,
    State,
    TransportType,
} from '../../dist/high-level-api/ledger-api';

type Transport = import('@ledgerhq/hw-transport').default;

window.Buffer = Buffer;

enum ApiType {
    LOW_LEVEL = 'low-level',
    HIGH_LEVEL = 'high-level',
}

enum DataUiType {
    HEX = 'hex',
    ASCII = 'ascii',
    HTLC_CREATION = 'htlc-creation',
    VESTING_CREATION = 'vesting-creation',
}

declare global {
    interface Window {
        _transport?: Transport;
        _api?: LowLevelApi | typeof HighLevelApi;
    }
}

window.addEventListener('load', () => {
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
                <label>
                    <input type="radio" name="transport-selector" value="${TransportType.NETWORK}">
                    Network
                </label>
            </div>
            <div id="network-endpoint" class="show-${TransportType.NETWORK}">
                <label>
                    Network Endpoint:
                    <input required class="nq-input-s" id="network-endpoint-input" value="ws://127.0.0.1:8435">
                    <button class="nq-button-s" id="network-endpoint-ledger-live-button">Ledger Live Bridge</button>
                    <button class="nq-button-s" id="network-endpoint-speculos-button">Speculos</button>
                </label>
                <div>
                    For communication with
                    <a href="https://github.com/LedgerHQ/speculos" target="_blank">Speculos</a>
                    run yarn speculos-bridge and set the Speculos apdu port to 40000.
                </div>
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
                    <input required class="nq-input" id="bip32-path-public-key-input-nimiq" value="44'/242'/0'/0'">
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
                    <input required class="nq-input" id="bip32-path-address-input-nimiq" value="44'/242'/0'/0'">
                    <button class="nq-button-s" id="get-address-button-nimiq">Get Address</button>
                    <button class="nq-button-s" id="confirm-address-button-nimiq">Confirm Address</button>
                    <br>
                    <div class="nq-text">Address: <span id="address-nimiq" class="mono"></span></div>
                </div>
            </section>

            <section class="nq-text nq-card">
                <h2 class="nq-card-header nq-h2">Sign Transaction</h2>
                <div id="tx-ui-nimiq" class="nq-card-body">
                    <label>
                        <span>Sender</span>
                        <input required class="nq-input" id="tx-sender-input-nimiq"
                            value="NQ06 QFK9 HU4T 5LJ8 CGYG 53S4 G5LD HDGP 2G8F">
                    </label>
                    <div id="tx-sender-type-selector-nimiq" class="selector">
                        <span>Sender Type</span>
                        <label>
                            <input type="radio" name="tx-sender-type-selector-nimiq" value="basic" checked>
                            Basic
                        </label>
                        <label>
                            <input type="radio" name="tx-sender-type-selector-nimiq" value="htlc">
                            HTLC
                        </label>
                        <label>
                            <input type="radio" name="tx-sender-type-selector-nimiq" value="vesting">
                            Vesting
                        </label>
                    </div>
                    <label>
                        <span>Recipient</span>
                        <input required class="nq-input" id="tx-recipient-input-nimiq"
                            value="NQ15 GQKC ADU7 6KG5 SUEB 80SE P5TL 344P CKKE">
                    </label>
                    <div id="tx-recipient-type-selector-nimiq" class="selector">
                        <span>Recipient Type</span>
                        <label>
                            <input type="radio" name="tx-recipient-type-selector-nimiq" value="basic" checked>
                            Basic
                        </label>
                        <label>
                            <input type="radio" name="tx-recipient-type-selector-nimiq" value="htlc">
                            HTLC
                        </label>
                        <label>
                            <input type="radio" name="tx-recipient-type-selector-nimiq" value="vesting">
                            Vesting
                        </label>
                    </div>
                    <label>
                        <span>Amount (in NIM)</span>
                        <input type="number" min="0.00001" max="${Number.MAX_SAFE_INTEGER / 1e5}" step="0.00001"
                            required class="nq-input" id="tx-amount-input-nimiq" value="100">
                    </label>
                    <label>
                        <span>Fee (in NIM)</span>
                        <input type="number" min="0" max="${Number.MAX_SAFE_INTEGER / 1e5}" step="0.00001" required
                            class="nq-input" id="tx-fee-input-nimiq" value="0">
                    </label>
                    <label>
                        <span>Validity Start Height</span>
                        <input type="number" min="0" max="${2 ** 32 - 1}" required class="nq-input"
                            id="tx-validity-start-height-input-nimiq" value="1234">
                    </label>
                    <div id="tx-network-selector-nimiq" class="selector">
                        <span>Network</span>
                        <label>
                            <input type="radio" name="tx-network-selector-nimiq" value="test" checked>
                            Test
                        </label>
                        <label>
                            <input type="radio" name="tx-network-selector-nimiq" value="dev">
                            Dev
                        </label>
                        <label>
                            <input type="radio" name="tx-network-selector-nimiq" value="main">
                            Main
                        </label>
                    </div>
                    <div class="selector">
                        <span>Flags</span>
                        <label>
                            <input type="checkbox" id="tx-flag-contract-checkbox-nimiq">
                            Contract Creation
                        </label>
                    </div>
                    <div id="tx-data-ui-selector-nimiq" class="selector ${DataUiType.HEX}">
                        <span>Data Input</span>
                        <label>
                            <input type="radio" name="tx-data-ui-selector-nimiq" value="${DataUiType.HEX}" checked>
                            Hex
                        </label>
                        <label>
                            <input type="radio" name="tx-data-ui-selector-nimiq" value="${DataUiType.ASCII}">
                            Ascii
                        </label>
                        <label>
                            <input type="radio" name="tx-data-ui-selector-nimiq" value="${DataUiType.HTLC_CREATION}">
                            Create HTLC
                        </label>
                        <label>
                            <input type="radio" name="tx-data-ui-selector-nimiq" value="${DataUiType.VESTING_CREATION}">
                            Create Vesting
                        </label>
                    </div>
                    <label class="show-${DataUiType.HEX}">
                        <span>Data (Hex)</span>
                        <input class="nq-input" id="tx-data-hex-input-nimiq" placeholder="Optional">
                    </label>
                    <label class="show-${DataUiType.ASCII}">
                        <span>Data (Ascii)</span>
                        <input class="nq-input" id="tx-data-ascii-input-nimiq" value="Hello world."
                            placeholder="Optional">
                    </label>
                    <div class="show-${DataUiType.HTLC_CREATION}">
                        <label>
                            <span>HTLC Recipient</span>
                            <input required class="nq-input" id="tx-data-htlc-recipient-input-nimiq"
                                value="NQ15 GQKC ADU7 6KG5 SUEB 80SE P5TL 344P CKKE">
                        </label>
                        <label>
                            <span>HTLC Refund</span>
                            <input required class="nq-input" id="tx-data-htlc-sender-input-nimiq"
                                value="NQ06 QFK9 HU4T 5LJ8 CGYG 53S4 G5LD HDGP 2G8F">
                        </label>
                        <div id="tx-data-htlc-algorithm-selector-nimiq" class="selector">
                            <span>HTLC Hash Algorithm</span>
                            <label>
                                <input type="radio" name="tx-data-htlc-algorithm-selector-nimiq" value="blake2b">
                                blake2b
                            </label>
                            <label>
                                <input type="radio" name="tx-data-htlc-algorithm-selector-nimiq" value="argon2d">
                                argon2d
                            </label>
                            <label>
                                <input type="radio" name="tx-data-htlc-algorithm-selector-nimiq" value="sha256" checked>
                                sha256
                            </label>
                            <label>
                                <input type="radio" name="tx-data-htlc-algorithm-selector-nimiq" value="sha512">
                                sha512
                            </label>
                        </div>
                        <label>
                            <span>HTLC Hash Root</span>
                            <!-- Demo is sha256 of 0000000000000000000000000000000000000000000000000000000000000000 -->
                            <input required class="nq-input" id="tx-data-htlc-hash-root-input-nimiq"
                                value="66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925">
                        </label>
                        <label>
                            <span>HTLC Hash Count</span>
                            <input type="number" min="1" max="${2 ** 8 - 1}" required class="nq-input"
                                id="tx-data-htlc-hash-count-input-nimiq" value="1">
                        </label>
                        <label>
                            <span>HTLC Timeout</span>
                            <input type="number" min="0" max="${2 ** 32 - 1}" required class="nq-input"
                                id="tx-data-htlc-timeout-input-nimiq" value="12345">
                        </label>
                    </div>
                    <div class="show-${DataUiType.VESTING_CREATION}">
                        <label>
                            <span>Vesting Owner</span>
                            <input required class="nq-input" id="tx-data-vesting-owner-input-nimiq"
                                value="NQ06 QFK9 HU4T 5LJ8 CGYG 53S4 G5LD HDGP 2G8F">
                        </label>
                        <label>
                            <span>Vesting Start</span>
                            <input type="number" min="0" max="${2 ** 32 - 1}" class="nq-input"
                                id="tx-data-vesting-start-input-nimiq" placeholder="Optional, default: 0">
                        </label>
                        <label>
                            <span>Vesting Step Blocks</span>
                            <input type="number" min="0" max="${2 ** 32 - 1}" required class="nq-input"
                                id="tx-data-vesting-step-blocks-input-nimiq" value="10000">
                        </label>
                        <label>
                            <span>Vesting Step Amount</span>
                            <input type="number" min="0" max="${Number.MAX_SAFE_INTEGER / 1e5}" step="0.00001"
                                class="nq-input" id="tx-data-vesting-step-amount-input-nimiq"
                                placeholder="Optional, default: Transaction Value">
                        </label>
                        <label>
                            <span>Vesting Total Amount</span>
                            <input type="number" min="0" max="${Number.MAX_SAFE_INTEGER / 1e5}" step="0.00001"
                                class="nq-input" id="tx-data-vesting-total-amount-input-nimiq"
                                placeholder="Optional, default: Transaction Value">
                        </label>
                    </div>
                    <button class="nq-button-s" id="sign-tx-button-nimiq">Sign</button>
                    <div class="nq-text">Signature: <span id="signature-nimiq" class="mono"></span></div>
                </div>
            </section>

            <section class="nq-text nq-card show-${ApiType.LOW_LEVEL}">
                <h2 class="nq-card-header nq-h2">Get App Name and Version</h2>
                <div class="nq-card-body">
                    <button class="nq-button-s" id="get-app-name-and-version-button-nimiq">Get Name And Version</button>
                    <br>
                    <div class="nq-text">App: <span id="app-name-nimiq"></span></div>
                    <div class="nq-text">Version: <span id="app-version-nimiq"></span></div>
                </div>
            </section>

            <section class="nq-text nq-card show-${ApiType.HIGH_LEVEL}">
                <h2 class="nq-card-header nq-h2">Get Wallet Id</h2>
                <div class="nq-card-body">
                    <button class="nq-button-s" id="get-wallet-id-button-nimiq">Get Wallet Id</button>
                    <br>
                    <div class="nq-text">Wallet Id: <span id="wallet-id-nimiq" class="mono"></span></div>
                </div>
            </section>
        </div>

        <!-- Bitcoin requests -->
        <div class="show-${Coin.BITCOIN}">
            <section class="nq-text nq-card">
                <h2 class="nq-card-header nq-h2">Get Address and Public Key</h2>
                <div class="nq-card-body">
                    <input required class="nq-input" id="bip32-path-address-input-bitcoin" value="84'/1'/0'/0/0"
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
                    <input required class="nq-input" id="bip32-path-extended-public-key-input-bitcoin" value="84'/1'/0'"
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

            <section class="nq-text nq-card">
                <h2 class="nq-card-header nq-h2">Sign Transaction</h2>
                <div class="nq-card-body">
                    <textarea required class="nq-input" id="tx-info-textarea-bitcoin">`
                        /* eslint-disable no-multi-spaces */
                        + '{\n'
                        + '    "inputs": [{\n'
                        + '        "transaction": "020000000001015fd6b1d5315141cf77edbc06d8da1d2a0b164c0f9f5d4ea08edc35'
                        +              '240bd763340100000017160014126f057c3e0c29770dd44ca13417873ca8ba8640feffffff02348'
                        +              '31e000000000016001438673bdd1248c29c32c96b112f0a5cc61ce3aaea40420f00000000001600'
                        +              '145713787559453114fbed627ca8a5a396ffd4492502473044022077ab82661bf71658da41d804b'
                        +              '36236496f34b6d338ec95abd9808b98848400d302202c20450e9d315ccfe230a51a98c4659e5582'
                        +              '59d6d3041bdf9209a050f23f45df0121030b33659acb140264603ce5ffe22096d4691e3d6bbbffb'
                        +              'f0b7935b010f025e523b6751c00",\n'
                        + '        "index": 1,\n'
                        + '        "keyPath": "84\'/1\'/0\'/0/0"\n'
                        + '    }],\n'
                        + '    "outputs": [{\n'
                        + '        "amount": 700000,\n'
                        + '        "address": "tb1qu0hywjutdcr5lwv6du92s08w6jcq64cryha7vp"\n'
                        + '    }, {\n'
                        + '        "amount": 299000,\n'
                        + '        "address": "tb1qk5392nt3z32y3eqjxzv6h3y3uj66u87xh5wwnh"\n'
                        + '    }],\n'
                        + '    "changePath": "84\'/1\'/0\'/1/0"\n'
                        + '}'
                        /* eslint-enable no-multi-spaces */
                    + `</textarea>
                    <div class="nq-text">
                        <button class="nq-button-s" id="sign-tx-button-bitcoin">Sign Transaction</button>
                    </div>
                    <div class="nq-text">
                        Signed transaction:
                        <span id="signed-tx-bitcoin" class="mono"></span>
                    </div>
                    <div class="nq-text">
                        Use for example an
                        <a href="https://live.blockcypher.com/btc/decodetx/" target="_blank">online decoder</a>
                        or
                        <a href="https://github.com/bitcoinjs/bitcoinjs-lib" target="_blank">bitcoinjs-lib</a>
                        to decode the transaction and
                        <a href="https://github.com/nimiq/electrum-client" target="_blank">Nimiq's electrum client</a>
                        to broadcast the transaction. If you want to broadcast the transaction, use a high enough fee
                        (difference between inputs and outputs).
                    </div>
                </div>
            </section>

            <section class="nq-text nq-card">
                <h2 class="nq-card-header nq-h2">Sign Message</h2>
                <div class="nq-card-body">
                    <textarea required class="nq-input" id="sign-message-textarea-bitcoin">Message to sign</textarea>
                    <div class="nq-text">
                        <input required class="nq-input" id="bip32-path-sign-message-input-bitcoin"
                            value="84'/1'/0'/0/0" style="max-width: 20rem">
                        <button class="nq-button-s" id="sign-message-button-bitcoin">Sign Message</button>
                    </div>
                    <div class="nq-text">Signer address: <span id="message-signer-bitcoin" class="mono"></span></div>
                    <div class="nq-text">Signature: <span id="message-signature-bitcoin" class="mono"></span></div>
                    <div class="nq-text">
                        Use for example an
                        <a href="https://www.verifybitcoinmessage.com/" target="_blank">online verifier</a>
                        or
                        <a href="https://github.com/bitcoinjs/bitcoinjs-message" target="_blank">bitcoinjs-message</a>
                        to verify the signed message.
                    </div>
                </div>
            </section>

            <section class="nq-text nq-card">
                <h2 class="nq-card-header nq-h2">Get Wallet Id</h2>
                <div class="nq-card-body">
                    <span id="wallet-id-network-selector-bitcoin" class="selector" style="margin-right: 2rem">
                        <label>
                            <input type="radio" name="wallet-id-network-selector-bitcoin" value="${Network.MAINNET}"
                                checked>
                            Mainnet
                        </label>
                        <label>
                            <input type="radio" name="wallet-id-network-selector-bitcoin" value="${Network.TESTNET}">
                            Testnet
                        </label>
                    </span>
                    <button class="nq-button-s" id="get-wallet-id-button-bitcoin">Get Wallet Id</button>
                    <br>
                    <div class="nq-text">Wallet Id: <span id="wallet-id-bitcoin" class="mono"></span></div>
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

            #network-endpoint {
                margin-bottom: 2rem;
                line-height: 1.5;
            }

            .nq-card {
                min-width: 75rem;
                margin-bottom: 0;
            }

            .nq-card-header {
                margin-bottom: 0;
            }

            .nq-input {
                margin-right: 2rem;
            }

            .nq-input:invalid {
                border-color: rgba(217, 68, 50, .7);
            }
            .nq-input:invalid:hover {
                border-color: rgba(217, 68, 50, .8);
            }
            .nq-input:invalid:focus {
                border-color: rgba(217, 68, 50, 1);
            }

            .mono {
                font-family: monospace;
                word-break: break-word;
            }

            #tx-ui-nimiq > label,
            #tx-ui-nimiq > :not(.selector) > label,
            #tx-ui-nimiq .selector {
                display: flex;
                min-height: 5rem;
                margin-bottom: 1.5rem;
                align-items: center;
            }

            #tx-ui-nimiq label span:first-child,
            #tx-ui-nimiq .selector span:first-child {
                min-width: 20rem;
                margin-right: .5rem;
            }

            #tx-ui-nimiq .nq-input {
                margin-right: 0;
                flex-grow: 1;
            }

            #tx-info-textarea-bitcoin,
            #sign-message-textarea-bitcoin {
                min-width: 100%;
                max-width: 100%;
            }

            #tx-info-textarea-bitcoin {
                min-height: 70rem;
            }

            body:not(.${ApiType.LOW_LEVEL}) .show-${ApiType.LOW_LEVEL},
            body:not(.${ApiType.HIGH_LEVEL}) .show-${ApiType.HIGH_LEVEL},
            body:not(.${Coin.NIMIQ}) .show-${Coin.NIMIQ},
            body:not(.${Coin.BITCOIN}) .show-${Coin.BITCOIN},
            body:not(.${TransportType.NETWORK}) .show-${TransportType.NETWORK},
            #tx-data-ui-selector-nimiq:not(.${DataUiType.HEX}) ~ .show-${DataUiType.HEX},
            #tx-data-ui-selector-nimiq:not(.${DataUiType.ASCII}) ~ .show-${DataUiType.ASCII},
            #tx-data-ui-selector-nimiq:not(.${DataUiType.HTLC_CREATION}) ~ .show-${DataUiType.HTLC_CREATION},
            #tx-data-ui-selector-nimiq:not(.${DataUiType.VESTING_CREATION}) ~ .show-${DataUiType.VESTING_CREATION} {
                display: none;
            }
        </style>
    `;

    function getInputElement(selector: string, $parent: HTMLElement | Document = document): HTMLInputElement {
        const input = $parent.querySelector(selector);
        if (!input || input.tagName !== 'INPUT') throw new Error(`No input found by selector ${selector}.`);
        return input as HTMLInputElement;
    }

    const $status = document.getElementById('status')!;
    const $highLevelApiState = document.getElementById('high-level-api-state')!;
    const $highLevelApiLastEvent = document.getElementById('high-level-api-last-event')!;
    const $apiSelector = document.getElementById('api-selector')!;
    const $coinSelector = document.getElementById('coin-selector')!;
    const $transportSelector = document.getElementById('transport-selector')!;
    const $networkEndpointInput = getInputElement('#network-endpoint-input');
    const $networkEnpointLedgerLiveButton = document.getElementById('network-endpoint-ledger-live-button')!;
    const $networkEndpointSpeculosButton = document.getElementById('network-endpoint-speculos-button')!;
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
    const $txSenderInputNimiq = getInputElement('#tx-sender-input-nimiq');
    const $txSenderTypeSelectorNimiq = document.getElementById('tx-sender-type-selector-nimiq')!;
    const $txRecipientInputNimiq = getInputElement('#tx-recipient-input-nimiq');
    const $txRecipientTypeSelectorNimiq = document.getElementById('tx-recipient-type-selector-nimiq')!;
    const $txAmountInputNimiq = getInputElement('#tx-amount-input-nimiq');
    const $txFeeInputNimiq = getInputElement('#tx-fee-input-nimiq');
    const $txValidityStartHeightInputNimiq = getInputElement('#tx-validity-start-height-input-nimiq');
    const $txNetworkSelectorNimiq = document.getElementById('tx-network-selector-nimiq')!;
    const $txFlagContractCreationCheckboxNimiq = getInputElement('#tx-flag-contract-checkbox-nimiq');
    const $txDataUiSelectorNimiq = document.getElementById('tx-data-ui-selector-nimiq')!;
    const $txDataHexInputNimiq = getInputElement('#tx-data-hex-input-nimiq');
    const $txDataAsciiInputNimiq = getInputElement('#tx-data-ascii-input-nimiq');
    const $txDataHtlcSenderInputNimiq = getInputElement('#tx-data-htlc-sender-input-nimiq');
    const $txDataHtlcRecipientInputNimiq = getInputElement('#tx-data-htlc-recipient-input-nimiq');
    const $txDataHtlcAlgorithmSelectorNimiq = document.getElementById('tx-data-htlc-algorithm-selector-nimiq')!;
    const $txDataHtlcHashRootInputNimiq = getInputElement('#tx-data-htlc-hash-root-input-nimiq');
    const $txDataHtlcHashCountInputNimiq = getInputElement('#tx-data-htlc-hash-count-input-nimiq');
    const $txDataHtlcTimeoutInputNimiq = getInputElement('#tx-data-htlc-timeout-input-nimiq');
    const $txDataVestingOwnerInputNimiq = getInputElement('#tx-data-vesting-owner-input-nimiq');
    const $txDataVestingStartInputNimiq = getInputElement('#tx-data-vesting-start-input-nimiq');
    const $txDataVestingStepBlocksInputNimiq = getInputElement('#tx-data-vesting-step-blocks-input-nimiq');
    const $txDataVestingStepAmountInputNimiq = getInputElement('#tx-data-vesting-step-amount-input-nimiq');
    const $txDataVestingTotalAmountInputNimiq = getInputElement('#tx-data-vesting-total-amount-input-nimiq');
    const $signTxButtonNimiq = document.getElementById('sign-tx-button-nimiq')!;
    const $signatureNimiq = document.getElementById('signature-nimiq')!;
    const $getAppNameAndVersionButtonNimiq = document.getElementById('get-app-name-and-version-button-nimiq')!;
    const $appNameNimiq = document.getElementById('app-name-nimiq')!;
    const $appVersionNimiq = document.getElementById('app-version-nimiq')!;
    const $getWalletIdButtonNimiq = document.getElementById('get-wallet-id-button-nimiq')!;
    const $walletIdNimiq = document.getElementById('wallet-id-nimiq')!;

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
    const $txInfoTextareaBitcoin = document.getElementById('tx-info-textarea-bitcoin') as HTMLTextAreaElement;
    const $signTxButtonBitcoin = document.getElementById('sign-tx-button-bitcoin')!;
    const $signedTxBitcoin = document.getElementById('signed-tx-bitcoin')!;
    const $signMessageTextareaBitcoin = document.getElementById('sign-message-textarea-bitcoin') as HTMLTextAreaElement;
    const $bip32PathSignMessageInputBitcoin = getInputElement('#bip32-path-sign-message-input-bitcoin');
    const $signMessageButtonBitcoin = document.getElementById('sign-message-button-bitcoin')!;
    const $messageSignerBitcoin = document.getElementById('message-signer-bitcoin')!;
    const $messageSignatureBitcoin = document.getElementById('message-signature-bitcoin')!;
    const $walletIdNetworkSelectorBitcoin = document.getElementById('wallet-id-network-selector-bitcoin')!;
    const $getWalletIdButtonBitcoin = document.getElementById('get-wallet-id-button-bitcoin')!;
    const $walletIdBitcoin = document.getElementById('wallet-id-bitcoin')!;

    function displayStatus(msg: string) {
        console.log(msg);
        $status.textContent = msg;
    }

    function enableSelector($selector: HTMLElement, enable: boolean) {
        for (const el of $selector.getElementsByTagName('input')) {
            el.disabled = !enable;
        }
    }

    function getSelectorValue($selector: HTMLElement): string {
        return getInputElement(':checked', $selector).value;
    }

    function switchApi() {
        const api = getSelectorValue($apiSelector);
        document.body.classList.toggle(ApiType.LOW_LEVEL, api === ApiType.LOW_LEVEL);
        document.body.classList.toggle(ApiType.HIGH_LEVEL, api === ApiType.HIGH_LEVEL);
        enableSelector($coinSelector, api === ApiType.HIGH_LEVEL); // other coins than Nimiq only for high level api
        getInputElement(`[value=${Coin.NIMIQ}]`, $coinSelector).checked = true;
    }

    function switchCoin() {
        const coin = getSelectorValue($coinSelector);
        document.body.classList.toggle(Coin.NIMIQ, coin === Coin.NIMIQ);
        document.body.classList.toggle(Coin.BITCOIN, coin === Coin.BITCOIN);
        enableSelector($apiSelector, coin === Coin.NIMIQ && !window._api); // only for Nimiq and only until initialized
        getInputElement(`[value=${ApiType.HIGH_LEVEL}]`, $apiSelector).checked = true;
    }

    function switchTransport() {
        const transportType = getSelectorValue($transportSelector) as TransportType;
        document.body.classList.remove(...Object.values(TransportType));
        document.body.classList.add(transportType);

        const apiType = getSelectorValue($apiSelector);
        if (!window._api || apiType !== ApiType.HIGH_LEVEL) return;
        const api = window._api as typeof HighLevelApi;
        if (transportType === TransportType.NETWORK) {
            api.setTransportType(transportType, $networkEndpointInput.value);
        } else {
            api.setTransportType(transportType);
        }
    }

    function changeNetworkEndpoint(endpoint?: string) {
        endpoint = endpoint || $networkEndpointInput.value;
        $networkEndpointInput.value = endpoint;
        const apiType = getSelectorValue($apiSelector);
        const transportType = getSelectorValue($transportSelector);
        if (!window._api || apiType !== ApiType.HIGH_LEVEL || transportType !== TransportType.NETWORK) return;
        const api = window._api as typeof HighLevelApi;
        api.setTransportType(transportType, endpoint);
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
            const apiType = getSelectorValue($apiSelector);
            const transportType = getSelectorValue($transportSelector);
            if (apiType === ApiType.LOW_LEVEL) {
                enableSelector($transportSelector, false);
                $networkEndpointInput.disabled = true;
                ($networkEnpointLedgerLiveButton as HTMLButtonElement).disabled = true;
                ($networkEndpointSpeculosButton as HTMLButtonElement).disabled = true;
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
                    case TransportType.NETWORK:
                        window._transport = await (NetworkTransportForUrls([$networkEndpointInput.value])).create();
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
                    const message = `Connected to coin ${connection.coin}`
                        + `${connection.walletId ? `, wallet ${connection.walletId}` : ''}`;
                    console.log(`%c${message}`, 'color: teal');
                    $highLevelApiLastEvent.textContent = message;
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
                changeNetworkEndpoint();
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
        const api = await createApi();
        if (api instanceof LowLevelApi) {
            const { name, version } = await api.getAppNameAndVersion();
            if (name !== 'Nimiq' && /* for speculos */ name !== 'app') throw new Error(`Wrong app connected: ${name}`);
            // @ts-ignore: deviceModel does not exist on all transport types
            const deviceModel = (window._transport.deviceModel || {}).productName || 'device type unknown';
            displayStatus(`Connected (app version ${version}, ${deviceModel})`);
        } else {
            const coin = getSelectorValue($coinSelector) as Coin;
            let connected: boolean;
            if (coin === Coin.BITCOIN && api.currentRequest && 'network' in api.currentRequest) {
                connected = await api.connect(coin, api.currentRequest.network);
            } else {
                connected = await api.connect(coin);
            }
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
        } catch (error) {
            displayStatus(`Failed to get address: ${error}`);
            throw error;
        }
    }

    async function signTransactionNimiq() {
        if ($noUserInteractionCheckbox.checked) await clearUserInteraction();
        try {
            $signatureNimiq.textContent = '';
            const [api, Nimiq] = await Promise.all([
                createApi(),
                loadNimiqCore(),
            ]);
            const bip32Path = $bip32PathAddressInputNimiq.value;
            const sender = Nimiq.Address.fromUserFriendlyAddress($txSenderInputNimiq.value);
            const senderType = Nimiq.Account.Type.fromAny(getSelectorValue($txSenderTypeSelectorNimiq));
            const recipient = Nimiq.Address.fromUserFriendlyAddress($txRecipientInputNimiq.value);
            const recipientType = Nimiq.Account.Type.fromAny(getSelectorValue($txRecipientTypeSelectorNimiq));
            const amount = Math.round(Number.parseFloat($txAmountInputNimiq.value) * 1e5);
            const fee = Math.round(Number.parseFloat($txFeeInputNimiq.value) * 1e5);
            const validityStartHeight = Number.parseInt($txValidityStartHeightInputNimiq.value, 10);
            const network = getSelectorValue($txNetworkSelectorNimiq) as 'main' | 'test' | 'dev';
            const flags = Nimiq.Transaction.Flag.NONE // eslint-disable-line no-bitwise
                | ($txFlagContractCreationCheckboxNimiq.checked ? Nimiq.Transaction.Flag.CONTRACT_CREATION : 0);

            let extraData: InstanceType<typeof Nimiq.SerialBuffer>;
            switch (getSelectorValue($txDataUiSelectorNimiq)) {
                default:
                case DataUiType.HEX:
                    extraData = Nimiq.BufferUtils.fromHex($txDataHexInputNimiq.value);
                    break;
                case DataUiType.ASCII:
                    extraData = Nimiq.BufferUtils.fromAscii($txDataAsciiInputNimiq.value);
                    break;
                case DataUiType.HTLC_CREATION: {
                    const htlcSender = Nimiq.Address.fromUserFriendlyAddress($txDataHtlcSenderInputNimiq.value);
                    const htlcRecipient = Nimiq.Address.fromUserFriendlyAddress($txDataHtlcRecipientInputNimiq.value);
                    // @ts-expect-error: Nimiq.Hash.Algorithm.fromAny is not defined in Nimiq core types yet.
                    const hashAlgorithm = Nimiq.Hash.Algorithm.fromAny(
                        getSelectorValue($txDataHtlcAlgorithmSelectorNimiq));
                    const hashRoot = Nimiq.BufferUtils.fromHex($txDataHtlcHashRootInputNimiq.value);
                    const hashCount = Number.parseInt($txDataHtlcHashCountInputNimiq.value, 10);
                    const timeout = Number.parseInt($txDataHtlcTimeoutInputNimiq.value, 10);
                    extraData = new Nimiq.SerialBuffer(htlcSender.serializedSize + htlcRecipient.serializedSize
                        + /* hash algorithm */ 1 + hashRoot.byteLength + /* hash count */ 1 + /* timeout */ 4);
                    htlcSender.serialize(extraData);
                    htlcRecipient.serialize(extraData);
                    extraData.writeUint8(hashAlgorithm);
                    extraData.write(hashRoot);
                    extraData.writeUint8(hashCount);
                    extraData.writeUint32(timeout);
                    break;
                }
                case DataUiType.VESTING_CREATION: {
                    if (!!$txDataVestingStartInputNimiq.value !== !!$txDataVestingStepAmountInputNimiq.value) {
                        throw new Error('Optional vesting start and step amount must be either both set or both unset');
                    }
                    if ($txDataVestingTotalAmountInputNimiq.value
                        && (!$txDataVestingStartInputNimiq.value || !$txDataVestingStepAmountInputNimiq.value)) {
                        throw new Error('When specifying optional vesting total amount, vesting start and step amount'
                            + ' must be specified too.');
                    }
                    const vestingOwner = Nimiq.Address.fromUserFriendlyAddress($txDataVestingOwnerInputNimiq.value);
                    const vestingStepBlocks = Number.parseInt($txDataVestingStepBlocksInputNimiq.value, 10);
                    extraData = new Nimiq.SerialBuffer(vestingOwner.serializedSize
                        + /* vesting step blocks */ 4
                        + ($txDataVestingStartInputNimiq.value && $txDataVestingStepAmountInputNimiq.value ? 12 : 0)
                        + ($txDataVestingTotalAmountInputNimiq.value ? 8 : 0),
                    );
                    vestingOwner.serialize(extraData);
                    if ($txDataVestingStartInputNimiq.value) {
                        const vestingStart = Number.parseInt($txDataVestingStartInputNimiq.value, 10);
                        extraData.writeUint32(vestingStart);
                    }
                    extraData.writeUint32(vestingStepBlocks);
                    if ($txDataVestingStepAmountInputNimiq.value) {
                        const vestingStepAmount = Math.round(
                            Number.parseFloat($txDataVestingStepAmountInputNimiq.value) * 1e5);
                        extraData.writeUint64(vestingStepAmount);
                    }
                    if ($txDataVestingTotalAmountInputNimiq.value) {
                        const vestingTotalAmount = Math.round(
                            Number.parseFloat($txDataVestingTotalAmountInputNimiq.value) * 1e5);
                        extraData.writeUint64(vestingTotalAmount);
                    }
                    break;
                }
            }
            $txDataHexInputNimiq.value = Nimiq.BufferUtils.toHex(extraData);

            displayStatus('Signing transaction...');
            let signature: Uint8Array;
            if (api instanceof LowLevelApi) {
                const networkId = Nimiq.GenesisConfig.CONFIGS[network].NETWORK_ID;
                // Don't have to distinguish BasicTransaction and ExtendedTransaction as serialized content is the same
                const tx = new Nimiq.ExtendedTransaction(sender, senderType, recipient, recipientType, amount, fee,
                    validityStartHeight, flags, extraData, /* proof */ undefined, networkId);
                ({ signature } = await api.signTransaction(bip32Path, tx.serializeContent()));
            } else {
                const proofBytes = new Nimiq.SerialBuffer((await api.Nimiq.signTransaction(
                    {
                        sender,
                        senderType,
                        recipient,
                        recipientType,
                        value: amount,
                        fee,
                        validityStartHeight,
                        flags,
                        extraData,
                        network,
                    },
                    bip32Path,
                )).proof);
                signature = Nimiq.SignatureProof.unserialize(proofBytes).signature.serialize();
            }
            $signatureNimiq.textContent = Nimiq.BufferUtils.toHex(signature);
        } catch (error) {
            displayStatus(error);
        }
    }

    async function getAppNameAndVersionNimiq() {
        if ($noUserInteractionCheckbox.checked) await clearUserInteraction();
        try {
            $appNameNimiq.textContent = '';
            $appVersionNimiq.textContent = '';
            const api = await createApi();
            displayStatus('Getting app name and version...');
            if (!(api instanceof LowLevelApi)) throw new Error('getAppNameAndVersion not supported by HighLevelApi');
            const { name, version } = await api.getAppNameAndVersion();
            $appNameNimiq.textContent = name;
            $appVersionNimiq.textContent = version;
            displayStatus('Received app name and version');
        } catch (error) {
            displayStatus(`Failed to get app name and version: ${error}`);
            throw error;
        }
    }

    async function getWalletIdNimiq() {
        if ($noUserInteractionCheckbox.checked) await clearUserInteraction();
        try {
            $walletIdNimiq.textContent = '';
            const api = await createApi();
            displayStatus('Getting wallet id...');
            if (api instanceof LowLevelApi) throw new Error('getWalletId not supported by LowLevelApi');
            const walletId = await api.Nimiq.getWalletId();
            $walletIdNimiq.textContent = walletId;
            displayStatus('Received wallet id');
        } catch (error) {
            displayStatus(`Failed to get wallet id: ${error}`);
            throw error;
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
        } catch (error) {
            displayStatus(`Failed to get extended public key: ${error}`);
            throw error;
        }
    }

    async function signTransactionBitcoin() {
        if ($noUserInteractionCheckbox.checked) await clearUserInteraction();
        try {
            $signedTxBitcoin.textContent = '';
            const txInfo = JSON.parse($txInfoTextareaBitcoin.value);
            const api = await createApi();
            if (api instanceof LowLevelApi) throw new Error('Bitcoin not supported by LowLevelApi');
            displayStatus('Signing transaction...');
            const signedTransactionHex = await api.Bitcoin.signTransaction(txInfo);
            $signedTxBitcoin.textContent = signedTransactionHex;
            displayStatus('Signed transaction');
        } catch (error) {
            displayStatus(`Failed to sign transaction: ${error}`);
            throw error;
        }
    }

    async function signMessageBitcoin() {
        if ($noUserInteractionCheckbox.checked) await clearUserInteraction();
        try {
            $messageSignerBitcoin.textContent = '';
            $messageSignatureBitcoin.textContent = '';
            const message = $signMessageTextareaBitcoin.value;
            const bip32Path = $bip32PathSignMessageInputBitcoin.value;
            const api = await createApi();
            if (api instanceof LowLevelApi) throw new Error('Bitcoin not supported by LowLevelApi');
            displayStatus('Signing message...');
            const { signerAddress, signature } = await api.Bitcoin.signMessage(message, bip32Path);
            // verify the signature for testing purposes
            if (!verifySignedMessageBitcoin(message, signerAddress, signature)) throw new Error('Invalid signature');
            $messageSignerBitcoin.textContent = signerAddress;
            $messageSignatureBitcoin.textContent = signature;
            displayStatus('Signed message');
        } catch (error) {
            displayStatus(`Failed to sign message: ${error}`);
            throw error;
        }
    }

    async function getWalletIdBitcoin() {
        if ($noUserInteractionCheckbox.checked) await clearUserInteraction();
        try {
            $walletIdBitcoin.textContent = '';
            const api = await createApi();
            displayStatus('Getting wallet id...');
            if (api instanceof LowLevelApi) throw new Error('getWalletId not supported by LowLevelApi');
            const network = getSelectorValue($walletIdNetworkSelectorBitcoin) as Network;
            const walletId = await api.Bitcoin.getWalletId(network);
            $walletIdBitcoin.textContent = walletId;
            displayStatus('Received wallet id');
        } catch (error) {
            displayStatus(`Failed to get wallet id: ${error}`);
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
        $transportSelector.addEventListener('change', switchTransport);
        $networkEndpointInput.addEventListener('input', () => changeNetworkEndpoint());
        $networkEnpointLedgerLiveButton.addEventListener('click', () => changeNetworkEndpoint('ws://127.0.0.1:8435'));
        $networkEndpointSpeculosButton.addEventListener('click', () => changeNetworkEndpoint('ws://127.0.0.1:9999'));
        $connectButton.addEventListener('click', connect);
        $disconnectButton.addEventListener('click', disconnect);
        $highLevelApiCancelButton.addEventListener('click', cancelRequest);

        $getPublicKeyButtonNimiq.addEventListener('click', () => getPublicKeyNimiq(false));
        $confirmPublicKeyButtonNimiq.addEventListener('click', () => getPublicKeyNimiq(true));
        $getAddressButtonNimiq.addEventListener('click', () => getAddressNimiq(false));
        $confirmAddressButtonNimiq.addEventListener('click', () => getAddressNimiq(true));
        $txDataUiSelectorNimiq.addEventListener('change', () =>
            $txDataUiSelectorNimiq.className = `selector ${getSelectorValue($txDataUiSelectorNimiq)}`);
        $signTxButtonNimiq.addEventListener('click', signTransactionNimiq);
        $getAppNameAndVersionButtonNimiq.addEventListener('click', getAppNameAndVersionNimiq);
        $getWalletIdButtonNimiq.addEventListener('click', getWalletIdNimiq);

        $getAddressButtonBitcoin.addEventListener('click', () => getAddressAndPublicKeyBitcoin(false));
        $confirmAddressButtonBitcoin.addEventListener('click', () => getAddressAndPublicKeyBitcoin(true));
        $getExtendedPublicKeyButtonBitcoin.addEventListener('click', getExtendedPublicKeyBitcoin);
        $signTxButtonBitcoin.addEventListener('click', signTransactionBitcoin);
        $signMessageButtonBitcoin.addEventListener('click', signMessageBitcoin);
        $getWalletIdButtonBitcoin.addEventListener('click', getWalletIdBitcoin);

        switchApi();
        switchCoin();
        switchTransport();
    }

    init();
});
