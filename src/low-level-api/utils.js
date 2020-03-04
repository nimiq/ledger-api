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

import base32 from "base32.js";
import nacl from "tweetnacl";
const blake = require("blakejs");

// TODO use bip32-path library
export function splitPath(path: string): number[] {
  let result = [];
  let components = path.split("/");
  components.forEach(element => {
    let number = parseInt(element, 10);
    if (isNaN(number)) {
      return; // FIXME shouldn't it throws instead?
    }
    if (element.length > 1 && element[element.length - 1] === "'") {
      number += 0x80000000;
    }
    result.push(number);
  });
  return result;
}

export function foreach<T, A>(
  arr: T[],
  callback: (T, number) => Promise<A>
): Promise<A[]> {
  function iterate(index, array, result) {
    if (index >= array.length) {
      return result;
    } else {
      return callback(array[index], index).then(function(res) {
        result.push(res);
        return iterate(index + 1, array, result);
      });
    }
  }
  return Promise.resolve().then(() => iterate(0, arr, []));
}

export function encodeEd25519PublicKey(rawPublicKey: Buffer): string {
  function _ibanCheck(str: string): number {
    const num: string = str.split("").map((c: string) => {
      const code: number = c.toUpperCase().charCodeAt(0);
      return code >= 48 && code <= 57 ? c : (code - 55).toString();
    }).join("");
    let tmp: string = "";

    for (let i = 0; i < Math.ceil(num.length / 6); i++) {
      tmp = (parseInt(tmp + num.substr(i * 6, 6)) % 97).toString();
    }
    return parseInt(tmp);
  }
  const hash: Uint8Array = blake.blake2b(rawPublicKey, undefined, 32).subarray(0, 20);
  const base32enconded: string = base32.encode(hash, { type: "crockford", alphabet: "0123456789ABCDEFGHJKLMNPQRSTUVXY" });
  const check: string = ("00" + (98 - _ibanCheck(base32enconded + "NQ" + "00"))).slice(-2);
  let res: string = "NQ" + check + base32enconded;
  res = res.replace(/.{4}/g, "$& ").trim();
  return res;
}

export function verifyEd25519Signature(
  data: Buffer,
  signature: Buffer,
  publicKey: Buffer
): boolean {
  return nacl.sign.detached.verify(
    new Uint8Array(data.toJSON().data),
    new Uint8Array(signature.toJSON().data),
    new Uint8Array(publicKey.toJSON().data)
  );
}

export function checkNimiqBip32Path(path: string): void {
  if (!path.startsWith("44'/242'")) {
    throw new Error(
      "Not a Nimiq BIP32 path. Path: " +
      path +
      "." +
      " The Nimiq app is authorized only for paths starting with 44'/242'." +
      " Example: 44'/242'/0'/0'"
    );
  }
  path.split("/").forEach(function(element) {
    if (!element.toString().endsWith("'")) {
      throw new Error(
        "Detected a non-hardened path element in requested BIP32 path." +
        " Non-hardended paths are not supported at this time. Please use an all-hardened path." +
        " Example: 44'/242'/0'/0'"
      );
    }
  });
}
