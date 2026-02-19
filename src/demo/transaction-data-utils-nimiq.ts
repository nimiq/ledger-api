import { isNimiqLegacy, type Nimiq, type NimiqPrimitive } from '../lib/load-nimiq';
import {
    bufferFromHex,
    bufferFromUtf8,
    bufferFromUint32,
    bufferFromUint64,
    bufferToHex,
    areBuffersEqual,
} from '../lib/buffer-utils';
import { getInputElement, getSelectorValue, logInputs } from './demo-utils';

// Our built library.
// Typescript needs the import as specified to find the .d.ts file, see rollup.config.js
import { NimiqVersion } from '../../dist/high-level-api/ledger-api';

type TransactionData = { senderData?: Uint8Array, recipientData?: Uint8Array };

export enum DataUiType {
    HEX = 'hex',
    TEXT = 'text',
    CREATE_HTLC = 'create-htlc',
    CREATE_VESTING = 'create-vesting',
    CREATE_STAKER = 'create-staker',
    ADD_STAKE = 'add-stake',
    UPDATE_STAKER = 'update-staker',
    SET_ACTIVE_STAKE = 'set-active-stake',
    RETIRE_STAKE = 'retire-stake',
    REMOVE_STAKE = 'remove-stake',
}

const UI_TRANSACTION_DATA_TYPE_SELECTOR = `
<div id="tx-data-ui-selector-nimiq" class="selector ${DataUiType.HEX}">
    <span>Data Input</span>
    <div style="display: flex; flex-wrap: wrap">
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
        <label class="show-${NimiqVersion.ALBATROSS}">
            <input type="radio" name="tx-data-ui-selector-nimiq" value="${DataUiType.CREATE_STAKER}">
            Create Staker
        </label>
        <label class="show-${NimiqVersion.ALBATROSS}">
            <input type="radio" name="tx-data-ui-selector-nimiq" value="${DataUiType.ADD_STAKE}">
            Add Stake
        </label>
        <label class="show-${NimiqVersion.ALBATROSS}">
            <input type="radio" name="tx-data-ui-selector-nimiq" value="${DataUiType.UPDATE_STAKER}">
            Update Staker
        </label>
        <label class="show-${NimiqVersion.ALBATROSS}">
            <input type="radio" name="tx-data-ui-selector-nimiq" value="${DataUiType.SET_ACTIVE_STAKE}">
            Set Active Stake
        </label>
        <label class="show-${NimiqVersion.ALBATROSS}">
            <input type="radio" name="tx-data-ui-selector-nimiq" value="${DataUiType.RETIRE_STAKE}">
            Retire Stake
        </label>
        <label class="show-${NimiqVersion.ALBATROSS}">
            <input type="radio" name="tx-data-ui-selector-nimiq" value="${DataUiType.REMOVE_STAKE}">
            Remove Stake
        </label>
    </div>
</div>`;

const UI_TRANSACTION_DATA_VALIDITY_HINT = `
<div class="info show-${DataUiType.CREATE_HTLC} show-${DataUiType.CREATE_VESTING}">
    <!-- Contract creation transaction -->
    A valid transaction must have the contract creation address as recipient, recipient type
    <span class="show-${DataUiType.CREATE_HTLC}">HTLC</span>
    <span class="show-${DataUiType.CREATE_VESTING}">Vesting</span>
    and the contract creation flag.
</div>
<div class="info show-${DataUiType.CREATE_STAKER} show-${DataUiType.ADD_STAKE}">
    <!-- Non-signaling transaction to staking contract -->
    A valid transaction must have the staking contract address as recipient and recipient type Staking.
</div>
<div class="info show-${DataUiType.UPDATE_STAKER} show-${DataUiType.SET_ACTIVE_STAKE} show-${DataUiType.RETIRE_STAKE}">
    <!-- Signaling transaction to staking contract -->
    A valid transaction must have the staking contract address as recipient, recipient type Staking, the signaling flag,
    and amount 0.
</div>
<div class="info show-${DataUiType.REMOVE_STAKE}">
    <!-- Transaction from staking contract -->
    A valid transaction must have the staking contract address as sender and sender type Staking.
</div>`;

