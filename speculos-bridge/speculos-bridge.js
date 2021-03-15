// eslint-disable-next-line import/no-extraneous-dependencies
const SpeculosTransport = require('@ledgerhq/hw-transport-node-speculos').default;
// eslint-disable-next-line import/no-extraneous-dependencies
const WebSocketServer = require('ws').Server;

const WEBSOCKET_PORT = 9999;
const SPECULOS_PORT = 40000;

console.log(`Forward WebSocket connections at port ${WEBSOCKET_PORT} to Speculos TCP socket at port ${SPECULOS_PORT}`);

const webSocketServer = new WebSocketServer({ port: WEBSOCKET_PORT });

console.log('Listening for WebSocket connections.');
let connectionCounter = 0;

webSocketServer.on('connection', (webSocket) => {
    const id = ++connectionCounter;
    console.log(`New WebSocket connection ${id} established.`);

    let heartbeatTimeout = -1;
    const heartbeat = () => {
        clearTimeout(heartbeatTimeout);
        // send the next ping in 20s
        heartbeatTimeout = setTimeout(() => {
            heartbeatTimeout = setTimeout(() => {
                console.log(`WebSocket ${id} heartbeat timed out.`);
                webSocket.terminate();
            }, 30000);
            webSocket.ping();
        }, 20000);
    };
    webSocket.on('pong', heartbeat);
    heartbeat();

    const speculosTransportPromise = SpeculosTransport.open({ apduPort: SPECULOS_PORT });
    speculosTransportPromise.then(
        (speculosTransport) => speculosTransport.on('disconnect', () => {
            console.log(`Speculos transport for WebSocket ${id} disconnected.`);
            webSocket.close();
        }),
        () => webSocket.close(),
    );

    webSocket.on('message', async (message) => {
        // See @ledgerhq/hw-transport-http/WebSocketTransport for expected response format
        if (message === 'open') {
            webSocket.send(JSON.stringify({ type: 'opened' }));
            return;
        }
        console.log(`WebSocket ${id} => ${message}`);
        try {
            const speculosTransport = await speculosTransportPromise;
            const response = (await speculosTransport.exchange(Buffer.from(message, 'hex'))).toString('hex');
            console.log(`WebSocket ${id} <= ${response}`);
            webSocket.send(JSON.stringify({
                type: 'response',
                data: response,
            }));
        } catch (error) {
            webSocket.send(JSON.stringify({
                type: 'error',
                error,
            }));
        }
    });
    webSocket.on('close', async (code, reason) => {
        console.log(`WebSocket ${id} disconnected: ${code}${reason ? ` - ${reason}` : ''}`);
        clearTimeout(heartbeatTimeout);
        (await speculosTransportPromise).close();
    });
    webSocket.on('error', async (error) => {
        console.log(`WebSocket ${id} errored: ${error}`);
        clearTimeout(heartbeatTimeout);
        (await speculosTransportPromise).close();
    });
});
