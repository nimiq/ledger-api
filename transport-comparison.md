# Transport comparison

Note: the behavior of the low level api tends to vary greatly with:
- used transport type: U2F, WebUSB, WebHID, WebBluetooth
- used device: Ledger Nano X or Ledger Nano S
- used Operating system: Windows / Linux / Mac / Android
- used browser: Chromium based / Firefox / ...
- also Ledger firmware version, app version and browser version play a role

Some test conditions of interest:
- Ledger not connected yet
- Ledger connected
- Ledger was connected but relocked
- Ledger connected but in another app
- Ledger connected but with old app version
- user approved action on Ledger
- user denied action on Ledger
- user cancel in UI
- device selector closed without selecting a device
- switching between ledger dashboard / apps while device selector open
- request not in the context of an active user activation / interaction
- Ledger already handling another request (from another tab)
- additionally for U2F:
  - user cancel and immediately make another request
  - connect timed out
  - request timed out

General notes:
- The ledger only supports one call at a time.
- If the ledger is busy with another call it throws an exception that it is busy. The ledger API however only knows, if
  the ledger is busy by another call from this same page and same API instance.
- For all api types but U2F the user must select a device to use / grant permission to use that device. The device
  selector opens as browser popup. The request for a device has to happen in the context of a user interaction / user
  activation. Our api allows for initiating a request without user interaction and will then ask for a manual `connect`
  call in the context of a user interaction only if needed.