const UI_TRANSACTION_DATA_HEX = `
<div class="show-${DataUiType.HEX}">
    <label>
        <span>Sender Data (Hex)</span>
        <input class="nq-input" id="tx-data-sender-hex-input-nimiq" placeholder="Optional">
    </label>
    <label>
        <span>Recipient Data (Hex)</span>
        <input class="nq-input" id="tx-data-recipient-hex-input-nimiq" placeholder="Optional">
    </label>
</div>`;

const UI_TRANSACTION_DATA_TEXT = `
<div class="show-${DataUiType.TEXT}">
    <label>
        <span>Sender Data (Text)</span>
        <input class="nq-input" id="tx-data-sender-text-input-nimiq" placeholder="Optional">
    </label>
    <label>
        <span>Recipient Data (Text)</span>
        <input class="nq-input" id="tx-data-recipient-text-input-nimiq" value="Hello world." placeholder="Optional">
    </label>
</div>`;

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

const UI_TRANSACTION_DATA_CREATE_STAKER = `
<div class="show-${DataUiType.CREATE_STAKER}">
    <label>
        <span>Delegation Address</span>
        <input class="nq-input" id="tx-data-create-staker-delegation-input-nimiq" placeholder="Optional">
    </label>
    <label>
        <span>Staker Signature Proof</span>
        <input class="nq-input" id="tx-data-create-staker-signature-proof-input-nimiq"
            placeholder="By default signed by the Ledger app with sender address as staker address">
    </label>
</div>`;

const UI_TRANSACTION_DATA_ADD_STAKE = `
<div class="show-${DataUiType.ADD_STAKE}">
    <label>
        <span>Staker Address</span>
        <input required class="nq-input" id="tx-data-add-stake-staker-input-nimiq"
            value="NQ06 QFK9 HU4T 5LJ8 CGYG 53S4 G5LD HDGP 2G8F">
    </label>
</div>`;

const UI_TRANSACTION_DATA_UPDATE_STAKER = `
<div class="show-${DataUiType.UPDATE_STAKER}">
    <label>
        <span>New Delegation Address</span>
        <input class="nq-input" id="tx-data-update-staker-new-delegation-input-nimiq" placeholder="Optional">
    </label>
    <div id="tx-data-update-staker-reactivate-all-stake-selector-nimiq" class="selector">
        <span>Reactivate all stake</span>
        <label>
            <input type="radio" name="tx-data-update-staker-reactivate-all-stake-selector-nimiq" value="true"
                checked>
            Yes
        </label>
        <label>
            <input type="radio" name="tx-data-update-staker-reactivate-all-stake-selector-nimiq" value="false">
            No
        </label>
    </div>
    <label>
        <span>Staker Signature Proof</span>
        <input class="nq-input" id="tx-data-update-staker-signature-proof-input-nimiq"
            placeholder="By default signed by the Ledger app with sender address as staker address">
    </label>
</div>`;

const UI_TRANSACTION_DATA_SET_ACTIVE_STAKE_OR_RETIRE_STAKE = `
<div class="show-${DataUiType.SET_ACTIVE_STAKE} show-${DataUiType.RETIRE_STAKE}">
    <label>
        <span class="show-${DataUiType.SET_ACTIVE_STAKE}">New Active Balance</span>
        <span class="show-${DataUiType.RETIRE_STAKE}">Retire Stake Amount</span>
        <input type="number" min="0" max="${Number.MAX_SAFE_INTEGER / 1e5}" step="0.00001" required class="nq-input"
            id="tx-data-set-active-stake-or-retire-stake-amount-input-nimiq" value="100">
    </label>
    <label>
        <span>Staker Signature Proof</span>
        <input class="nq-input" id="tx-data-set-active-stake-or-retire-stake-signature-proof-input-nimiq"
            placeholder="By default signed by the Ledger app with sender address as staker address">
    </label>
</div>`;

const UI_TRANSACTION_DATA_REMOVE_STAKE = `
<div class="info show-${DataUiType.REMOVE_STAKE}">
    (There are no additional data parameters to set for Remove Stake data.)
</div>`;

