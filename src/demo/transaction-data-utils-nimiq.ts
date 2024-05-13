import { isNimiqLegacy, type Nimiq } from '../lib/load-nimiq';
import {
    getInputElement,
    getSelectorValue,
    bufferFromHex,
    bufferFromUtf8,
    bufferFromUint32,
    bufferFromUint64,
    bufferToHex,
} from './demo-utils';

// Our built library.
// Typescript needs the import as specified to find the .d.ts file, see rollup.config.js
import { NimiqVersion } from '../../dist/high-level-api/ledger-api';

type TransactionData = { senderData?: Uint8Array | undefined, recipientData: Uint8Array | undefined };

export enum DataUiType {
    HEX = 'hex',
    TEXT = 'text',
    CREATE_HTLC = 'create-htlc',
    CREATE_VESTING = 'create-vesting',
}

const UI_TRANSACTION_DATA_TYPE_SELECTOR = `
<div id="tx-data-ui-selector-nimiq" class="selector ${DataUiType.HEX}">
    <span>Data Input</span>
    <label>
        <input type="radio" name="tx-data-ui-selector-nimiq" value="${DataUiType.HEX}" checked>
        Hex
    </label>
    <label>
        <input type="radio" name="tx-data-ui-selector-nimiq" value="${DataUiType.TEXT}">
        Text
    </label>
    <label>
        <input type="radio" name="tx-data-ui-selector-nimiq" value="${DataUiType.CREATE_HTLC}">
        Create HTLC
    </label>
    <label>
        <input type="radio" name="tx-data-ui-selector-nimiq" value="${DataUiType.CREATE_VESTING}">
        Create Vesting
    </label>
</div>`;

const UI_TRANSACTION_DATA_HEX = `
<label class="show-${DataUiType.HEX}">
    <span>Data (Hex)</span>
    <input class="nq-input" id="tx-data-hex-input-nimiq" placeholder="Optional">
</label>`;

const UI_TRANSACTION_DATA_TEXT = `
<label class="show-${DataUiType.TEXT}">
    <span>Data (Text)</span>
    <input class="nq-input" id="tx-data-text-input-nimiq" value="Hello world." placeholder="Optional">
</label>`;

const UI_TRANSACTION_DATA_CREATE_HTLC = `
<div class="show-${DataUiType.CREATE_HTLC}">
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
    <div id="tx-data-htlc-hash-algorithm-selector-nimiq" class="selector">
        <span>HTLC Hash Algorithm</span>
        <label>
            <input type="radio" name="tx-data-htlc-hash-algorithm-selector-nimiq" value="1">
            blake2b
        </label>
        <label>
            <input type="radio" name="tx-data-htlc-hash-algorithm-selector-nimiq" value="2">
            argon2d
        </label>
        <label>
            <input type="radio" name="tx-data-htlc-hash-algorithm-selector-nimiq" value="3" checked>
            sha256
        </label>
        <label>
            <input type="radio" name="tx-data-htlc-hash-algorithm-selector-nimiq" value="4">
            sha512
        </label>
    </div>
    <label>
        <span>HTLC Hash Root</span>
        <!-- Demo hash is sha256 of 0000000000000000000000000000000000000000000000000000000000000000 -->
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
        <input type="number" min="0" max="${2 ** 64 - 1}" required class="nq-input"
            id="tx-data-htlc-timeout-input-nimiq" value="12345">
    </label>
</div>`;

