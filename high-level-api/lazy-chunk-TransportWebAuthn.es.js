import { B as Buffer } from './lazy-chunk-buffer.es.js';
import { c as createCommonjsModule, u as unwrapExports, l as lib, i as index_cjs, T as Transport } from './lazy-chunk-index.es.js';

var scrambling = createCommonjsModule(function (module, exports) {

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.wrapApdu = wrapApdu;

function wrapApdu(apdu, key) {
  if (apdu.length === 0) return apdu;
  const result = Buffer.alloc(apdu.length);

  for (let i = 0; i < apdu.length; i++) {
    result[i] = apdu[i] ^ key[i % key.length];
  }

  return result;
}

});

unwrapExports(scrambling);
var scrambling_1 = scrambling.wrapApdu;

var TransportWebAuthn_1 = createCommonjsModule(function (module, exports) {

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _hwTransport = _interopRequireDefault(Transport);







function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const attemptExchange = (apdu, timeout, scrambleKey) => {
  if (!scrambleKey) {
    throw new index_cjs.TransportError("transport.setScrambleKey must be used to set a scramble key. Refer to documentation.", "NoScrambleKey");
  }

  if (!navigator.credentials) {
    throw new index_cjs.TransportError("WebAuthn not supported", "NotSupported");
  }

  return navigator.credentials // $FlowFixMe
  .get({
    publicKey: {
      timeout,
      challenge: new Uint8Array(32),
      allowCredentials: [{
        type: "public-key",
        id: new Uint8Array((0, scrambling.wrapApdu)(apdu, scrambleKey))
      }]
    }
  }) // $FlowFixMe
  .then(r => Buffer.from(r.response.signature));
};
/**
 * WebAuthn Transport implementation
 * @example
 * import TransportWebAuthn from "@ledgerhq/hw-transport-webauthn";
 * ...
 * TransportWebAuthn.create().then(transport => ...)
 */


class TransportWebAuthn extends _hwTransport.default {
  constructor(...args) {
    super(...args);
    this.scrambleKey = void 0;
  }

  static async open() {
    return new TransportWebAuthn();
  }
  /**
   * Exchange with the device using APDU protocol.
   * @param apdu
   * @returns a promise of apdu response
   */


  async exchange(apdu) {
    (0, lib.log)("apdu", "=> " + apdu.toString("hex"));
    const res = await attemptExchange(apdu, this.exchangeTimeout, this.scrambleKey);
    (0, lib.log)("apdu", "<= " + res.toString("hex"));
    return res;
  }
  /**
   * A scramble key is a string that xor the data exchanged.
   * It depends on the device app you need to exchange with.
   * For instance it can be "BTC" for the bitcoin app, "B0L0S" for the dashboard.
   *
   * @example
   * transport.setScrambleKey("B0L0S")
   */


  setScrambleKey(scrambleKey) {
    this.scrambleKey = Buffer.from(scrambleKey, "ascii");
  }

  close() {
    return Promise.resolve();
  }

}

exports.default = TransportWebAuthn;

TransportWebAuthn.isSupported = () => Promise.resolve(!!navigator.credentials);

TransportWebAuthn.list = () => navigator.credentials ? [null] : [];

TransportWebAuthn.listen = observer => {
  setTimeout(() => {
    if (!navigator.credentials) {
      observer.error(new index_cjs.TransportError("WebAuthn not supported", "NotSupported"));
      return {
        unsubscribe: () => {}
      };
    }

    observer.next({
      type: "add",
      descriptor: null
    });
    observer.complete();
  }, 0);
  return {
    unsubscribe: () => {}
  };
};

});

var TransportWebAuthn = unwrapExports(TransportWebAuthn_1);

export default TransportWebAuthn;
export { TransportWebAuthn_1 as __moduleExports };
//# sourceMappingURL=lazy-chunk-TransportWebAuthn.es.js.map