/* eslint-disable @typescript-eslint/indent */
const UI_TRANSACTION_DATA_STYLE = `
<style>
    #tx-ui-nimiq .selector,
    #tx-ui-nimiq > label,
    #tx-ui-nimiq > :not(.selector) > label {
        display: flex;
        min-height: 5rem;
        margin-bottom: 1.5rem;
        align-items: center;
    }

    #tx-ui-nimiq label > span,
    #tx-ui-nimiq .selector > span:first-child {
        min-width: 20rem;
        max-width: 20rem;
        margin-right: .5rem;
    }
    
    #tx-ui-nimiq > .info {
        margin-left: 21rem; /* width + margin-right of left column in rule above + margin of radio buttons */
        margin-bottom: 2rem;
    }

    #tx-ui-nimiq .nq-input {
        margin-right: 0;
        flex-grow: 1;
    }

    /* hide elements which have one or more .show-{uiType} classes, but none of the classes corresponds to the ui type
    of the selector's checked radio button */
    :is(${
        Object.values(DataUiType).map((uiType) => `.show-${uiType}`).join(', ')
    }):not(${
        Object.values(DataUiType)
            .flatMap((uiType) => {
                const siblingPrefix = `#tx-data-ui-selector-nimiq:has([value="${uiType}"]:checked) ~`;
                return [`${siblingPrefix} .show-${uiType}`, `${siblingPrefix} * .show-${uiType}`];
            })
            .join(', ')
    }) {
        display: none;
    }
