window.addEventListener('load', () => {
    document.body.innerHTML = `
        <h1 class="nq-h1">Nimiq Ledger Api Demos</h1>

        <section class="nq-text">
            Status: <span id="status" class="mono"></span>
        </section>
        
        <section class="nq-text">
            <button class="nq-button-s" id="connect-button" disabled>Connect</button>
        </section>

        <section class="nq-text nq-card">
            <h2 class="nq-card-header nq-h2">Get Public Key</h2>
            <div class="nq-card-body">
                <input class="nq-input" id="bip32-path-public-key-input" value="44'/242'/0'/0'" disabled>
                <button class="nq-button-s" id="get-public-key-button" disabled>Get Public Key</button>
                <button class="nq-button-s" id="confirm-public-key-button" disabled>Confirm Public Key</button>
                <br>
                <div class="nq-text">Public Key: <span id="public-key" class="mono"></span></div>
            </div>
        </section>

        <section class="nq-text nq-card">
            <h2 class="nq-card-header nq-h2">Get Address</h2>
            <div class="nq-card-body">
                <input class="nq-input" id="bip32-path-address-input" value="44'/242'/0'/0'" disabled>
                <button class="nq-button-s" id="get-address-button" disabled>Get Address</button>
                <button class="nq-button-s" id="confirm-address-button" disabled>Confirm Address</button>
                <br>
                <div class="nq-text">Address: <span id="address" class="mono"></span></div>
            </div>
        </section>

        <section class="nq-text nq-card">
            <h2 class="nq-card-header nq-h2">Sign Transaction</h2>
            <div class="nq-card-body">
                <div class="nq-text">Fill the input with a hex transaction that belongs to your address.</div>
                <input class="nq-input" id="tx-hex-input" value="0000573dbdf6a7d83925ecf0ba0022a9a86c9be3c081008626c5378734e05d71cb4034eb97741909764e6e0000000000000f4240000000000000000a00000e790200">
                <button class="nq-button-s" id="sign-tx-button" disabled>Sign</button>
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
            }
        </style>
    `;

    const $status = document.getElementById('status')!;
    const $connectButton = document.getElementById('connect-button')!;
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
});
