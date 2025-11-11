import { b as buffer } from './lazy-chunk-index.es.js';
import { T as Transport, D as DisconnectedDeviceDuringOperation, a as TransportOpenUserCancelled, b as TransportError, c as DisconnectedDevice } from './lazy-chunk-Transport.es.js';
import { c as createHIDframing } from './lazy-chunk-hid-framing.es.js';
import { i as identifyUSBProductId, l as ledgerUSBVendorId } from './lazy-chunk-index.es2.js';
import { l as log } from './lazy-chunk-index.es3.js';
import './lazy-chunk-events.es.js';
import './lazy-chunk-_commonjsHelpers.es.js';
import './lazy-chunk-_virtual_process.es.js';
import './lazy-chunk-index.es4.js';

var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const ledgerDevices = [
    {
        vendorId: ledgerUSBVendorId,
    },
];
const isSupported = () => Promise.resolve(!!(window.navigator && window.navigator.hid));
const getHID = () => {
    // $FlowFixMe
    const { hid } = navigator;
    if (!hid)
        throw new TransportError("navigator.hid is not supported", "HIDNotSupported");
    return hid;
};
function requestLedgerDevices() {
    return __awaiter(this, void 0, void 0, function* () {
        const device = yield getHID().requestDevice({
            filters: ledgerDevices,
        });
        if (Array.isArray(device))
            return device;
        return [device];
    });
}
function getLedgerDevices() {
    return __awaiter(this, void 0, void 0, function* () {
        const devices = yield getHID().getDevices();
        return devices.filter(d => d.vendorId === ledgerUSBVendorId);
    });
}
function getFirstLedgerDevice() {
    return __awaiter(this, void 0, void 0, function* () {
        const existingDevices = yield getLedgerDevices();
        if (existingDevices.length > 0)
            return existingDevices[0];
        const devices = yield requestLedgerDevices();
        return devices[0];
    });
}
/**
 * WebHID Transport implementation
 * @example
 * import TransportWebHID from "@ledgerhq/hw-transport-webhid";
 * ...
 * TransportWebHID.create().then(transport => ...)
 */
class TransportWebHID extends Transport {
    constructor(device) {
        super();
        this.channel = Math.floor(Math.random() * 0xffff);
        this.packetSize = 64;
        this.inputs = [];
        this.read = () => {
            if (this.inputs.length) {
                return Promise.resolve(this.inputs.shift());
            }
            return new Promise(success => {
                this.inputCallback = success;
            });
        };
        this.onInputReport = (e) => {
            const buffer$1 = buffer.Buffer.from(e.data.buffer);
            if (this.inputCallback) {
                this.inputCallback(buffer$1);
                this.inputCallback = null;
            }
            else {
                this.inputs.push(buffer$1);
            }
        };
        this._disconnectEmitted = false;
        this._emitDisconnect = (e) => {
            if (this._disconnectEmitted)
                return;
            this._disconnectEmitted = true;
            this.emit("disconnect", e);
        };
        /**
         * Exchange with the device using APDU protocol.
         * @param apdu
         * @returns a promise of apdu response
         */
        this.exchange = (apdu) => __awaiter(this, void 0, void 0, function* () {
            const b = yield this.exchangeAtomicImpl(() => __awaiter(this, void 0, void 0, function* () {
                const { channel, packetSize } = this;
                log("apdu", "=> " + apdu.toString("hex"));
                const framing = createHIDframing(channel, packetSize);
                // Write...
                const blocks = framing.makeBlocks(apdu);
                for (let i = 0; i < blocks.length; i++) {
                    yield this.device.sendReport(0, blocks[i]);
                }
                // Read...
                let result;
                let acc;
                while (!(result = framing.getReducedResult(acc))) {
                    const buffer = yield this.read();
                    acc = framing.reduceResponse(acc, buffer);
                }
                log("apdu", "<= " + result.toString("hex"));
                return result;
            })).catch(e => {
                if (e && e.message && e.message.includes("write")) {
                    this._emitDisconnect(e);
                    throw new DisconnectedDeviceDuringOperation(e.message);
                }
                throw e;
            });
            return b;
        });
        this.device = device;
        this.deviceModel =
            typeof device.productId === "number" ? identifyUSBProductId(device.productId) : undefined;
        device.addEventListener("inputreport", this.onInputReport);
    }
    /**
     * Similar to create() except it will always display the device permission (even if some devices are already accepted).
     */
    static request() {
        return __awaiter(this, void 0, void 0, function* () {
            const [device] = yield requestLedgerDevices();
            return TransportWebHID.open(device);
        });
    }
    /**
     * Similar to create() except it will never display the device permission (it returns a Promise<?Transport>, null if it fails to find a device).
     */
    static openConnected() {
        return __awaiter(this, void 0, void 0, function* () {
            const devices = yield getLedgerDevices();
            if (devices.length === 0)
                return null;
            return TransportWebHID.open(devices[0]);
        });
    }
    /**
     * Create a Ledger transport with a HIDDevice
     */
    static open(device) {
        return __awaiter(this, void 0, void 0, function* () {
            yield device.open();
            const transport = new TransportWebHID(device);
            const onDisconnect = e => {
                if (device === e.device) {
                    getHID().removeEventListener("disconnect", onDisconnect);
                    transport._emitDisconnect(new DisconnectedDevice());
                }
            };
            getHID().addEventListener("disconnect", onDisconnect);
            return transport;
        });
    }
    /**
     * Release the transport device
     */
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.exchangeBusyPromise;
            this.device.removeEventListener("inputreport", this.onInputReport);
            yield this.device.close();
        });
    }
    setScrambleKey() { }
}
/**
 * Check if WebUSB transport is supported.
 */
TransportWebHID.isSupported = isSupported;
/**
 * List the WebUSB devices that was previously authorized by the user.
 */
TransportWebHID.list = getLedgerDevices;
/**
 * Actively listen to WebUSB devices and emit ONE device
 * that was either accepted before, if not it will trigger the native permission UI.
 *
 * Important: it must be called in the context of a UI click!
 */
TransportWebHID.listen = (observer) => {
    let unsubscribed = false;
    getFirstLedgerDevice().then(device => {
        if (!device) {
            observer.error(new TransportOpenUserCancelled("Access denied to use Ledger device"));
        }
        else if (!unsubscribed) {
            const deviceModel = typeof device.productId === "number"
                ? identifyUSBProductId(device.productId)
                : undefined;
            observer.next({
                type: "add",
                descriptor: device,
                deviceModel,
            });
            observer.complete();
        }
    }, error => {
        observer.error(new TransportOpenUserCancelled(error.message));
    });
    function unsubscribe() {
        unsubscribed = true;
    }
    return {
        unsubscribe,
    };
};

export { TransportWebHID as default };
//# sourceMappingURL=lazy-chunk-TransportWebHID.es.js.map
