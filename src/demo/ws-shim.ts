// @ledgerhq/hw-transport-http falls back to the NodeJS WebSocket implementation from package ws, if no global WebSocket
// is available. In browsers, the native WebSocket is available, therefore we avoid bundling the unnecessary package.
export default globalThis.WebSocket;