const UI_TRANSACTION_DATA_CREATE_VESTING = `
<div class="show-${DataUiType.CREATE_VESTING}">
    <label>
        <span>Vesting Owner</span>
        <input required class="nq-input" id="tx-data-vesting-owner-input-nimiq"
            value="NQ06 QFK9 HU4T 5LJ8 CGYG 53S4 G5LD HDGP 2G8F">
    </label>
    <label>
        <span>Vesting Start</span>
        <input type="number" min="0" max="${2 ** 64 - 1}" class="nq-input" id="tx-data-vesting-start-input-nimiq"
            placeholder="Optional, default: 0">
    </label>
    <label>
        <span>Vesting Step Time</span>
        <input type="number" min="0" max="${2 ** 64 - 1}" required class="nq-input"
            id="tx-data-vesting-step-time-input-nimiq" value="10000">
    </label>
    <label>
        <span>Vesting Step Amount</span>
        <input type="number" min="0" max="${Number.MAX_SAFE_INTEGER / 1e5}" step="0.00001" class="nq-input"
            id="tx-data-vesting-step-amount-input-nimiq" placeholder="Optional, default: Transaction Value">
    </label>
    <label>
        <span>Vesting Total Amount</span>
        <input type="number" min="0" max="${Number.MAX_SAFE_INTEGER / 1e5}" step="0.00001" class="nq-input"
            id="tx-data-vesting-total-amount-input-nimiq" placeholder="Optional, default: Transaction Value">
    </label>
</div>`;

const UI_TRANSACTION_DATA_STYLE = `
<style>
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

    #tx-data-ui-selector-nimiq:not(:has([value="${DataUiType.HEX}"]:checked)) ~ .show-${DataUiType.HEX},
    #tx-data-ui-selector-nimiq:not(:has([value="${DataUiType.TEXT}"]:checked)) ~ .show-${DataUiType.TEXT},
    #tx-data-ui-selector-nimiq:not(:has([value="${DataUiType.CREATE_HTLC}"]:checked))
        ~ .show-${DataUiType.CREATE_HTLC},
    #tx-data-ui-selector-nimiq:not(:has([value="${DataUiType.CREATE_VESTING}"]:checked))
        ~ .show-${DataUiType.CREATE_VESTING} {
        display: none;
    }
</style>`;

export const UI_TRANSACTION_DATA = [
    UI_TRANSACTION_DATA_TYPE_SELECTOR,
    UI_TRANSACTION_DATA_HEX,
    UI_TRANSACTION_DATA_TEXT,
    UI_TRANSACTION_DATA_CREATE_HTLC,
    UI_TRANSACTION_DATA_CREATE_VESTING,
    UI_TRANSACTION_DATA_STYLE,
].join('').trim();

export function getTransactionData(Nimiq: Nimiq<NimiqVersion>): TransactionData {
    const $uiTypeSelector = document.getElementById('tx-data-ui-selector-nimiq')!;
    const $hexInput = getInputElement('#tx-data-hex-input-nimiq');
    let transactionData: TransactionData;
    switch (getSelectorValue($uiTypeSelector, DataUiType)) {
        default:
        case DataUiType.HEX:
            transactionData = getTransactionDataForHex();
            break;
        case DataUiType.TEXT:
            transactionData = getTransactionDataForText();
            break;
        case DataUiType.CREATE_HTLC:
            transactionData = getTransactionDataForCreateHtlc(Nimiq);
            break;
        case DataUiType.CREATE_VESTING:
            transactionData = getTransactionDataForCreateVesting(Nimiq);
            break;
    }
    $hexInput.value = bufferToHex(transactionData.recipientData || new Uint8Array());
    return transactionData;
}

function getTransactionDataForHex(): TransactionData {
    const $hexInput = getInputElement('#tx-data-hex-input-nimiq');
    const recipientData = bufferFromHex($hexInput.value);
    return { recipientData };
}

function getTransactionDataForText(): TransactionData {
    const $textInput = getInputElement('#tx-data-text-input-nimiq');
    const recipientData = bufferFromUtf8($textInput.value);
    return { recipientData };
}

