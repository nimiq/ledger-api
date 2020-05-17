import { B as Buffer } from './lazy-chunk-buffer.es.js';
import { u as unwrapExports, c as createCommonjsModule, l as lib$1, a as lib$2, T as Transport, b as commonjsGlobal } from './lazy-chunk-index.es.js';
import { h as hidFraming } from './lazy-chunk-hid-framing.es.js';
import { l as lib } from './lazy-chunk-index.es2.js';

var TransportWebHID_1 = createCommonjsModule(function (module, exports) {

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _hwTransport = _interopRequireDefault(Transport);

var _hidFraming = _interopRequireDefault(hidFraming);







function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const ledgerDevices = [{
  vendorId: lib.ledgerUSBVendorId
}];

const isSupported = () => Promise.resolve(!!(commonjsGlobal.navigator && commonjsGlobal.navigator.hid));

const getHID = () => {
  // $FlowFixMe
  const {
    hid
  } = navigator;
  if (!hid) throw new lib$2.TransportError("navigator.hid is not supported", "HIDNotSupported");
  return hid;
};

async function requestLedgerDevices() {
  const device = await getHID().requestDevice({
    filters: ledgerDevices
  });
  if (Array.isArray(device)) return device;
  return [device];
}

async function getLedgerDevices() {
  const devices = await getHID().getDevices();
  return devices.filter(d => d.vendorId === lib.ledgerUSBVendorId);
}

async function getFirstLedgerDevice() {
  const existingDevices = await getLedgerDevices();
  if (existingDevices.length > 0) return existingDevices[0];
  const devices = await requestLedgerDevices();
  return devices[0];
}
/**
 * WebHID Transport implementation
 * @example
 * import TransportWebHID from "@ledgerhq/hw-transport-webhid";
 * ...
 * TransportWebHID.create().then(transport => ...)
 */


class TransportWebHID extends _hwTransport.default {
  constructor(device) {
    super();
    this.device = void 0;
    this.deviceModel = void 0;
    this.channel = Math.floor(Math.random() * 0xffff);
    this.packetSize = 64;
    this.inputs = [];
    this.inputCallback = void 0;

    this.read = () => {
      if (this.inputs.length) {
        return Promise.resolve(this.inputs.shift());
      }

      return new Promise(success => {
        this.inputCallback = success;
      });
    };

    this.onInputReport = e => {
      const buffer = Buffer.from(e.data.buffer);

      if (this.inputCallback) {
        this.inputCallback(buffer);
        this.inputCallback = null;
      } else {
        this.inputs.push(buffer);
      }
    };

    this._disconnectEmitted = false;

    this._emitDisconnect = e => {
      if (this._disconnectEmitted) return;
      this._disconnectEmitted = true;
      this.emit("disconnect", e);
    };

    this.exchange = apdu => this.exchangeAtomicImpl(async () => {
      const {
        channel,
        packetSize
      } = this;
      (0, lib$1.log)("apdu", "=> " + apdu.toString("hex"));
      const framing = (0, _hidFraming.default)(channel, packetSize); // Write...

      const blocks = framing.makeBlocks(apdu);

      for (let i = 0; i < blocks.length; i++) {
        (0, lib$1.log)("hid-frame", "=> " + blocks[i].toString("hex"));
        await this.device.sendReport(0, blocks[i]);
      } // Read...


      let result;
      let acc;

      while (!(result = framing.getReducedResult(acc))) {
        const buffer = await this.read();
        (0, lib$1.log)("hid-frame", "<= " + buffer.toString("hex"));
        acc = framing.reduceResponse(acc, buffer);
      }

      (0, lib$1.log)("apdu", "<= " + result.toString("hex"));
      return result;
    }).catch(e => {
      if (e && e.message && e.message.includes("write")) {
        this._emitDisconnect(e);

        throw new lib$2.DisconnectedDeviceDuringOperation(e.message);
      }

      throw e;
    });

    this.device = device;
    this.deviceModel = (0, lib.identifyUSBProductId)(device.productId);
    device.addEventListener("inputreport", this.onInputReport);
  }

  /**
   * Similar to create() except it will always display the device permission (even if some devices are already accepted).
   */
  static async request() {
    const [device] = await requestLedgerDevices();
    return TransportWebHID.open(device);
  }
  /**
   * Similar to create() except it will never display the device permission (it returns a Promise<?Transport>, null if it fails to find a device).
   */


  static async openConnected() {
    const devices = await getLedgerDevices();
    if (devices.length === 0) return null;
    return TransportWebHID.open(devices[0]);
  }
  /**
   * Create a Ledger transport with a HIDDevice
   */


  static async open(device) {
    await device.open();
    const transport = new TransportWebHID(device);

    const onDisconnect = e => {
      if (device === e.device) {
        getHID().removeEventListener("disconnect", onDisconnect);

        transport._emitDisconnect(new lib$2.DisconnectedDevice());
      }
    };

    getHID().addEventListener("disconnect", onDisconnect);
    return transport;
  }

  /**
   * Release the transport device
   */
  async close() {
    await this.exchangeBusyPromise;
    this.device.removeEventListener("inputreport", this.onInputReport);
    await this.device.close();
  }
  /**
   * Exchange with the device using APDU protocol.
   * @param apdu
   * @returns a promise of apdu response
   */


  setScrambleKey() {}

}

exports.default = TransportWebHID;
TransportWebHID.isSupported = isSupported;
TransportWebHID.list = getLedgerDevices;

TransportWebHID.listen = observer => {
  let unsubscribed = false;
  getFirstLedgerDevice().then(device => {
    if (!unsubscribed) {
      const deviceModel = (0, lib.identifyUSBProductId)(device.productId);
      observer.next({
        type: "add",
        descriptor: device,
        deviceModel
      });
      observer.complete();
    }
  }, error => {
    observer.error(new lib$2.TransportOpenUserCancelled(error.message));
  });

  function unsubscribe() {
    unsubscribed = true;
  }

  return {
    unsubscribe
  };
};

});

var TransportWebHID = unwrapExports(TransportWebHID_1);

export default TransportWebHID;
export { TransportWebHID_1 as __moduleExports };
//# sourceMappingURL=lazy-chunk-TransportWebHID.es.js.map
