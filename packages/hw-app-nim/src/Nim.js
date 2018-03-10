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
  encodeEd25519PublicKey,
  verifyEd25519Signature,
} from "./utils";

const CLA = 0xe0;
const INS_GET_PK = 0x02;
const INS_GET_CONF = 0x06;

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
   * get Nimiq public key for a given BIP 32 path.
   * @param path a path in BIP 32 format
   * @option boolValidate optionally enable key pair validation
   * @option boolDisplay optionally enable or not the display
   * @return an object with the publicKey
   * @example
   * nim.getPublicKey("44'/242'/0'").then(o => o.publicKey)
   */
  getPublicKey(
    path: string,
    boolValidate?: boolean,
    boolDisplay?: boolean
  ): Promise<{ publicKey: string }> {
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
        let publicKey = encodeEd25519PublicKey(rawPublicKey);
        if (boolValidate) {
          let signature = response.slice(offset, offset + 64);
          if (!verifyEd25519Signature(verifyMsg, signature, rawPublicKey)) {
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
}
