// Config for the demo page. For the library build config, see vite.config.ts.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
    root: 'src/demo',
    base: './',
    resolve: {
        alias: {
            // Shim unnecessary axios and ws dependencies of @ledgerhq/hw-transport-http.
            axios: fileURLToPath(new URL('./src/demo/axios-shim.ts', import.meta.url)),
            ws: fileURLToPath(new URL('./src/demo/ws-shim.ts', import.meta.url)),
        },
    },
    plugins: [
        // The Ledger transport apis require https.
        basicSsl(),
        // Polyfill NodeJS builtins and globals used by some dependencies, e.g. Buffer in @ledgerhq/hw-transport.
        // Also see section Prerequisites in the README.
        nodePolyfills({
            include: ['buffer', 'stream', 'events', 'util'],
            globals: { Buffer: true, global: true, process: true },
        }),
    ],
    build: {
        outDir: '../../dist/demo',
        emptyOutDir: true,
        sourcemap: true,
    },
});
