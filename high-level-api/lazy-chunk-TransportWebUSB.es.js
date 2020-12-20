import { B as Buffer } from './lazy-chunk-buffer-es6.es.js';
import './lazy-chunk-events.es.js';
import { T as Transport, l as log, D as DisconnectedDeviceDuringOperation, e as TransportInterfaceNotAvailable, b as DisconnectedDevice, f as TransportWebUSBGestureRequired, c as TransportOpenUserCancelled } from './lazy-chunk-index.es.js';
import './lazy-chunk-_commonjsHelpers.es.js';
import { h as hidFraming } from './lazy-chunk-hid-framing.es.js';
import { l as ledgerUSBVendorId, i as identifyUSBProductId } from './lazy-chunk-index.es2.js';

const ledgerDevices = [{
  vendorId: ledgerUSBVendorId
}];
async function requestLedgerDevice() {
  // $FlowFixMe
  const device = await navigator.usb.requestDevice({
    filters: ledgerDevices
  });
  return device;
}
async function getLedgerDevices() {
  // $FlowFixMe
  const devices = await navigator.usb.getDevices();
  return devices.filter(d => d.vendorId === ledgerUSBVendorId);
}
async function getFirstLedgerDevice() {
  const existingDevices = await getLedgerDevices();
  if (existingDevices.length > 0) return existingDevices[0];
  return requestLedgerDevice();
}
const isSupported = () => Promise.resolve(!!navigator && // $FlowFixMe
!!navigator.usb && typeof navigator.usb.getDevices === "function");

const configurationValue = 1;
const endpointNumber = 3;
/**
 * WebUSB Transport implementation
 * @example
 * import TransportWebUSB from "@ledgerhq/hw-transport-webusb";
 * ...
 * TransportWebUSB.create().then(transport => ...)
 */

class TransportWebUSB extends Transport {
  constructor(device, interfaceNumber) {
    super();
    this.device = void 0;
    this.deviceModel = void 0;
    this.channel = Math.floor(Math.random() * 0xffff);
    this.packetSize = 64;
    this.interfaceNumber = void 0;
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
      log("apdu", "=> " + apdu.toString("hex"));
      const framing = hidFraming(channel, packetSize); // Write...

      const blocks = framing.makeBlocks(apdu);

      for (let i = 0; i < blocks.length; i++) {
        await this.device.transferOut(endpointNumber, blocks[i]);
      } // Read...


      let result;
      let acc;

      while (!(result = framing.getReducedResult(acc))) {
        const r = await this.device.transferIn(endpointNumber, packetSize);
        const buffer = Buffer.from(r.data.buffer);
        acc = framing.reduceResponse(acc, buffer);
      }

      log("apdu", "<= " + result.toString("hex"));
      return result;
    }).catch(e => {
      if (e && e.message && e.message.includes("disconnected")) {
        this._emitDisconnect(e);

        throw new DisconnectedDeviceDuringOperation(e.message);
      }

      throw e;
    });

    this.device = device;
    this.interfaceNumber = interfaceNumber;
    this.deviceModel = identifyUSBProductId(device.productId);
  }
  /**
   * Check if WebUSB transport is supported.
   */


  /**
   * Similar to create() except it will always display the device permission (even if some devices are already accepted).
   */
  static async request() {
    const device = await requestLedgerDevice();
    return TransportWebUSB.open(device);
  }
  /**
   * Similar to create() except it will never display the device permission (it returns a Promise<?Transport>, null if it fails to find a device).
   */


  static async openConnected() {
    const devices = await getLedgerDevices();
    if (devices.length === 0) return null;
    return TransportWebUSB.open(devices[0]);
  }
  /**
   * Create a Ledger transport with a USBDevice
   */


  static async open(device) {
    await device.open();

    if (device.configuration === null) {
      await device.selectConfiguration(configurationValue);
    }

    await gracefullyResetDevice(device);
    const iface = device.configurations[0].interfaces.find(({
      alternates
    }) => alternates.some(a => a.interfaceClass === 255));

    if (!iface) {
      throw new TransportInterfaceNotAvailable("No WebUSB interface found for your Ledger device. Please upgrade firmware or contact techsupport.");
    }

    const interfaceNumber = iface.interfaceNumber;

    try {
      await device.claimInterface(interfaceNumber);
    } catch (e) {
      await device.close();
      throw new TransportInterfaceNotAvailable(e.message);
    }

    const transport = new TransportWebUSB(device, interfaceNumber);

    const onDisconnect = e => {
      if (device === e.device) {
        // $FlowFixMe
        navigator.usb.removeEventListener("disconnect", onDisconnect);

        transport._emitDisconnect(new DisconnectedDevice());
      }
    }; // $FlowFixMe


    navigator.usb.addEventListener("disconnect", onDisconnect);
    return transport;
  }

  /**
   * Release the transport device
   */
  async close() {
    await this.exchangeBusyPromise;
    await this.device.releaseInterface(this.interfaceNumber);
    await gracefullyResetDevice(this.device);
    await this.device.close();
  }
  /**
   * Exchange with the device using APDU protocol.
   * @param apdu
   * @returns a promise of apdu response
   */


  setScrambleKey() {}

}
TransportWebUSB.isSupported = isSupported;
TransportWebUSB.list = getLedgerDevices;

TransportWebUSB.listen = observer => {
  let unsubscribed = false;
  getFirstLedgerDevice().then(device => {
    if (!unsubscribed) {
      const deviceModel = identifyUSBProductId(device.productId);
      observer.next({
        type: "add",
        descriptor: device,
        deviceModel
      });
      observer.complete();
    }
  }, error => {
    if (window.DOMException && error instanceof window.DOMException && error.code === 18) {
      observer.error(new TransportWebUSBGestureRequired(error.message));
    } else {
      observer.error(new TransportOpenUserCancelled(error.message));
    }
  });

  function unsubscribe() {
    unsubscribed = true;
  }

  return {
    unsubscribe
  };
};

async function gracefullyResetDevice(device) {
  try {
    await device.reset();
  } catch (err) {
    console.warn(err);
  }
}

export default TransportWebUSB;
//# sourceMappingURL=lazy-chunk-TransportWebUSB.es.js.map