</style>`;
/* eslint-enable @typescript-eslint/indent */

export const UI_TRANSACTION_DATA = [
    UI_TRANSACTION_DATA_TYPE_SELECTOR,
    UI_TRANSACTION_DATA_VALIDITY_HINT,
    UI_TRANSACTION_DATA_HEX,
    UI_TRANSACTION_DATA_TEXT,
    UI_TRANSACTION_DATA_CREATE_HTLC,
    UI_TRANSACTION_DATA_CREATE_VESTING,
    UI_TRANSACTION_DATA_CREATE_STAKER,
    UI_TRANSACTION_DATA_ADD_STAKE,
    UI_TRANSACTION_DATA_UPDATE_STAKER,
    UI_TRANSACTION_DATA_SET_ACTIVE_STAKE_OR_RETIRE_STAKE,
    UI_TRANSACTION_DATA_REMOVE_STAKE,
    UI_TRANSACTION_DATA_STYLE,
].join('').trim();

export function resetTransactionDataUiTypeSelector() {
    const $uiTypeSelector = document.getElementById('tx-data-ui-selector-nimiq')!;
    getInputElement(`[value=${DataUiType.HEX}]`, $uiTypeSelector).checked = true;
}

export function getTransactionData(Nimiq: Nimiq<NimiqVersion>): TransactionData {
    const $uiTypeSelector = document.getElementById('tx-data-ui-selector-nimiq')!;
    const $senderDataHexInput = getInputElement('#tx-data-sender-hex-input-nimiq');
    const $recipientDataHexInput = getInputElement('#tx-data-recipient-hex-input-nimiq');
    let transactionData: TransactionData;
    const uiType = getSelectorValue($uiTypeSelector, DataUiType);
    switch (uiType) {
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
        case DataUiType.CREATE_STAKER:
            transactionData = getTransactionDataForCreateStaker(Nimiq);
            break;
        case DataUiType.ADD_STAKE:
            transactionData = getTransactionDataForAddStake(Nimiq);
            break;
        case DataUiType.UPDATE_STAKER:
            transactionData = getTransactionDataForUpdateStaker(Nimiq);
            break;
        case DataUiType.SET_ACTIVE_STAKE:
        case DataUiType.RETIRE_STAKE:
            transactionData = getTransactionDataForSetActiveStakeOrRetireStake(Nimiq, uiType);
            break;
        case DataUiType.REMOVE_STAKE:
            transactionData = getTransactionDataForRemoveStake(Nimiq);
            break;
    }
    $senderDataHexInput.value = bufferToHex(transactionData.senderData || new Uint8Array());
    $recipientDataHexInput.value = bufferToHex(transactionData.recipientData || new Uint8Array());
    return transactionData;
}

function getTransactionDataForHex(): TransactionData {
    const $senderDataHexInput = getInputElement('#tx-data-sender-hex-input-nimiq');
    const $recipientDataHexInput = getInputElement('#tx-data-recipient-hex-input-nimiq');
    logInputs('Transaction Data (Hex)', { $senderDataHexInput, $recipientDataHexInput });
    const senderData = bufferFromHex($senderDataHexInput.value);
    const recipientData = bufferFromHex($recipientDataHexInput.value);
    return { senderData, recipientData };
}

function getTransactionDataForText(): TransactionData {
    const $senderDataTextInput = getInputElement('#tx-data-sender-text-input-nimiq');
    const $recipientDataTextInput = getInputElement('#tx-data-recipient-text-input-nimiq');
    logInputs('Transaction Data (Text)', { $senderDataTextInput, $recipientDataTextInput });
    const senderData = bufferFromUtf8($senderDataTextInput.value);
    const recipientData = bufferFromUtf8($recipientDataTextInput.value);
    return { senderData, recipientData };
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
    logInputs('Transaction Data (Create HTLC)', { $senderInput, $recipientInput, $hashAlgorithmSelector,
        $hashRootInput, $hashCountInput, $timeoutInput });

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
    logInputs('Transaction Data (Create Vesting)', { $ownerInput, $startInput, $stepTimeInput, $stepAmountInput,
        $totalAmountInput });

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

// Staking transactions
// They have been introduced / are only supported for Albatross, i.e. core-rs-albatross. For serialization format see:
// - IncomingStakingTransactionData in primitives/transaction/src/account/staking_contract/structs.rs for recipient
// - OutgoingStakingTransactionData in primitives/transaction/src/account/staking_contract/structs.rs for sender
// - rust types supported by serde: https://serde.rs/data-model.html#types
// - which are serialized to bytes in postcard format: https://postcard.jamesmunns.com/wire-format.html, see data() in
//   transaction-builder/src/recipient/mod.rs and used serialize_to_vec

// Recipient data type for incoming transactions to the staking contract.
enum IncomingStakingTransactionDataType {
    CREATE_VALIDATOR,
    UPDATE_VALIDATOR,
    DEACTIVATE_VALIDATOR,
    REACTIVATE_VALIDATOR,
    RETIRE_VALIDATOR,
    CREATE_STAKER,
    ADD_STAKE,
    UPDATE_STAKER,
    SET_ACTIVE_STAKE,
    RETIRE_STAKE,
}
// Sender data type for outgoing transactions from the staking contract.
enum OutgoingStakingTransactionDataType {
    DELETE_VALIDATOR,
    REMOVE_STAKE,
}

// See Default for SignatureProof and Serialize for SignatureProof in primitives/transaction/src/signature_proof.rs
// The staking transactions that include a signature proof in the transaction data are double signed, once by the staker
// or validator, and once by the account sending the funds or paying the fee, which can be the same. The staker or
// validator signature proof is based on the transaction with the dummy, default signature in the transaction data,
// whereas the sending account signs the final transaction with the staker's / validator's signature proof in the data.
const STAKING_DEFAULT_SIGNATURE_PROOF = new Uint8Array([
    0, // type field (algorithm and flags), by default Ed25519 (PublicKey enum value 0) and no flags set
    ...new Uint8Array(32), // Ed25519PublicKey filled with 0s, see Default and Serialize in keys/src/public_key.rs
    0, // Empty merkle path only encoding u8 length, see Default and Serialize for MerklePath in utils/src/merkle/mod.rs
    ...new Uint8Array(64), // Ed25519Signature filled with 0s, see Default and Serialize in keys/src/signature.rs
    // No serialized webauthn fields as the algorithm defaults to ed25519.
]);

function getTransactionDataForCreateStaker(Nimiq: Nimiq<NimiqVersion>): TransactionData {
    if (isNimiqLegacy(Nimiq)) throw new Error('Staking transactions are only supported for Albatross.');

    const $delegationInput = getInputElement('#tx-data-create-staker-delegation-input-nimiq');
    const $signatureProofInput = getInputElement('#tx-data-create-staker-signature-proof-input-nimiq');
    logInputs('Transaction Data (Create Staker)', { $delegationInput, $signatureProofInput });

    const delegation = $delegationInput.value ? Nimiq.Address.fromUserFriendlyAddress($delegationInput.value) : null;
    const customSignatureProof = bufferFromHex($signatureProofInput.value); // staker signature proof
    const recipientData = new Uint8Array([
        IncomingStakingTransactionDataType.CREATE_STAKER,
        ...(delegation ? [1, ...delegation.serialize()] : [0]),
        ...(customSignatureProof.length ? customSignatureProof : STAKING_DEFAULT_SIGNATURE_PROOF),
    ]);

    if (delegation) {
        checkSerialization(Nimiq, { recipientData, customSignatureProof }, 'CreateStaker', delegation);
    }

    return { recipientData };
}

function getTransactionDataForAddStake(Nimiq: Nimiq<NimiqVersion>): TransactionData {
    if (isNimiqLegacy(Nimiq)) throw new Error('Staking transactions are only supported for Albatross.');

    const $stakerInput = getInputElement('#tx-data-add-stake-staker-input-nimiq');
    logInputs('Transaction Data (Add Stake)', { $stakerInput });

    const staker = Nimiq.Address.fromUserFriendlyAddress($stakerInput.value);
    const recipientData = new Uint8Array([
        IncomingStakingTransactionDataType.ADD_STAKE,
        ...staker.serialize(),
    ]);
    checkSerialization(Nimiq, { recipientData }, 'AddStake', staker);

    return { recipientData };
}

function getTransactionDataForUpdateStaker(Nimiq: Nimiq<NimiqVersion>): TransactionData {
    if (isNimiqLegacy(Nimiq)) throw new Error('Staking transactions are only supported for Albatross.');

    const $newDelegationInput = getInputElement('#tx-data-update-staker-new-delegation-input-nimiq');
    const $reactivateAllStakeSelector = document.getElementById(
        'tx-data-update-staker-reactivate-all-stake-selector-nimiq')!;
    const $signatureProofInput = getInputElement('#tx-data-update-staker-signature-proof-input-nimiq');
    logInputs('Transaction Data (Update Staker)', { $newDelegationInput, $reactivateAllStakeSelector,
        $signatureProofInput });

    const newDelegation = $newDelegationInput.value
        ? Nimiq.Address.fromUserFriendlyAddress($newDelegationInput.value)
        : null;
    const reactivateAllStake = getSelectorValue($reactivateAllStakeSelector, ['true', 'false']) === 'true';
    const customSignatureProof = bufferFromHex($signatureProofInput.value); // staker signature proof
    const recipientData = new Uint8Array([
        IncomingStakingTransactionDataType.UPDATE_STAKER,
        ...(newDelegation ? [1, ...newDelegation.serialize()] : [0]),
        reactivateAllStake ? 1 : 0,
        ...(customSignatureProof.length ? customSignatureProof : STAKING_DEFAULT_SIGNATURE_PROOF),
    ]);

    if (newDelegation) {
        checkSerialization(Nimiq, { recipientData, customSignatureProof }, 'UpdateStaker', newDelegation,
            reactivateAllStake);
    }

    return { recipientData };
}

function getTransactionDataForSetActiveStakeOrRetireStake(Nimiq: Nimiq<NimiqVersion>, uiType: DataUiType)
    : TransactionData {
    if (isNimiqLegacy(Nimiq)) throw new Error('Staking transactions are only supported for Albatross.');

    const $amountInput = getInputElement('#tx-data-set-active-stake-or-retire-stake-amount-input-nimiq');
    const $signatureProofInput = getInputElement(
        '#tx-data-set-active-stake-or-retire-stake-signature-proof-input-nimiq');
    logInputs(`Transaction Data (${uiType === DataUiType.SET_ACTIVE_STAKE ? 'Set Active' : 'Retire'} Stake)`,
        { $amountInput, $signatureProofInput });

    const amount = BigInt(Math.round(Number.parseFloat($amountInput.value) * 1e5));
    const customSignatureProof = bufferFromHex($signatureProofInput.value); // staker signature proof
    const recipientData = new Uint8Array([
        uiType === DataUiType.SET_ACTIVE_STAKE
            ? IncomingStakingTransactionDataType.SET_ACTIVE_STAKE
            : IncomingStakingTransactionDataType.RETIRE_STAKE,
        ...bufferFromUint64(amount),
        ...(customSignatureProof.length ? customSignatureProof : STAKING_DEFAULT_SIGNATURE_PROOF),
    ]);
    const transactionBuilderType = uiType === DataUiType.SET_ACTIVE_STAKE ? 'SetActiveStake' : 'RetireStake';
    checkSerialization(Nimiq, { recipientData, customSignatureProof }, transactionBuilderType, amount);

    return { recipientData };
}

function getTransactionDataForRemoveStake(Nimiq: Nimiq<NimiqVersion>): TransactionData {
    if (isNimiqLegacy(Nimiq)) throw new Error('Staking transactions are only supported for Albatross.');

    logInputs('Transaction Data (Remove Stake)', {});

    const senderData = new Uint8Array([OutgoingStakingTransactionDataType.REMOVE_STAKE]);
    checkSerialization(Nimiq, { senderData }, 'RemoveStake');

    return { senderData };
}

type TrimTransactionBuilderMethod<M extends string> = M extends `new${infer B}` ? B : never; // trim new in method name
type TransactionBuilderType = TrimTransactionBuilderMethod<keyof Nimiq<NimiqVersion.ALBATROSS>['TransactionBuilder']>;
const TRANSACTION_BUILDERS_EXPECTING_AMOUNT = ['Basic', 'BasicWithData', 'CreateStaker', 'AddStake', 'RemoveStake'] as
    const satisfies readonly TransactionBuilderType[];
type TransactionBuilderExpectingAmount = (typeof TRANSACTION_BUILDERS_EXPECTING_AMOUNT)[number];
type TransactionBuilderDataParameters<B extends TransactionBuilderType> =
    // Exclude common transaction builder parameters that don't affect sender or recipient data.
    Parameters<Nimiq<NimiqVersion.ALBATROSS>['TransactionBuilder'][`new${B}`]> extends [
        NimiqPrimitive<'Address', NimiqVersion.ALBATROSS>, // sender or recipient
        ...infer P,
        ...(B extends TransactionBuilderExpectingAmount ? [bigint] : []), // amount
        bigint | undefined, // fee
        number, // validity start height
        number, // network id
    ] ? P : never;
function checkSerialization<B extends TransactionBuilderType>(
    Nimiq: Nimiq<NimiqVersion.ALBATROSS>,
    { senderData, recipientData, customSignatureProof }: {
        senderData?: Uint8Array,
        recipientData?: Uint8Array,
        customSignatureProof?: Uint8Array,
    },
    builderType: B,
    ...builderParams: TransactionBuilderDataParameters<B>
): void {
    // If possible, compare our serialized data to reference data created by TransactionBuilder to check for correctness
    // of our serialization implementation.
    if (customSignatureProof?.length) return; // The reference data is created with the default signature proof
    // @ts-expect-error: ts doesn't know which specific builder we're calling
    const referenceTransaction = Nimiq.TransactionBuilder[`new${builderType}`].apply(undefined, [
        new Nimiq.Address(new Uint8Array(20)), // sender or recipient
        ...builderParams,
        ...(TRANSACTION_BUILDERS_EXPECTING_AMOUNT.some((b) => builderType === b) ? [1n] : []), // amount
        undefined, // fee
        0, // validity start height
        24, // network id
    ]);
    if (!areBuffersEqual(referenceTransaction.senderData, senderData || new Uint8Array())
        || !areBuffersEqual(referenceTransaction.data, recipientData || new Uint8Array())) {
        throw new Error('Incorrect serialization');
    }
}

function bufferFromBlockOrTime(nimiqVersion: NimiqVersion, blockOrTime: number): Uint8Array {
    // In Nimiq Legacy, time in contracts is specified as a uint32 block number, while in Albatross it's an actual
    // uint64 timestamp.
    return (nimiqVersion === NimiqVersion.LEGACY ? bufferFromUint32 : bufferFromUint64)(blockOrTime);
}