function getTransactionDataForCreateHtlc(Nimiq: Nimiq<NimiqVersion>): TransactionData {
    // For serialization format see:
    // - core-js: create or dataToPlain in src/main/generic/consensus/base/account/HashedTimeLockedContract.js
    // - core-rs-albatross: CreationTransactionData in primitives/transaction/src/account/htlc_contract.rs

    const $senderInput = getInputElement('#tx-data-htlc-sender-input-nimiq');
    const $recipientInput = getInputElement('#tx-data-htlc-recipient-input-nimiq');
    const $hashAlgorithmSelector = document.getElementById('tx-data-htlc-hash-algorithm-selector-nimiq')!;
    const $hashRootInput = getInputElement('#tx-data-htlc-hash-root-input-nimiq');
    const $hashCountInput = getInputElement('#tx-data-htlc-hash-count-input-nimiq');
    const $timeoutInput = getInputElement('#tx-data-htlc-timeout-input-nimiq');

    const nimiqVersion = isNimiqLegacy(Nimiq) ? NimiqVersion.LEGACY : NimiqVersion.ALBATROSS;
    const htlcSender = Nimiq.Address.fromUserFriendlyAddress($senderInput.value);
    const htlcRecipient = Nimiq.Address.fromUserFriendlyAddress($recipientInput.value);
    // Note that serialized, numeric values for hashAlgorithms (blake2b: 1, argon2d: 2, sha256: 3, sha512: 4) are
    // consistent between Nimiq Legacy and Nimiq Albatross, see:
    // - core-js: Hash.Algorithm in src/main/generic/consensus/base/primitive/Hash.js
    // - core-rs-albatross: Serialize for AnyHash in primitives/transaction/src/account/htlc_contract.rs
    const hashAlgorithm = getSelectorValue($hashAlgorithmSelector, [1, 2, 3, 4]);
    const hashRoot = bufferFromHex($hashRootInput.value);
    const hashCount = Number.parseInt($hashCountInput.value, 10);
    const timeout = Number.parseInt($timeoutInput.value, 10);
    const recipientData = new Uint8Array([
        ...htlcSender.serialize(),
        ...htlcRecipient.serialize(),
        hashAlgorithm,
        ...hashRoot,
        hashCount,
        ...bufferFromBlockOrTime(nimiqVersion, timeout),
    ]);
    return { recipientData };
}

function getTransactionDataForCreateVesting(Nimiq: Nimiq<NimiqVersion>): TransactionData {
    // For serialization format see:
    // - core-js: create or dataToPlain in src/main/generic/consensus/base/account/VestingContract.js
    // - core-rs-albatross: CreationTransactionData in primitives/transaction/src/account/vesting_contract.rs

    const $ownerInput = getInputElement('#tx-data-vesting-owner-input-nimiq');
    const $startInput = getInputElement('#tx-data-vesting-start-input-nimiq');
    const $stepTimeInput = getInputElement('#tx-data-vesting-step-time-input-nimiq');
    const $stepAmountInput = getInputElement('#tx-data-vesting-step-amount-input-nimiq');
    const $totalAmountInput = getInputElement('#tx-data-vesting-total-amount-input-nimiq');

    if (!!$startInput.value !== !!$stepAmountInput.value) {
        throw new Error('Optional vesting start and step amount must be either both set or both unset');
    }
    if ($totalAmountInput.value && (!$startInput.value || !$stepAmountInput.value)) {
        throw new Error('When specifying optional vesting total amount, vesting start and step amount must be '
            + 'specified too.');
    }

    const nimiqVersion = isNimiqLegacy(Nimiq) ? NimiqVersion.LEGACY : NimiqVersion.ALBATROSS;
    const vestingOwner = Nimiq.Address.fromUserFriendlyAddress($ownerInput.value);
    const vestingStepTime = Number.parseInt($stepTimeInput.value, 10);
    const recipientData = new Uint8Array([
        ...vestingOwner.serialize(),
        ...($startInput.value ? bufferFromBlockOrTime(nimiqVersion, Number.parseInt($startInput.value, 10)) : []),
        ...bufferFromBlockOrTime(nimiqVersion, vestingStepTime),
        ...($stepAmountInput.value
            ? bufferFromUint64(Math.round(Number.parseFloat($stepAmountInput.value) * 1e5))
            : []
        ),
        ...($totalAmountInput.value
            ? bufferFromUint64(Math.round(Number.parseFloat($totalAmountInput.value) * 1e5))
            : []
        ),
    ]);
    return { recipientData };
}

function bufferFromBlockOrTime(nimiqVersion: NimiqVersion, blockOrTime: number): Uint8Array {
    // In Nimiq Legacy, time in contracts is specified as a uint32 block number, while in Albatross it's an actual
    // uint64 timestamp.
    return (nimiqVersion === NimiqVersion.LEGACY ? bufferFromUint32 : bufferFromUint64)(blockOrTime);
}
