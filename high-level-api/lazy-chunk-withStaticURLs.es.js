import { b as buffer } from './lazy-chunk-index.es.js';
import { T as Transport, b as TransportError } from './lazy-chunk-Transport.es.js';
import { l as log } from './lazy-chunk-index.es3.js';
import './lazy-chunk-events.es.js';
import './lazy-chunk-_commonjsHelpers.es.js';

// For avoiding bundling the unnecessary axios dependency in @ledgerhq/hw-transport-http, we use fetch instead and
// shim the required api parts of axios.
function axiosShim({ url, method, headers, data, }) {
    return fetch(url, {
        method,
        headers,
        body: data,
    });
}

var __awaiter$2 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/**
 * HTTP transport implementation
 */
class HttpTransport extends Transport {
    static open(url, timeout) {
        return __awaiter$2(this, void 0, void 0, function* () {
            yield HttpTransport.check(url, timeout);
            return new HttpTransport(url);
        });
    }
    constructor(url) {
        super();
        this.url = url;
    }
    exchange(apdu) {
        return __awaiter$2(this, void 0, void 0, function* () {
            const apduHex = apdu.toString("hex");
            log("apdu", "=> " + apduHex);
            const response = yield axiosShim({
                method: "POST",
                url: this.url,
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                data: JSON.stringify({
                    apduHex,
                }),
            });
            if (response.status !== 200) {
                throw new TransportError("failed to communicate to server. code=" + response.status, "HttpTransportStatus" + response.status);
            }
            const body = yield response.data;
            if (body.error)
                throw body.error;
            log("apdu", "<= " + body.data);
            return buffer.Buffer.from(body.data, "hex");
        });
    }
    setScrambleKey() { }
    close() {
        return Promise.resolve();
    }
}
HttpTransport.isSupported = () => Promise.resolve(typeof fetch === "function");
// this transport is not discoverable
HttpTransport.list = () => Promise.resolve([]);
HttpTransport.listen = (_observer) => ({
    unsubscribe: () => { },
});
HttpTransport.check = (url, timeout = 5000) => __awaiter$2(void 0, void 0, void 0, function* () {
    const response = yield axiosShim({
        url,
        timeout,
    });
    if (response.status !== 200) {
        throw new TransportError("failed to access HttpTransport(" + url + "): status " + response.status, "HttpTransportNotAccessible");
    }
});
var HttpTransport$1 = HttpTransport;

var global = window;

var __awaiter$1 = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const WebSocket = global.WebSocket || require("ws");
/**
 * WebSocket transport implementation
 */
