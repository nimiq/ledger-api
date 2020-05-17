import { B as Buffer } from './lazy-chunk-buffer.es.js';

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

function unwrapExports (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var domain;

// This constructor is used to store event handlers. Instantiating this is
// faster than explicitly calling `Object.create(null)` to get a "clean" empty
// object (tested with v8 v4.9).
function EventHandlers() {}
EventHandlers.prototype = Object.create(null);

function EventEmitter() {
  EventEmitter.init.call(this);
}

// nodejs oddity
// require('events') === require('events').EventEmitter
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.usingDomains = false;

EventEmitter.prototype.domain = undefined;
EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

EventEmitter.init = function() {
  this.domain = null;
  if (EventEmitter.usingDomains) {
    // if there is an active domain, then attach to it.
    if (domain.active ) ;
  }

  if (!this._events || this._events === Object.getPrototypeOf(this)._events) {
    this._events = new EventHandlers();
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
};

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || isNaN(n))
    throw new TypeError('"n" argument must be a positive number');
  this._maxListeners = n;
  return this;
};

function $getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return $getMaxListeners(this);
};

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
function emitNone(handler, isFn, self) {
  if (isFn)
    handler.call(self);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self);
  }
}
function emitOne(handler, isFn, self, arg1) {
  if (isFn)
    handler.call(self, arg1);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1);
  }
}
function emitTwo(handler, isFn, self, arg1, arg2) {
  if (isFn)
    handler.call(self, arg1, arg2);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2);
  }
}
function emitThree(handler, isFn, self, arg1, arg2, arg3) {
  if (isFn)
    handler.call(self, arg1, arg2, arg3);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2, arg3);
  }
}

function emitMany(handler, isFn, self, args) {
  if (isFn)
    handler.apply(self, args);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].apply(self, args);
  }
}

EventEmitter.prototype.emit = function emit(type) {
  var er, handler, len, args, i, events, domain;
  var doError = (type === 'error');

  events = this._events;
  if (events)
    doError = (doError && events.error == null);
  else if (!doError)
    return false;

  domain = this.domain;

  // If there is no 'error' event listener then throw.
  if (doError) {
    er = arguments[1];
    if (domain) {
      if (!er)
        er = new Error('Uncaught, unspecified "error" event');
      er.domainEmitter = this;
      er.domain = domain;
      er.domainThrown = false;
      domain.emit('error', er);
    } else if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      // At least give some kind of context to the user
      var err = new Error('Uncaught, unspecified "error" event. (' + er + ')');
      err.context = er;
      throw err;
    }
    return false;
  }

  handler = events[type];

  if (!handler)
    return false;

  var isFn = typeof handler === 'function';
  len = arguments.length;
  switch (len) {
    // fast cases
    case 1:
      emitNone(handler, isFn, this);
      break;
    case 2:
      emitOne(handler, isFn, this, arguments[1]);
      break;
    case 3:
      emitTwo(handler, isFn, this, arguments[1], arguments[2]);
      break;
    case 4:
      emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
      break;
    // slower
    default:
      args = new Array(len - 1);
      for (i = 1; i < len; i++)
        args[i - 1] = arguments[i];
      emitMany(handler, isFn, this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');

  events = target._events;
  if (!events) {
    events = target._events = new EventHandlers();
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener) {
      target.emit('newListener', type,
                  listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (!existing) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] = prepend ? [listener, existing] :
                                          [existing, listener];
    } else {
      // If we've already got an array, just append.
      if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }
    }

    // Check for listener leak
    if (!existing.warned) {
      m = $getMaxListeners(target);
      if (m && m > 0 && existing.length > m) {
        existing.warned = true;
        var w = new Error('Possible EventEmitter memory leak detected. ' +
                            existing.length + ' ' + type + ' listeners added. ' +
                            'Use emitter.setMaxListeners() to increase limit');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        emitWarning(w);
      }
    }
  }

  return target;
}
function emitWarning(e) {
  typeof console.warn === 'function' ? console.warn(e) : console.log(e);
}
EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function _onceWrap(target, type, listener) {
  var fired = false;
  function g() {
    target.removeListener(type, g);
    if (!fired) {
      fired = true;
      listener.apply(target, arguments);
    }
  }
  g.listener = listener;
  return g;
}

