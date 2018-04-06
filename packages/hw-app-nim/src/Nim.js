/********************************************************************************
 *   Ledger Node JS API
 *   (c) 2017-2018 Ledger
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 ********************************************************************************/
//@flow

import type Transport from "@ledgerhq/hw-transport";
import {
  splitPath,
  foreach,
  encodeEd25519PublicKey,
  verifyEd25519Signature,
  checkNimiqBip32Path,
} from "./utils";

const CLA = 0xe0;
const INS_GET_PK = 0x02;
const INS_SIGN_TX = 0x04;
const INS_GET_CONF = 0x06;

const APDU_MAX_SIZE = 150;
const P1_FIRST_APDU = 0x00;
const P1_MORE_APDU = 0x80;
const P2_LAST_APDU = 0x00;
const P2_MORE_APDU = 0x80;

const SW_OK = 0x9000;
const SW_CANCEL = 0x6985;

/**
 * Nimiq API
 *
 * @example
 * import Nim from "@ledgerhq/hw-app-nim";
 * const nim = new Nim(transport)
 */
export default class Nim {
  transport: Transport<*>;

  constructor(transport: Transport<*>) {
    this.transport = transport;
    transport.decorateAppAPIMethods(
      this,
      ["getAppConfiguration", "getPublicKey", "signTransaction"],
      "w0w"
    );
  }

  getAppConfiguration(): Promise<{
    version: string
  }> {
    return this.transport.send(CLA, INS_GET_CONF, 0x00, 0x00).then(response => {
      let version = "" + response[1] + "." + response[2] + "." + response[3];
      return {
        version: version
      };
    });
  }

  /**
   * get Nimiq address for a given BIP 32 path.
   * @param path a path in BIP 32 format
   * @option boolValidate optionally enable key pair validation
   * @option boolDisplay optionally display the address on the ledger
   * @return an object with the address
   * @example
   * nim.getAddress("44'/242'/0'/0'").then(o => o.address)
   */
  getAddress(
    path: string,
    boolValidate?: boolean,
    boolDisplay?: boolean
  ): Promise<{ address: string }> {
    let pathElts = splitPath(path);
    let buffer = new Buffer(1 + pathElts.length * 4);
    buffer[0] = pathElts.length;
    pathElts.forEach((element, index) => {
      buffer.writeUInt32BE(element, 1 + 4 * index);
    });
    let verifyMsg = Buffer.from("p=np?", "ascii");
    buffer = Buffer.concat([buffer, verifyMsg]);
    return this.transport
      .send(
        CLA,
        INS_GET_PK,
        boolValidate ? 0x01 : 0x00,
        boolDisplay ? 0x01 : 0x00,
        buffer
      )
      .then(response => {
        // response = Buffer.from(response, 'hex');
        let offset = 0;
        let rawPublicKey = response.slice(offset, offset + 32);
        offset += 32;
        let address = encodeEd25519PublicKey(rawPublicKey);
        if (boolValidate) {
          let signature = response.slice(offset, offset + 64);
          if (!verifyEd25519Signature(verifyMsg, signature, rawPublicKey)) {
            throw new Error(
              "Bad signature. Keypair is invalid. Please report this."
            );
          }
        }
        return {
          address: address
        };
      });
  }

  /**
   * get Nimiq public key for a given BIP 32 path.
   * @param path a path in BIP 32 format
   * @option boolValidate optionally enable key pair validation
   * @option boolDisplay optionally display the corresponding address on the ledger
   * @return an object with the publicKey
   * @example
   * nim.getPublicKey("44'/242'/0'/0'").then(o => o.publicKey)
   */
  getPublicKey(
    path: string,
    boolValidate?: boolean,
    boolDisplay?: boolean
  ): Promise<{ publicKey: Buffer }> {
    let pathElts = splitPath(path);
    let buffer = new Buffer(1 + pathElts.length * 4);
    buffer[0] = pathElts.length;
    pathElts.forEach((element, index) => {
      buffer.writeUInt32BE(element, 1 + 4 * index);
    });
    let verifyMsg = Buffer.from("p=np?", "ascii");
    buffer = Buffer.concat([buffer, verifyMsg]);
    return this.transport
      .send(
        CLA,
        INS_GET_PK,
        boolValidate ? 0x01 : 0x00,
        boolDisplay ? 0x01 : 0x00,
        buffer
      )
      .then(response => {
        // response = Buffer.from(response, 'hex');
        let offset = 0;
        let publicKey = response.slice(offset, offset + 32);
        offset += 32;
        if (boolValidate) {
          let signature = response.slice(offset, offset + 64);
          if (!verifyEd25519Signature(verifyMsg, signature, publicKey)) {
            throw new Error(
              "Bad signature. Keypair is invalid. Please report this."
            );
          }
        }
        return {
          publicKey: publicKey
        };
      });
  }

  /**
   * sign a Nimiq transaction.
   * @param path a path in BIP 32 format
   * @param txContent transaction content in serialized form
   * @return an object with the signature and the status
   * @example
   * nim.signTransaction("44'/242'/0'/0'", signatureBase).then(o => o.signature)
   */
  signTransaction(
    path: string,
    txContent: Uint8Array
  ): Promise<{ signature: Buffer }> {
    checkNimiqBip32Path(path);

    let apdus = [];
    let response;

    let pathElts = splitPath(path);
    let bufferSize = 1 + pathElts.length * 4;
    let buffer = Buffer.alloc(bufferSize);
    buffer[0] = pathElts.length;
    pathElts.forEach(function(element, index) {
      buffer.writeUInt32BE(element, 1 + 4 * index);
    });
    let transaction = Buffer.from(txContent);
    let chunkSize = APDU_MAX_SIZE - bufferSize;
    if (transaction.length <= chunkSize) {
      // it fits in a single apdu
      apdus.push(Buffer.concat([buffer, transaction]));
    } else {
      // we need to send multiple apdus to transmit the entire transaction
      let chunk = Buffer.alloc(chunkSize);
      let offset = 0;
      transaction.copy(chunk, 0, offset, chunkSize);
      apdus.push(Buffer.concat([buffer, chunk]));
      offset += chunkSize;
      while (offset < transaction.length) {
        let remaining = transaction.length - offset;
        chunkSize = remaining < APDU_MAX_SIZE ? remaining : APDU_MAX_SIZE;
        chunk = Buffer.alloc(chunkSize);
        transaction.copy(chunk, 0, offset, offset + chunkSize);
        offset += chunkSize;
        apdus.push(chunk);
      }
    }
    return foreach(apdus, (data, i) =>
      this.transport
        .send(
          CLA,
          INS_SIGN_TX,
          i === 0 ? P1_FIRST_APDU : P1_MORE_APDU,
          i === apdus.length - 1 ? P2_LAST_APDU : P2_MORE_APDU,
          data,
          [SW_OK, SW_CANCEL]
        )
        .then(apduResponse => {
          response = apduResponse;
        })
    ).then(() => {
      let status = Buffer.from(
        response.slice(response.length - 2)
      ).readUInt16BE(0);
      if (status === SW_OK) {
        let signature = Buffer.from(response.slice(0, response.length - 2));
        return {
          signature: signature
        };
      } else {
        throw new Error("Transaction approval request was rejected");
      }
    });
  }
}