class WebSocketTransport extends Transport {
    static open(url) {
        return __awaiter$1(this, void 0, void 0, function* () {
            const exchangeMethods = yield new Promise((resolve, reject) => {
                try {
                    const socket = new WebSocket(url);
                    const exchangeMethods = {
                        resolveExchange: (_b) => { },
                        rejectExchange: (_e) => { },
                        onDisconnect: () => { },
                        close: () => socket.close(),
                        send: msg => socket.send(msg),
                    };
                    socket.onopen = () => {
                        socket.send("open");
                    };
                    socket.onerror = e => {
                        exchangeMethods.onDisconnect();
                        reject(e);
                    };
                    socket.onclose = () => {
                        exchangeMethods.onDisconnect();
                        reject(new TransportError("OpenFailed", "OpenFailed"));
                    };
                    socket.onmessage = e => {
                        if (typeof e.data !== "string")
                            return;
                        const data = JSON.parse(e.data);
                        switch (data.type) {
                            case "opened":
                                return resolve(exchangeMethods);
                            case "error":
                                reject(new Error(data.error));
                                return exchangeMethods.rejectExchange(new TransportError(data.error, "WSError"));
                            case "response":
                                return exchangeMethods.resolveExchange(buffer.Buffer.from(data.data, "hex"));
                        }
                    };
                }
                catch (e) {
                    reject(e);
                }
            });
            return new WebSocketTransport(exchangeMethods);
        });
    }
    constructor(hook) {
        super();
        this.hook = hook;
        hook.onDisconnect = () => {
            this.emit("disconnect");
            this.hook.rejectExchange(new TransportError("WebSocket disconnected", "WSDisconnect"));
        };
    }
    exchange(apdu) {
        return __awaiter$1(this, void 0, void 0, function* () {
            const hex = apdu.toString("hex");
            log("apdu", "=> " + hex);
            const res = yield new Promise((resolve, reject) => {
                this.hook.rejectExchange = (e) => reject(e);
                this.hook.resolveExchange = (b) => resolve(b);
                this.hook.send(hex);
            });
            log("apdu", "<= " + res.toString("hex"));
            return res;
        });
    }
    setScrambleKey() { }
    close() {
        return __awaiter$1(this, void 0, void 0, function* () {
            this.hook.close();
            return new Promise(success => {
                setTimeout(() => {
                    success(undefined);
                }, 200);
            });
        });
    }
}
WebSocketTransport.isSupported = () => Promise.resolve(typeof WebSocket === "function");
// this transport is not discoverable
WebSocketTransport.list = () => Promise.resolve([]);
WebSocketTransport.listen = (_observer) => ({
    unsubscribe: () => { },
});
WebSocketTransport.check = (url, timeout = 5000) => __awaiter$1(void 0, void 0, void 0, function* () {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(url);
        let success = false;
        setTimeout(() => {
            socket.close();
        }, timeout);
        socket.onopen = () => {
            success = true;
            socket.close();
        };
        socket.onclose = () => {
            if (success)
                resolve(undefined);
            else {
                reject(new TransportError("failed to access WebSocketTransport(" + url + ")", "WebSocketTransportNotAccessible"));
            }
        };
        socket.onerror = () => {
            reject(new TransportError("failed to access WebSocketTransport(" + url + "): error", "WebSocketTransportNotAccessible"));
        };
    });
});

var __awaiter = (undefined && undefined.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const getTransport = url => (!url.startsWith("ws") ? HttpTransport$1 : WebSocketTransport);
const inferURLs = (urls) => __awaiter(void 0, void 0, void 0, function* () {
    const r = yield (typeof urls === "function" ? urls() : urls);
    return typeof r === "string" ? [r] : r;
});
var withStaticURLs = (urls) => {
    class StaticTransport extends Transport {
    }
    StaticTransport.isSupported = HttpTransport$1.isSupported;
    StaticTransport.list = () => inferURLs(urls)
        .then(urls => Promise.all(urls.map(url => getTransport(url)
        .check(url)
        .then(() => [url])
        .catch(() => []))))
        .then(arrs => arrs.reduce((acc, a) => acc.concat(a), []));
    StaticTransport.listen = (observer) => {
        let unsubscribed = false;
        const seen = {};
        function checkLoop() {
            if (unsubscribed)
                return;
            inferURLs(urls)
                .then(urls => Promise.all(urls.map((url) => __awaiter(this, void 0, void 0, function* () {
                if (unsubscribed)
                    return;
                try {
                    yield getTransport(url).check(url);
                    if (unsubscribed)
                        return;
                    if (!seen[url]) {
                        seen[url] = 1;
                        observer.next({
                            type: "add",
                            descriptor: url,
                        });
                    }
                }
                catch (e) {
                    // nothing
                    if (seen[url]) {
                        delete seen[url];
                        observer.next({
                            type: "remove",
                            descriptor: url,
                        });
                    }
                }
            }))))
                .then(() => new Promise(success => setTimeout(success, 5000)))
                .then(checkLoop);
        }
        checkLoop();
        return {
            unsubscribe: () => {
                unsubscribed = true;
            },
        };
    };
    StaticTransport.open = url => getTransport(url).open(url);
    return StaticTransport;
};

export { withStaticURLs as default };
//# sourceMappingURL=lazy-chunk-withStaticURLs.es.js.map