EventEmitter.prototype.once = function once(type, listener) {
  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');

      events = this._events;
      if (!events)
        return this;

      list = events[type];
      if (!list)
        return this;

      if (list === listener || (list.listener && list.listener === listener)) {
        if (--this._eventsCount === 0)
          this._events = new EventHandlers();
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length; i-- > 0;) {
          if (list[i] === listener ||
              (list[i].listener && list[i].listener === listener)) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (list.length === 1) {
          list[0] = undefined;
          if (--this._eventsCount === 0) {
            this._events = new EventHandlers();
            return this;
          } else {
            delete events[type];
          }
        } else {
          spliceOne(list, position);
        }

        if (events.removeListener)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events;

      events = this._events;
      if (!events)
        return this;

      // not listening for removeListener, no need to emit
      if (!events.removeListener) {
        if (arguments.length === 0) {
          this._events = new EventHandlers();
          this._eventsCount = 0;
        } else if (events[type]) {
          if (--this._eventsCount === 0)
            this._events = new EventHandlers();
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = Object.keys(events);
        for (var i = 0, key; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = new EventHandlers();
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners) {
        // LIFO order
        do {
          this.removeListener(type, listeners[listeners.length - 1]);
        } while (listeners[0]);
      }

      return this;
    };

EventEmitter.prototype.listeners = function listeners(type) {
  var evlistener;
  var ret;
  var events = this._events;

  if (!events)
    ret = [];
  else {
    evlistener = events[type];
    if (!evlistener)
      ret = [];
    else if (typeof evlistener === 'function')
      ret = [evlistener.listener || evlistener];
    else
      ret = unwrapListeners(evlistener);
  }

  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
};

// About 1.5x faster than the two-arg version of Array#splice().
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
    list[i] = list[k];
  list.pop();
}

function arrayClone(arr, i) {
  var copy = new Array(i);
  while (i--)
    copy[i] = arr[i];
  return copy;
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

var helpers = createCommonjsModule(function (module, exports) {

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.serializeError = exports.deserializeError = exports.createCustomErrorClass = exports.addCustomErrorDeserializer = void 0;

/* eslint-disable no-continue */

/* eslint-disable no-param-reassign */

/* eslint-disable no-prototype-builtins */
const errorClasses = {};
const deserializers = {};

const addCustomErrorDeserializer = (name, deserializer) => {
  deserializers[name] = deserializer;
};

exports.addCustomErrorDeserializer = addCustomErrorDeserializer;

const createCustomErrorClass = name => {
  const C = function CustomError(message, fields) {
    Object.assign(this, fields);
    this.name = name;
    this.message = message || name;
    this.stack = new Error().stack;
  }; // $FlowFixMe


  C.prototype = new Error();
  errorClasses[name] = C; // $FlowFixMe we can't easily type a subset of Error for now...

  return C;
}; // inspired from https://github.com/programble/errio/blob/master/index.js


exports.createCustomErrorClass = createCustomErrorClass;

const deserializeError = object => {
  if (typeof object === "object" && object) {
    try {
      // $FlowFixMe FIXME HACK
      const msg = JSON.parse(object.message);

      if (msg.message && msg.name) {
        object = msg;
      }
    } catch (e) {// nothing
    }

    let error;

    if (typeof object.name === "string") {
      const {
        name
      } = object;
      const des = deserializers[name];

      if (des) {
        error = des(object);
      } else {
        let constructor = name === "Error" ? Error : errorClasses[name];

        if (!constructor) {
          console.warn("deserializing an unknown class '" + name + "'");
          constructor = createCustomErrorClass(name);
        }

        error = Object.create(constructor.prototype);

        try {
          for (const prop in object) {
            if (object.hasOwnProperty(prop)) {
              error[prop] = object[prop];
            }
          }
        } catch (e) {// sometimes setting a property can fail (e.g. .name)
        }
      }
    } else {
      error = new Error(object.message);
    }

    if (!error.stack && Error.captureStackTrace) {
      Error.captureStackTrace(error, deserializeError);
    }

    return error;
  }

  return new Error(String(object));
}; // inspired from https://github.com/sindresorhus/serialize-error/blob/master/index.js


exports.deserializeError = deserializeError;

const serializeError = value => {
  if (!value) return value;

  if (typeof value === "object") {
    return destroyCircular(value, []);
  }

  if (typeof value === "function") {
    return `[Function: ${value.name || "anonymous"}]`;
  }

  return value;
}; // https://www.npmjs.com/package/destroy-circular


exports.serializeError = serializeError;

function destroyCircular(from, seen) {
  const to = {};
  seen.push(from);

  for (const key of Object.keys(from)) {
    const value = from[key];

    if (typeof value === "function") {
      continue;
    }

    if (!value || typeof value !== "object") {
      to[key] = value;
      continue;
    }

    if (seen.indexOf(from[key]) === -1) {
      to[key] = destroyCircular(from[key], seen.slice(0));
      continue;
    }

    to[key] = "[Circular]";
  }

  if (typeof from.name === "string") {
    to.name = from.name;
  }

  if (typeof from.message === "string") {
    to.message = from.message;
  }

  if (typeof from.stack === "string") {
    to.stack = from.stack;
  }

  return to;
}

});

unwrapExports(helpers);
var helpers_1 = helpers.serializeError;
var helpers_2 = helpers.deserializeError;
var helpers_3 = helpers.createCustomErrorClass;
var helpers_4 = helpers.addCustomErrorDeserializer;

var lib = createCommonjsModule(function (module, exports) {

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TransportError = TransportError;
exports.getAltStatusMessage = getAltStatusMessage;
exports.TransportStatusError = TransportStatusError;
Object.defineProperty(exports, "serializeError", {
  enumerable: true,
  get: function () {
    return helpers.serializeError;
  }
});
Object.defineProperty(exports, "deserializeError", {
  enumerable: true,
  get: function () {
    return helpers.deserializeError;
  }
});
Object.defineProperty(exports, "createCustomErrorClass", {
  enumerable: true,
  get: function () {
    return helpers.createCustomErrorClass;
  }
});
Object.defineProperty(exports, "addCustomErrorDeserializer", {
  enumerable: true,
  get: function () {
    return helpers.addCustomErrorDeserializer;
  }
});
exports.StatusCodes = exports.DBNotReset = exports.DBWrongPassword = exports.NoDBPathGiven = exports.FirmwareOrAppUpdateRequired = exports.LedgerAPI5xx = exports.LedgerAPI4xx = exports.GenuineCheckFailed = exports.PairingFailed = exports.SyncError = exports.FeeTooHigh = exports.FeeRequired = exports.FeeNotLoaded = exports.CantScanQRCode = exports.ETHAddressNonEIP = exports.WrongAppForCurrency = exports.WrongDeviceForAccount = exports.WebsocketConnectionFailed = exports.WebsocketConnectionError = exports.DeviceShouldStayInApp = exports.TransportWebUSBGestureRequired = exports.TransportRaceCondition = exports.TransportInterfaceNotAvailable = exports.TransportOpenUserCancelled = exports.UserRefusedOnDevice = exports.UserRefusedAllowManager = exports.UserRefusedFirmwareUpdate = exports.UserRefusedAddress = exports.UserRefusedDeviceNameChange = exports.UpdateYourApp = exports.UpdateIncorrectSig = exports.UpdateIncorrectHash = exports.UpdateFetchFileFail = exports.UnavailableTezosOriginatedAccountSend = exports.UnavailableTezosOriginatedAccountReceive = exports.RecipientRequired = exports.MCUNotGenuineToDashboard = exports.UnexpectedBootloader = exports.TimeoutTagged = exports.RecommendUndelegation = exports.RecommendSubAccountsToEmpty = exports.PasswordIncorrectError = exports.PasswordsDontMatchError = exports.GasLessThanEstimate = exports.NotSupportedLegacyAddress = exports.NotEnoughGas = exports.NoAccessToCamera = exports.NotEnoughBalanceBecauseDestinationNotCreated = exports.NotEnoughSpendableBalance = exports.NotEnoughBalanceInParentAccount = exports.NotEnoughBalanceToDelegate = exports.NotEnoughBalance = exports.NoAddressesFound = exports.NetworkDown = exports.ManagerUninstallBTCDep = exports.ManagerNotEnoughSpaceError = exports.ManagerFirmwareNotEnoughSpaceError = exports.ManagerDeviceLockedError = exports.ManagerAppDepUninstallRequired = exports.ManagerAppDepInstallRequired = exports.ManagerAppRelyOnBTCError = exports.ManagerAppAlreadyInstalledError = exports.LedgerAPINotAvailable = exports.LedgerAPIErrorWithMessage = exports.LedgerAPIError = exports.UnknownMCU = exports.LatestMCUInstalledError = exports.InvalidAddressBecauseDestinationIsAlsoSource = exports.InvalidAddress = exports.InvalidXRPTag = exports.HardResetFail = exports.FirmwareNotRecognized = exports.FeeEstimationFailed = exports.EthAppPleaseEnableContractData = exports.EnpointConfigError = exports.DisconnectedDeviceDuringOperation = exports.DisconnectedDevice = exports.DeviceSocketNoBulkStatus = exports.DeviceSocketFail = exports.DeviceNameInvalid = exports.DeviceHalted = exports.DeviceInOSUExpected = exports.DeviceOnDashboardUnexpected = exports.DeviceOnDashboardExpected = exports.DeviceNotGenuineError = exports.DeviceGenuineSocketEarlyClose = exports.DeviceAppVerifyNotSupported = exports.CurrencyNotSupported = exports.CashAddrNotSupported = exports.CantOpenDevice = exports.BtcUnmatchedApp = exports.BluetoothRequired = exports.AmountRequired = exports.AccountNotSupported = exports.AccountNameRequiredError = void 0;



const AccountNameRequiredError = (0, helpers.createCustomErrorClass)("AccountNameRequired");
exports.AccountNameRequiredError = AccountNameRequiredError;
const AccountNotSupported = (0, helpers.createCustomErrorClass)("AccountNotSupported");
exports.AccountNotSupported = AccountNotSupported;
const AmountRequired = (0, helpers.createCustomErrorClass)("AmountRequired");
exports.AmountRequired = AmountRequired;
const BluetoothRequired = (0, helpers.createCustomErrorClass)("BluetoothRequired");
exports.BluetoothRequired = BluetoothRequired;
const BtcUnmatchedApp = (0, helpers.createCustomErrorClass)("BtcUnmatchedApp");
exports.BtcUnmatchedApp = BtcUnmatchedApp;
const CantOpenDevice = (0, helpers.createCustomErrorClass)("CantOpenDevice");
exports.CantOpenDevice = CantOpenDevice;
const CashAddrNotSupported = (0, helpers.createCustomErrorClass)("CashAddrNotSupported");
exports.CashAddrNotSupported = CashAddrNotSupported;
const CurrencyNotSupported = (0, helpers.createCustomErrorClass)("CurrencyNotSupported");
exports.CurrencyNotSupported = CurrencyNotSupported;
const DeviceAppVerifyNotSupported = (0, helpers.createCustomErrorClass)("DeviceAppVerifyNotSupported");
exports.DeviceAppVerifyNotSupported = DeviceAppVerifyNotSupported;
const DeviceGenuineSocketEarlyClose = (0, helpers.createCustomErrorClass)("DeviceGenuineSocketEarlyClose");
exports.DeviceGenuineSocketEarlyClose = DeviceGenuineSocketEarlyClose;
const DeviceNotGenuineError = (0, helpers.createCustomErrorClass)("DeviceNotGenuine");
exports.DeviceNotGenuineError = DeviceNotGenuineError;
const DeviceOnDashboardExpected = (0, helpers.createCustomErrorClass)("DeviceOnDashboardExpected");
exports.DeviceOnDashboardExpected = DeviceOnDashboardExpected;
const DeviceOnDashboardUnexpected = (0, helpers.createCustomErrorClass)("DeviceOnDashboardUnexpected");
exports.DeviceOnDashboardUnexpected = DeviceOnDashboardUnexpected;
const DeviceInOSUExpected = (0, helpers.createCustomErrorClass)("DeviceInOSUExpected");
exports.DeviceInOSUExpected = DeviceInOSUExpected;
const DeviceHalted = (0, helpers.createCustomErrorClass)("DeviceHalted");
exports.DeviceHalted = DeviceHalted;
const DeviceNameInvalid = (0, helpers.createCustomErrorClass)("DeviceNameInvalid");
exports.DeviceNameInvalid = DeviceNameInvalid;
const DeviceSocketFail = (0, helpers.createCustomErrorClass)("DeviceSocketFail");
exports.DeviceSocketFail = DeviceSocketFail;
const DeviceSocketNoBulkStatus = (0, helpers.createCustomErrorClass)("DeviceSocketNoBulkStatus");
exports.DeviceSocketNoBulkStatus = DeviceSocketNoBulkStatus;
const DisconnectedDevice = (0, helpers.createCustomErrorClass)("DisconnectedDevice");
exports.DisconnectedDevice = DisconnectedDevice;
const DisconnectedDeviceDuringOperation = (0, helpers.createCustomErrorClass)("DisconnectedDeviceDuringOperation");
exports.DisconnectedDeviceDuringOperation = DisconnectedDeviceDuringOperation;
const EnpointConfigError = (0, helpers.createCustomErrorClass)("EnpointConfig");
exports.EnpointConfigError = EnpointConfigError;
const EthAppPleaseEnableContractData = (0, helpers.createCustomErrorClass)("EthAppPleaseEnableContractData");
exports.EthAppPleaseEnableContractData = EthAppPleaseEnableContractData;
const FeeEstimationFailed = (0, helpers.createCustomErrorClass)("FeeEstimationFailed");
exports.FeeEstimationFailed = FeeEstimationFailed;
const FirmwareNotRecognized = (0, helpers.createCustomErrorClass)("FirmwareNotRecognized");
exports.FirmwareNotRecognized = FirmwareNotRecognized;
const HardResetFail = (0, helpers.createCustomErrorClass)("HardResetFail");
exports.HardResetFail = HardResetFail;
const InvalidXRPTag = (0, helpers.createCustomErrorClass)("InvalidXRPTag");
exports.InvalidXRPTag = InvalidXRPTag;
const InvalidAddress = (0, helpers.createCustomErrorClass)("InvalidAddress");
exports.InvalidAddress = InvalidAddress;
const InvalidAddressBecauseDestinationIsAlsoSource = (0, helpers.createCustomErrorClass)("InvalidAddressBecauseDestinationIsAlsoSource");
exports.InvalidAddressBecauseDestinationIsAlsoSource = InvalidAddressBecauseDestinationIsAlsoSource;
const LatestMCUInstalledError = (0, helpers.createCustomErrorClass)("LatestMCUInstalledError");
exports.LatestMCUInstalledError = LatestMCUInstalledError;
const UnknownMCU = (0, helpers.createCustomErrorClass)("UnknownMCU");
exports.UnknownMCU = UnknownMCU;
const LedgerAPIError = (0, helpers.createCustomErrorClass)("LedgerAPIError");
exports.LedgerAPIError = LedgerAPIError;
const LedgerAPIErrorWithMessage = (0, helpers.createCustomErrorClass)("LedgerAPIErrorWithMessage");
exports.LedgerAPIErrorWithMessage = LedgerAPIErrorWithMessage;
const LedgerAPINotAvailable = (0, helpers.createCustomErrorClass)("LedgerAPINotAvailable");
exports.LedgerAPINotAvailable = LedgerAPINotAvailable;
const ManagerAppAlreadyInstalledError = (0, helpers.createCustomErrorClass)("ManagerAppAlreadyInstalled");
exports.ManagerAppAlreadyInstalledError = ManagerAppAlreadyInstalledError;
const ManagerAppRelyOnBTCError = (0, helpers.createCustomErrorClass)("ManagerAppRelyOnBTC");
exports.ManagerAppRelyOnBTCError = ManagerAppRelyOnBTCError;
const ManagerAppDepInstallRequired = (0, helpers.createCustomErrorClass)("ManagerAppDepInstallRequired");
exports.ManagerAppDepInstallRequired = ManagerAppDepInstallRequired;
const ManagerAppDepUninstallRequired = (0, helpers.createCustomErrorClass)("ManagerAppDepUninstallRequired");
exports.ManagerAppDepUninstallRequired = ManagerAppDepUninstallRequired;
const ManagerDeviceLockedError = (0, helpers.createCustomErrorClass)("ManagerDeviceLocked");
exports.ManagerDeviceLockedError = ManagerDeviceLockedError;
const ManagerFirmwareNotEnoughSpaceError = (0, helpers.createCustomErrorClass)("ManagerFirmwareNotEnoughSpace");
exports.ManagerFirmwareNotEnoughSpaceError = ManagerFirmwareNotEnoughSpaceError;
const ManagerNotEnoughSpaceError = (0, helpers.createCustomErrorClass)("ManagerNotEnoughSpace");
exports.ManagerNotEnoughSpaceError = ManagerNotEnoughSpaceError;
const ManagerUninstallBTCDep = (0, helpers.createCustomErrorClass)("ManagerUninstallBTCDep");
exports.ManagerUninstallBTCDep = ManagerUninstallBTCDep;
const NetworkDown = (0, helpers.createCustomErrorClass)("NetworkDown");
exports.NetworkDown = NetworkDown;
const NoAddressesFound = (0, helpers.createCustomErrorClass)("NoAddressesFound");
exports.NoAddressesFound = NoAddressesFound;
const NotEnoughBalance = (0, helpers.createCustomErrorClass)("NotEnoughBalance");
exports.NotEnoughBalance = NotEnoughBalance;
const NotEnoughBalanceToDelegate = (0, helpers.createCustomErrorClass)("NotEnoughBalanceToDelegate");
exports.NotEnoughBalanceToDelegate = NotEnoughBalanceToDelegate;
const NotEnoughBalanceInParentAccount = (0, helpers.createCustomErrorClass)("NotEnoughBalanceInParentAccount");
exports.NotEnoughBalanceInParentAccount = NotEnoughBalanceInParentAccount;
const NotEnoughSpendableBalance = (0, helpers.createCustomErrorClass)("NotEnoughSpendableBalance");
exports.NotEnoughSpendableBalance = NotEnoughSpendableBalance;
const NotEnoughBalanceBecauseDestinationNotCreated = (0, helpers.createCustomErrorClass)("NotEnoughBalanceBecauseDestinationNotCreated");
exports.NotEnoughBalanceBecauseDestinationNotCreated = NotEnoughBalanceBecauseDestinationNotCreated;
const NoAccessToCamera = (0, helpers.createCustomErrorClass)("NoAccessToCamera");
exports.NoAccessToCamera = NoAccessToCamera;
const NotEnoughGas = (0, helpers.createCustomErrorClass)("NotEnoughGas");
exports.NotEnoughGas = NotEnoughGas;
const NotSupportedLegacyAddress = (0, helpers.createCustomErrorClass)("NotSupportedLegacyAddress");
exports.NotSupportedLegacyAddress = NotSupportedLegacyAddress;
const GasLessThanEstimate = (0, helpers.createCustomErrorClass)("GasLessThanEstimate");
exports.GasLessThanEstimate = GasLessThanEstimate;
const PasswordsDontMatchError = (0, helpers.createCustomErrorClass)("PasswordsDontMatch");
exports.PasswordsDontMatchError = PasswordsDontMatchError;
const PasswordIncorrectError = (0, helpers.createCustomErrorClass)("PasswordIncorrect");
exports.PasswordIncorrectError = PasswordIncorrectError;
const RecommendSubAccountsToEmpty = (0, helpers.createCustomErrorClass)("RecommendSubAccountsToEmpty");
exports.RecommendSubAccountsToEmpty = RecommendSubAccountsToEmpty;
const RecommendUndelegation = (0, helpers.createCustomErrorClass)("RecommendUndelegation");
exports.RecommendUndelegation = RecommendUndelegation;
const TimeoutTagged = (0, helpers.createCustomErrorClass)("TimeoutTagged");
exports.TimeoutTagged = TimeoutTagged;
const UnexpectedBootloader = (0, helpers.createCustomErrorClass)("UnexpectedBootloader");
exports.UnexpectedBootloader = UnexpectedBootloader;
const MCUNotGenuineToDashboard = (0, helpers.createCustomErrorClass)("MCUNotGenuineToDashboard");
exports.MCUNotGenuineToDashboard = MCUNotGenuineToDashboard;
const RecipientRequired = (0, helpers.createCustomErrorClass)("RecipientRequired");
exports.RecipientRequired = RecipientRequired;
const UnavailableTezosOriginatedAccountReceive = (0, helpers.createCustomErrorClass)("UnavailableTezosOriginatedAccountReceive");
exports.UnavailableTezosOriginatedAccountReceive = UnavailableTezosOriginatedAccountReceive;
const UnavailableTezosOriginatedAccountSend = (0, helpers.createCustomErrorClass)("UnavailableTezosOriginatedAccountSend");
exports.UnavailableTezosOriginatedAccountSend = UnavailableTezosOriginatedAccountSend;
const UpdateFetchFileFail = (0, helpers.createCustomErrorClass)("UpdateFetchFileFail");
exports.UpdateFetchFileFail = UpdateFetchFileFail;
const UpdateIncorrectHash = (0, helpers.createCustomErrorClass)("UpdateIncorrectHash");
exports.UpdateIncorrectHash = UpdateIncorrectHash;
const UpdateIncorrectSig = (0, helpers.createCustomErrorClass)("UpdateIncorrectSig");
exports.UpdateIncorrectSig = UpdateIncorrectSig;
const UpdateYourApp = (0, helpers.createCustomErrorClass)("UpdateYourApp");
exports.UpdateYourApp = UpdateYourApp;
const UserRefusedDeviceNameChange = (0, helpers.createCustomErrorClass)("UserRefusedDeviceNameChange");
exports.UserRefusedDeviceNameChange = UserRefusedDeviceNameChange;
const UserRefusedAddress = (0, helpers.createCustomErrorClass)("UserRefusedAddress");
exports.UserRefusedAddress = UserRefusedAddress;
const UserRefusedFirmwareUpdate = (0, helpers.createCustomErrorClass)("UserRefusedFirmwareUpdate");
exports.UserRefusedFirmwareUpdate = UserRefusedFirmwareUpdate;
const UserRefusedAllowManager = (0, helpers.createCustomErrorClass)("UserRefusedAllowManager");
exports.UserRefusedAllowManager = UserRefusedAllowManager;
const UserRefusedOnDevice = (0, helpers.createCustomErrorClass)("UserRefusedOnDevice"); // TODO rename because it's just for transaction refusal

exports.UserRefusedOnDevice = UserRefusedOnDevice;
const TransportOpenUserCancelled = (0, helpers.createCustomErrorClass)("TransportOpenUserCancelled");
exports.TransportOpenUserCancelled = TransportOpenUserCancelled;
const TransportInterfaceNotAvailable = (0, helpers.createCustomErrorClass)("TransportInterfaceNotAvailable");
exports.TransportInterfaceNotAvailable = TransportInterfaceNotAvailable;
const TransportRaceCondition = (0, helpers.createCustomErrorClass)("TransportRaceCondition");
exports.TransportRaceCondition = TransportRaceCondition;
const TransportWebUSBGestureRequired = (0, helpers.createCustomErrorClass)("TransportWebUSBGestureRequired");
exports.TransportWebUSBGestureRequired = TransportWebUSBGestureRequired;
const DeviceShouldStayInApp = (0, helpers.createCustomErrorClass)("DeviceShouldStayInApp");
exports.DeviceShouldStayInApp = DeviceShouldStayInApp;
const WebsocketConnectionError = (0, helpers.createCustomErrorClass)("WebsocketConnectionError");
exports.WebsocketConnectionError = WebsocketConnectionError;
const WebsocketConnectionFailed = (0, helpers.createCustomErrorClass)("WebsocketConnectionFailed");
exports.WebsocketConnectionFailed = WebsocketConnectionFailed;
const WrongDeviceForAccount = (0, helpers.createCustomErrorClass)("WrongDeviceForAccount");
exports.WrongDeviceForAccount = WrongDeviceForAccount;
const WrongAppForCurrency = (0, helpers.createCustomErrorClass)("WrongAppForCurrency");
exports.WrongAppForCurrency = WrongAppForCurrency;
const ETHAddressNonEIP = (0, helpers.createCustomErrorClass)("ETHAddressNonEIP");
exports.ETHAddressNonEIP = ETHAddressNonEIP;
const CantScanQRCode = (0, helpers.createCustomErrorClass)("CantScanQRCode");
exports.CantScanQRCode = CantScanQRCode;
const FeeNotLoaded = (0, helpers.createCustomErrorClass)("FeeNotLoaded");
exports.FeeNotLoaded = FeeNotLoaded;
const FeeRequired = (0, helpers.createCustomErrorClass)("FeeRequired");
exports.FeeRequired = FeeRequired;
const FeeTooHigh = (0, helpers.createCustomErrorClass)("FeeTooHigh");
exports.FeeTooHigh = FeeTooHigh;
const SyncError = (0, helpers.createCustomErrorClass)("SyncError");
exports.SyncError = SyncError;
const PairingFailed = (0, helpers.createCustomErrorClass)("PairingFailed");
exports.PairingFailed = PairingFailed;
const GenuineCheckFailed = (0, helpers.createCustomErrorClass)("GenuineCheckFailed");
exports.GenuineCheckFailed = GenuineCheckFailed;
const LedgerAPI4xx = (0, helpers.createCustomErrorClass)("LedgerAPI4xx");
exports.LedgerAPI4xx = LedgerAPI4xx;
const LedgerAPI5xx = (0, helpers.createCustomErrorClass)("LedgerAPI5xx");
exports.LedgerAPI5xx = LedgerAPI5xx;
const FirmwareOrAppUpdateRequired = (0, helpers.createCustomErrorClass)("FirmwareOrAppUpdateRequired"); // db stuff, no need to translate

exports.FirmwareOrAppUpdateRequired = FirmwareOrAppUpdateRequired;
const NoDBPathGiven = (0, helpers.createCustomErrorClass)("NoDBPathGiven");
exports.NoDBPathGiven = NoDBPathGiven;
const DBWrongPassword = (0, helpers.createCustomErrorClass)("DBWrongPassword");
exports.DBWrongPassword = DBWrongPassword;
const DBNotReset = (0, helpers.createCustomErrorClass)("DBNotReset");
/**
 * TransportError is used for any generic transport errors.
 * e.g. Error thrown when data received by exchanges are incorrect or if exchanged failed to communicate with the device for various reason.
 */

exports.DBNotReset = DBNotReset;

function TransportError(message, id) {
  this.name = "TransportError";
  this.message = message;
  this.stack = new Error().stack;
  this.id = id;
} //$FlowFixMe


TransportError.prototype = new Error();
(0, helpers.addCustomErrorDeserializer)("TransportError", e => new TransportError(e.message, e.id));
const StatusCodes = {
  PIN_REMAINING_ATTEMPTS: 0x63c0,
  INCORRECT_LENGTH: 0x6700,
  COMMAND_INCOMPATIBLE_FILE_STRUCTURE: 0x6981,
  SECURITY_STATUS_NOT_SATISFIED: 0x6982,
  CONDITIONS_OF_USE_NOT_SATISFIED: 0x6985,
  INCORRECT_DATA: 0x6a80,
  NOT_ENOUGH_MEMORY_SPACE: 0x6a84,
  REFERENCED_DATA_NOT_FOUND: 0x6a88,
  FILE_ALREADY_EXISTS: 0x6a89,
  INCORRECT_P1_P2: 0x6b00,
  INS_NOT_SUPPORTED: 0x6d00,
  CLA_NOT_SUPPORTED: 0x6e00,
  TECHNICAL_PROBLEM: 0x6f00,
  OK: 0x9000,
  MEMORY_PROBLEM: 0x9240,
  NO_EF_SELECTED: 0x9400,
  INVALID_OFFSET: 0x9402,
  FILE_NOT_FOUND: 0x9404,
  INCONSISTENT_FILE: 0x9408,
  ALGORITHM_NOT_SUPPORTED: 0x9484,
  INVALID_KCV: 0x9485,
  CODE_NOT_INITIALIZED: 0x9802,
  ACCESS_CONDITION_NOT_FULFILLED: 0x9804,
  CONTRADICTION_SECRET_CODE_STATUS: 0x9808,
  CONTRADICTION_INVALIDATION: 0x9810,
  CODE_BLOCKED: 0x9840,
  MAX_VALUE_REACHED: 0x9850,
  GP_AUTH_FAILED: 0x6300,
  LICENSING: 0x6f42,
  HALTED: 0x6faa
};
exports.StatusCodes = StatusCodes;

function getAltStatusMessage(code) {
  switch (code) {
    // improve text of most common errors
    case 0x6700:
      return "Incorrect length";

    case 0x6982:
      return "Security not satisfied (dongle locked or have invalid access rights)";

    case 0x6985:
      return "Condition of use not satisfied (denied by the user?)";

    case 0x6a80:
      return "Invalid data received";

    case 0x6b00:
      return "Invalid parameter received";
  }

  if (0x6f00 <= code && code <= 0x6fff) {
    return "Internal error, please report";
  }
}
/**
 * Error thrown when a device returned a non success status.
 * the error.statusCode is one of the `StatusCodes` exported by this library.
 */


function TransportStatusError(statusCode) {
  this.name = "TransportStatusError";
  const statusText = Object.keys(StatusCodes).find(k => StatusCodes[k] === statusCode) || "UNKNOWN_ERROR";
  const smsg = getAltStatusMessage(statusCode) || statusText;
  const statusCodeStr = statusCode.toString(16);
  this.message = `Ledger device: ${smsg} (0x${statusCodeStr})`;
  this.stack = new Error().stack;
  this.statusCode = statusCode;
  this.statusText = statusText;
} //$FlowFixMe


TransportStatusError.prototype = new Error();
(0, helpers.addCustomErrorDeserializer)("TransportStatusError", e => new TransportStatusError(e.statusCode));

});

unwrapExports(lib);
var lib_1 = lib.TransportError;
var lib_2 = lib.getAltStatusMessage;
var lib_3 = lib.TransportStatusError;
var lib_4 = lib.StatusCodes;
var lib_5 = lib.DBNotReset;
var lib_6 = lib.DBWrongPassword;
var lib_7 = lib.NoDBPathGiven;
var lib_8 = lib.FirmwareOrAppUpdateRequired;
var lib_9 = lib.LedgerAPI5xx;
var lib_10 = lib.LedgerAPI4xx;
var lib_11 = lib.GenuineCheckFailed;
var lib_12 = lib.PairingFailed;
var lib_13 = lib.SyncError;
var lib_14 = lib.FeeTooHigh;
var lib_15 = lib.FeeRequired;
var lib_16 = lib.FeeNotLoaded;
var lib_17 = lib.CantScanQRCode;
var lib_18 = lib.ETHAddressNonEIP;
var lib_19 = lib.WrongAppForCurrency;
var lib_20 = lib.WrongDeviceForAccount;
var lib_21 = lib.WebsocketConnectionFailed;
var lib_22 = lib.WebsocketConnectionError;
var lib_23 = lib.DeviceShouldStayInApp;
var lib_24 = lib.TransportWebUSBGestureRequired;
var lib_25 = lib.TransportRaceCondition;
var lib_26 = lib.TransportInterfaceNotAvailable;
var lib_27 = lib.TransportOpenUserCancelled;
var lib_28 = lib.UserRefusedOnDevice;
var lib_29 = lib.UserRefusedAllowManager;
var lib_30 = lib.UserRefusedFirmwareUpdate;
var lib_31 = lib.UserRefusedAddress;
var lib_32 = lib.UserRefusedDeviceNameChange;
var lib_33 = lib.UpdateYourApp;
var lib_34 = lib.UpdateIncorrectSig;
var lib_35 = lib.UpdateIncorrectHash;
var lib_36 = lib.UpdateFetchFileFail;
var lib_37 = lib.UnavailableTezosOriginatedAccountSend;
var lib_38 = lib.UnavailableTezosOriginatedAccountReceive;
var lib_39 = lib.RecipientRequired;
var lib_40 = lib.MCUNotGenuineToDashboard;
var lib_41 = lib.UnexpectedBootloader;
var lib_42 = lib.TimeoutTagged;
var lib_43 = lib.RecommendUndelegation;
var lib_44 = lib.RecommendSubAccountsToEmpty;
var lib_45 = lib.PasswordIncorrectError;
var lib_46 = lib.PasswordsDontMatchError;
var lib_47 = lib.GasLessThanEstimate;
var lib_48 = lib.NotSupportedLegacyAddress;
var lib_49 = lib.NotEnoughGas;
var lib_50 = lib.NoAccessToCamera;
var lib_51 = lib.NotEnoughBalanceBecauseDestinationNotCreated;
var lib_52 = lib.NotEnoughSpendableBalance;
var lib_53 = lib.NotEnoughBalanceInParentAccount;
var lib_54 = lib.NotEnoughBalanceToDelegate;
var lib_55 = lib.NotEnoughBalance;
var lib_56 = lib.NoAddressesFound;
var lib_57 = lib.NetworkDown;
var lib_58 = lib.ManagerUninstallBTCDep;
var lib_59 = lib.ManagerNotEnoughSpaceError;
var lib_60 = lib.ManagerFirmwareNotEnoughSpaceError;
var lib_61 = lib.ManagerDeviceLockedError;
var lib_62 = lib.ManagerAppDepUninstallRequired;
var lib_63 = lib.ManagerAppDepInstallRequired;
var lib_64 = lib.ManagerAppRelyOnBTCError;
var lib_65 = lib.ManagerAppAlreadyInstalledError;
var lib_66 = lib.LedgerAPINotAvailable;
var lib_67 = lib.LedgerAPIErrorWithMessage;
var lib_68 = lib.LedgerAPIError;
var lib_69 = lib.UnknownMCU;
var lib_70 = lib.LatestMCUInstalledError;
var lib_71 = lib.InvalidAddressBecauseDestinationIsAlsoSource;
var lib_72 = lib.InvalidAddress;
var lib_73 = lib.InvalidXRPTag;
var lib_74 = lib.HardResetFail;
var lib_75 = lib.FirmwareNotRecognized;
var lib_76 = lib.FeeEstimationFailed;
var lib_77 = lib.EthAppPleaseEnableContractData;
var lib_78 = lib.EnpointConfigError;
var lib_79 = lib.DisconnectedDeviceDuringOperation;
var lib_80 = lib.DisconnectedDevice;
var lib_81 = lib.DeviceSocketNoBulkStatus;
var lib_82 = lib.DeviceSocketFail;
var lib_83 = lib.DeviceNameInvalid;
var lib_84 = lib.DeviceHalted;
var lib_85 = lib.DeviceInOSUExpected;
var lib_86 = lib.DeviceOnDashboardUnexpected;
var lib_87 = lib.DeviceOnDashboardExpected;
var lib_88 = lib.DeviceNotGenuineError;
var lib_89 = lib.DeviceGenuineSocketEarlyClose;
var lib_90 = lib.DeviceAppVerifyNotSupported;
var lib_91 = lib.CurrencyNotSupported;
var lib_92 = lib.CashAddrNotSupported;
var lib_93 = lib.CantOpenDevice;
var lib_94 = lib.BtcUnmatchedApp;
var lib_95 = lib.BluetoothRequired;
var lib_96 = lib.AmountRequired;
var lib_97 = lib.AccountNotSupported;
var lib_98 = lib.AccountNameRequiredError;

/**
 */

/**
 * Transport defines the generic interface to share between node/u2f impl
 * A **Descriptor** is a parametric type that is up to be determined for the implementation.
 * it can be for instance an ID, an file path, a URL,...
 */
class Transport {
  constructor() {
    this.exchangeTimeout = 30000;
    this.unresponsiveTimeout = 15000;
    this._events = new EventEmitter();

    this.send = async (cla, ins, p1, p2, data = Buffer.alloc(0), statusList = [lib_4.OK]) => {
      if (data.length >= 256) {
        throw new lib_1("data.length exceed 256 bytes limit. Got: " + data.length, "DataLengthTooBig");
      }

      const response = await this.exchange(Buffer.concat([Buffer.from([cla, ins, p1, p2]), Buffer.from([data.length]), data]));
      const sw = response.readUInt16BE(response.length - 2);

      if (!statusList.some(s => s === sw)) {
        throw new lib_3(sw);
      }

      return response;
    };

    this.exchangeBusyPromise = void 0;

    this.exchangeAtomicImpl = async f => {
      if (this.exchangeBusyPromise) {
        throw new lib_25("An action was already pending on the Ledger device. Please deny or reconnect.");
      }

      let resolveBusy;
      const busyPromise = new Promise(r => {
        resolveBusy = r;
      });
      this.exchangeBusyPromise = busyPromise;
      let unresponsiveReached = false;
      const timeout = setTimeout(() => {
        unresponsiveReached = true;
        this.emit("unresponsive");
      }, this.unresponsiveTimeout);

      try {
        const res = await f();

        if (unresponsiveReached) {
          this.emit("responsive");
        }

        return res;
      } finally {
        clearTimeout(timeout);
        if (resolveBusy) resolveBusy();
        this.exchangeBusyPromise = null;
      }
    };

    this._appAPIlock = null;
  }

  /**
   * low level api to communicate with the device
   * This method is for implementations to implement but should not be directly called.
   * Instead, the recommanded way is to use send() method
   * @param apdu the data to send
   * @return a Promise of response data
   */
  exchange(_apdu) {
    throw new Error("exchange not implemented");
  }
  /**
   * set the "scramble key" for the next exchanges with the device.
   * Each App can have a different scramble key and they internally will set it at instanciation.
   * @param key the scramble key
   */


  setScrambleKey(_key) {}
  /**
   * close the exchange with the device.
   * @return a Promise that ends when the transport is closed.
   */


  close() {
    return Promise.resolve();
  }

  /**
   * Listen to an event on an instance of transport.
   * Transport implementation can have specific events. Here is the common events:
   * * `"disconnect"` : triggered if Transport is disconnected
   */
  on(eventName, cb) {
    this._events.on(eventName, cb);
  }
  /**
   * Stop listening to an event on an instance of transport.
   */


  off(eventName, cb) {
    this._events.removeListener(eventName, cb);
  }

  emit(event, ...args) {
    this._events.emit(event, ...args);
  }
  /**
   * Enable or not logs of the binary exchange
   */


  setDebugMode() {
    console.warn("setDebugMode is deprecated. use @ledgerhq/logs instead. No logs are emitted in this anymore.");
  }
  /**
   * Set a timeout (in milliseconds) for the exchange call. Only some transport might implement it. (e.g. U2F)
   */


  setExchangeTimeout(exchangeTimeout) {
    this.exchangeTimeout = exchangeTimeout;
  }
  /**
   * Define the delay before emitting "unresponsive" on an exchange that does not respond
   */


  setExchangeUnresponsiveTimeout(unresponsiveTimeout) {
    this.unresponsiveTimeout = unresponsiveTimeout;
  }
  /**
   * wrapper on top of exchange to simplify work of the implementation.
   * @param cla
   * @param ins
   * @param p1
   * @param p2
   * @param data
   * @param statusList is a list of accepted status code (shorts). [0x9000] by default
   * @return a Promise of response buffer
   */


  /**
   * create() allows to open the first descriptor available or
   * throw if there is none or if timeout is reached.
   * This is a light helper, alternative to using listen() and open() (that you may need for any more advanced usecase)
   * @example
  TransportFoo.create().then(transport => ...)
   */
  static create(openTimeout = 3000, listenTimeout) {
    return new Promise((resolve, reject) => {
      let found = false;
      const sub = this.listen({
        next: e => {
          found = true;
          if (sub) sub.unsubscribe();
          if (listenTimeoutId) clearTimeout(listenTimeoutId);
          this.open(e.descriptor, openTimeout).then(resolve, reject);
        },
        error: e => {
          if (listenTimeoutId) clearTimeout(listenTimeoutId);
          reject(e);
        },
        complete: () => {
          if (listenTimeoutId) clearTimeout(listenTimeoutId);

          if (!found) {
            reject(new lib_1(this.ErrorMessage_NoDeviceFound, "NoDeviceFound"));
          }
        }
      });
      const listenTimeoutId = listenTimeout ? setTimeout(() => {
        sub.unsubscribe();
        reject(new lib_1(this.ErrorMessage_ListenTimeout, "ListenTimeout"));
      }, listenTimeout) : null;
    });
  }

  decorateAppAPIMethods(self, methods, scrambleKey) {
    for (let methodName of methods) {
      self[methodName] = this.decorateAppAPIMethod(methodName, self[methodName], self, scrambleKey);
    }
  }

  decorateAppAPIMethod(methodName, f, ctx, scrambleKey) {
    return async (...args) => {
      const {
        _appAPIlock
      } = this;

      if (_appAPIlock) {
        return Promise.reject(new lib_1("Ledger Device is busy (lock " + _appAPIlock + ")", "TransportLocked"));
      }

      try {
        this._appAPIlock = methodName;
        this.setScrambleKey(scrambleKey);
        return await f.apply(ctx, args);
      } finally {
        this._appAPIlock = null;
      }
    };
  }

}
Transport.isSupported = void 0;
Transport.list = void 0;
Transport.listen = void 0;
Transport.open = void 0;
Transport.ErrorMessage_ListenTimeout = "No Ledger device found (timeout)";
Transport.ErrorMessage_NoDeviceFound = "No Ledger device found";

var lib$1 = createCommonjsModule(function (module, exports) {

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.listen = exports.log = void 0;

/**
 * A Log object
 */
let id = 0;
const subscribers = [];
/**
 * log something
 * @param type a namespaced identifier of the log (it is not a level like "debug", "error" but more like "apdu-in", "apdu-out", etc...)
 * @param message a clear message of the log associated to the type
 */

const log = (type, message, data) => {
  const obj = {
    type,
    id: String(++id),
    date: new Date()
  };
  if (message) obj.message = message;
  if (data) obj.data = data;
  dispatch(obj);
};
/**
 * listen to logs.
 * @param cb that is called for each future log() with the Log object
 * @return a function that can be called to unsubscribe the listener
 */


exports.log = log;

const listen = cb => {
  subscribers.push(cb);
  return () => {
    const i = subscribers.indexOf(cb);

    if (i !== -1) {
      // equivalent of subscribers.splice(i, 1) // https://twitter.com/Rich_Harris/status/1125850391155965952
      subscribers[i] = subscribers[subscribers.length - 1];
      subscribers.pop();
    }
  };
};

exports.listen = listen;

function dispatch(log) {
  for (let i = 0; i < subscribers.length; i++) {
    try {
      subscribers[i](log);
    } catch (e) {
      console.error(e);
    }
  }
} // for debug purpose


commonjsGlobal.__ledgerLogsListen = listen;

});

unwrapExports(lib$1);
var lib_1$1 = lib$1.listen;
var lib_2$1 = lib$1.log;

export { Transport as T, lib as a, commonjsGlobal as b, createCommonjsModule as c, lib_2$1 as d, lib_79 as e, lib_26 as f, lib_80 as g, lib_24 as h, lib_27 as i, lib_1 as j, lib$1 as l, unwrapExports as u };
//# sourceMappingURL=lazy-chunk-index.es.js.map