- The Ledger reports the dashboard and applications as separate devices depending on the the app's
  [supported interfaces](https://www.ledger.com/windows-10-update-sunsetting-u2f-tunnel-transport-for-ledger-devices/)
  to circumvent some Windows issues which can not handle multiple different combinations of enabled interfaces for a
  single USB device. This means that the user has to give permission for the "device" associated with the Nimiq app.
- Surprisingly, on the Nano X the dashboard and Nimiq App are not reported as different apps, so seem to share the same
  interface. Nonetheless, a connect/disconnect happens when switching between the dashboard and the Nimiq app.
- If the ledger is locked while the nimiq app (or another app throwing that same exception) was running, an exception
  gets thrown. The error code for this was 0x6982 before and got translated to a "dongle locked" error, but this
  seems to have changed. Get public key / address requests now throw a 0x6804 UNKNOWN_ERROR; other requests don't
  throw and just stay pending until unlocked. No exception gets thrown when the Ledger is locked on the dashboard or
  locked when just being connected. getAppConfiguration can be called even when the app is locked.
- Requests that were cancelled via request.cancel() are not actually cancelled on the ledger and keep the ledger busy
  until the user confirms/declines or the request times out (for U2F).

## WebUSB

See https://caniuse.com/#feat=webusb for browser support.

General characteristics:
- No timeouts.
- The browser device selector updates when devices get connected / disconnected (or when an app gets opened on the
  Ledger which is a device change).

Special characteristics:
- The Ledger Nano X does not appear in the device selector in Windows. It can therefore not be used with WebUSB under
  Window. This is due to USB driver compatibility issues apparently. See https://github.com/LedgerHQ/ledgerjs/issues/456
  and https://github.com/WICG/webusb/issues/143. Enabling `chrome://flags/#new-usb-backend` however did unfortunately
  not help, getting an [`Access denied` exception](https://github.com/WICG/webusb/issues/184).
- Under Linux, Chrome is able to remember a given device permission which means that after the permission was given
  once, that device can be used in the future without requesting a device again (if the device we have the permission
  for is connected) and without the need to run a request in the context of a user interaction.
- Under Windows, Chrome remembers a given device permission only until the device disconnects (or user opens app /
  dashboard). The permission survives reloads though. The experimental #new-usb-backend is able to remember device
  permissions but is unfortunately currently not usable as stated above.
- Works fine with Android Chrome. Can remember a given permission (does not need to show the device selector and does
  not require a user interaction if permission was given previously) but shows a "Allow the app Chrome to access the USB
  device?" native modal, regardless of whether "Use by default for this USB device" gets ticked.

## WebHID

Still experimental and not enabled by default. It is not a W3C Standard nor is it on the W3C Standards Track. The test
results here should be updated when the api is more stable.

General characteristics:
- No timeouts.
- The browser device selector does not update (yet?) when devices get connected / disconnected (or when an app gets
  opened on the Ledger which is a device change).
- Currently, a HID permission is only valid until the device is disconnected. This results in a device selection popup
  every time the Ledger is reconnected (or changes to another app or the dashboard, where Ledger reports different
  device descriptors, i.e. appears as a different device). This also requires a user gesture every time.
- The HID device selection popup does not update on changes, for example on switch from Ledger dashboard to app or when
  Ledger gets connected.
- HID does not emit disconnects immediately but only at next request.

Special characteristics:
- Currently crashes the page on Chrome Android.

## WebBluetooth

See https://caniuse.com/#feat=web-bluetooth for browser support. Support also varies by
[operating system](https://github.com/WebBluetoothCG/web-bluetooth/blob/gh-pages/implementation-status.md).
Notably, Linux is currently not supported without a flag, same as `getDevices` and persistent device permissions.

General characteristics:
- No timeouts.
- The browser device selector updates when devices get get paired / become available (or when an app gets opened on the
  Ledger which is a device change).

Specific characteristics:
- Still very experimental on Linux. For me pairing via the browser device selector did not work. Had to pair upfront via
  the OS. The permission is only valid until the device is disconnected or the page reloaded. After the device changed,
  have to pair anew and even delete the bluetooth device first.
- Works pretty well on Windows. Pairing via the browser device selector did not work; had to pair upfront via the OS but
  that needs to be done only once. After that, the browser device selector works, even if bluetooth gets disabled in
  between. The permission is only valid until the device is disconnected or the page reloaded.
- Pairing in Android Chrome did not work for me.

## WebAuthentication

See https://caniuse.com/#feat=webauthn for browser support.

General characteristics:
- Can run without user activation / user interaction and requires no permission / device selection.
- Shows a browser popup, also for Chrome, different to U2F.
- As WebAuthn is initially for short lived authentications, WebAuthn requests timeout after ~30s but the Ledger firmware
  / app implements a heartbeat to try to mitigate timeouts. Other than for U2F this works reliably, including on Chrome
  and for Nano X. On the dashboard, the heartbeat does not seem to be active.
- The WebAuthn api can not reliably detect whether a device is (still) connected.
- The WebAuthn api can not detect whether a connected device is a Nano S or Nano X.
- Having U2F/WebAuthn enabled is bad for the user's privacy as addresses can be fetched without requiring any
  permission. We should disable U2F support in our app in the future.

Special characteristics:
- Causes native Windows security popups in Windows 10. These have to be ignored without clicking cancel on them.
- In Chrome, when a timeout occurs, execution continues only after the popup is closed, i.e. it only retries after the
  popup gets closed.
- Although Chrome for Android and Firefox for Android both support WebAuthn according to caniuse.com they do not seem to
  be compatible with this api
- For the Ledger Nano S the request can already be initiated while the Ledger is not connected yet, not unlocked yet or
  the Nimiq app not open yet. The request gets correctly picked up by the device once the app is open.
- The Ledger Nano X only processes the request if it is already in the Nimiq app before the request is initiated.
- On lost connection to the host (e.g. by the user clicking cancel in the browser popup), the Nano X keeps the old
  request active and crashes the app when rejecting / confirming that request.
- After a request was sent the Nano X before the app was opened or the Nimiq App crashed, the Nano X needs to be
  restarted to be able to process a WebAuthn request again. Just re-opening the app does not seem to be sufficient, at
  least if the new request requires a UI or is the same request?
- Due to the heartbeat U2F is heavy on the call stack and might crash the Ledger app according to Ledger, but this has
  not been observed yet in our app.
- Can not connect to a Ledger if two are attached at the same time.

## U2F

Legacy implementation that depends on deprecated Fido U2F API. See https://caniuse.com/#feat=u2f for browser support.

General characteristics:
- Can run without user activation / user interaction and requires no permission / device selection.
- As U2F is initially for short lived authentications, U2F requests timeout after ~30s but the Ledger firmware / app
  implements a heartbeat to try to mitigate timeouts.
- The U2F api can not reliably detect whether a device is (still) connected.
- The U2F api can not detect whether a connected device is a Nano S or Nano X.
- Having U2F enabled is bad for the user's privacy as addresses can be fetched without requiring any permission. We
  should disable U2F support in our app in the future.

Special characteristics:
- Causes native Windows security popups in Windows 10. These have to be ignored without clicking cancel on them.
- Causes Firefox internal popup in Firefox which should also be ignored.
- Although Firefox for Android supports U2F according to caniuse.com it does not seem to be compatible with this api.
- The heartbeat does not mitigate timeouts on newer versions of Chrome anymore. On Firefox it does work though. But also
  on Firefox timeouts can occur of course when the Ledger is not connected yet to respond to a heartbeat.
- The heartbeat does not work with the Nano X.
- Previously, a "timeout" exception got thrown on u2f timeouts, but now it's generic "U2F DEVICE_INELIGIBLE" in Chrome
  and "U2F OTHER_ERROR" in Firefox.
- The Ledger Nano S clears a timed-out request on the device on newer firmware. A new request can then be sent
  subsequently. This also means though that transaction signing requests with long data can not be displayed completely
  before timeout.
- On lost connection to the host (e.g. by the user clicking cancel in the browser popup), the Nano X keeps the old
  request active and crashes the app when rejecting / confirming that request.
- The Ledger Nano X does not clear a timed-out request and the request is not replaceable. Instead the timed-out request
  stays active on the Nano X and the Nimiq app freezes once the request is confirmed / rejected.
- For the Ledger Nano S the request can already be initiated while the Ledger is not connected yet, not unlocked yet or
  the Nimiq app not open yet. The request gets correctly picked up by the device once the app is open.
- The Ledger Nano X only processes the request if it is already in the Nimiq app before the request is initiated.
- If a U2F request is not responded to fairly quickly on the Nano X, it shows up a second time with the second one
  crashing the app on approval / rejection.
- After a request timed-out on the Nano X or was sent the Nano X before the app was opened or if the Nimiq App crashed,
  the Nano X needs to be restarted to be able to process a WebAuthn request again. Just re-opening the app does not seem
  to be sufficient, at least if the new request requires a UI or is the same request?
- Due to the heartbeat U2F is heavy on the call stack and might crash the Ledger app according to Ledger, but this has
  not been observed yet in our app.
- Can not connect to a Ledger if two are attached at the same time.

## Previous U2F results for old versions

These test results were for older Nimiq Apps / older Ledger firmwares on Nano S in conjuction with U2F and are not
really that relevant anymore, but still included here for completeness:

Notes about app versions < 1.4.3 (?) or older firmwares:
- If the ledger locks during a signTransaction request and the "dongle locked" exception gets thrown after some while
  and the user then unlocks the ledger again, the request data is gone or not displayed (amount, recipient, fee,
  network, extra data etc). If the user then rejects/confirms, the ledger freezes and can not be unfrozen. This did
  not occur with this api, as we replaced that call after unlock. That behavior has now been removed though, as it's
  not relevant for newer versions anymore.

Notes about app versions < 1.4.1 / 1.4.0:
- App versions < 1.4.0 are incompatible with Chrome 72+, see https://github.com/LedgerHQ/ledgerjs/issues/306.
- App versions < 1.4.1 are incompatible with Chrome 72-73

Notes about app versions < 1.3.1:
- Versions < 1.3.1 did not have a heartbeat to avoid timeouts
- For requests with display on the ledger, the ledger keeps displaying the request even if it timed out. When the
  user confirms or declines that request after the timeout the ledger ignores that and freezes on second press.
- After a request timed out, it is possible to send a new request to the ledger essentially replacing the old
  request. If the ledger is still displaying the UI from the previous timed out request and the new request also has
  a UI, the old UI also gets replaced. The animation of the new request starts at the beginning.
- Although a previous request can be replaced immediately after the timeout exception (no device busy exception gets
  thrown and the UI gets replaced), the buttons still seem to be assigned to the previous request if there is no
  wait time between the requests. Wait time <1s is too short. Wait times between 1s and 1.5s behave strange as the
  old request doesn't get replaced at all. 1.5s seems to be reliable. At that time, the signTransaction UI also
  forms a nice loop with the replaced UI.
- If the user confirms or declines during the wait time nothing happens (or freeze at second button press) which
  is a bad user experience but there is nothing we can do about it.
- If the ledger froze, it gets unfrozen by sending a new request. If the request has a UI, the UI gets displayed,
  otherwise the Nimiq app gets displayed. If the user confirms the new request, the app afterwards behaves normal.
  If he declines the request though, any request afterwards seems to time out and the nimiq ledger app needs to be
  restarted. This is a corner case that is not covered in this api.

Notes about old Firefox versions:
- Old Firefox implementation of U2F (when enabled in about:config) did not seem to be compatible with ledger and
  threw "U2F DEVICE_INELIGIBLE". Previously, we translated that error into the "not supported" error, but the current
  api doesn't do so anymore as the current Firefox version is compatible and DEVICE_INELIGIBLE gets now thrown
  on timeouts (see above).

