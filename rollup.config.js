import fs from 'fs';
import path from 'path';

import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import sourcemaps from 'rollup-plugin-sourcemaps';
import { eslint } from 'rollup-plugin-eslint';

// demo page specific imports
import alias from '@rollup/plugin-alias';
import nodePolyfills from 'rollup-plugin-node-polyfills';
import copy from 'rollup-plugin-copy';
import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';

// change sourcemap paths to a separate protocol and path such that they appear in a "virtual folder" in dev tools
const SOURCE_MAP_PREFIX = 'source-mapped://source-mapped/';
function sourcemapPathTransform(relativePath) {
    return `${SOURCE_MAP_PREFIX}${path.relative('../../', relativePath)}`;
}

// Fixed eslint plugin that runs on original typescript files instead of transpiled js files, see
// https://github.com/TrySound/rollup-plugin-eslint/issues/42
function fixedEslint(options) {
    const original = eslint(options);
    const originalLint = original.transform.bind(original);
    return {
        name: original.name,
        load(id) {
            if (id.endsWith('.ts')) {
                const code = fs.readFileSync(id, 'utf8');
                originalLint(code, id);
            }
            return null;
        },
        transform(code, id) {
            if (id.endsWith('.ts')) return null;
            return originalLint(code, id);
        },
    };
}

export default (commandLineArgs) => {
    const isProduction = commandLineArgs.configProduction; // called with --configProduction?
    const isServing = commandLineArgs.configServe;

    const outputFormats = isProduction ? ['es', 'cjs'] : ['es'];

    const highLevelApiConfig = {
        input: 'src/high-level-api/ledger-api.ts',
        output: outputFormats.map((format) => ({
            format,
            dir: 'dist', // not dist/high-level-api as ts plugin creates sub folder structure in dist as in rootDir
            entryFileNames: 'high-level-api/[name].[format].js',
            chunkFileNames: 'high-level-api/lazy-chunk-[name].[format].js',
            exports: 'named', // enable multiple exports at the cost that cjs bundle must be imported as bundle.default
            sourcemap: true,
            sourcemapPathTransform,
        })),
        manualChunks: {
            buffer: ['buffer'], // avoid that Buffer polyfill gets bundled into ledger-api chunk from where it is
            // imported by other chunks, causing a circular dependency and an additional entry chunk that re-exports
            // everything from ledger-api but Buffer.
        },
        plugins: [
            fixedEslint({
                throwOnError: isProduction,
            }),
            typescript({
                include: ['src/high-level-api/**', 'src/low-level-api/**', 'src/lib/**'],
                declaration: true,
                declarationDir: 'dist',
                rootDir: 'src', // temporary, see https://github.com/rollup/plugins/issues/61#issuecomment-596270901
                noEmitOnError: isProduction,
            }),
            resolve({
                browser: true, // use browser versions of packages if defined in their package.json
                preferBuiltins: true, // don't touch imports of node builtins as these will be handled by nodePolyfills
            }),
            sourcemaps(),
            commonjs({
                namedExports: {
                    'u2f-api': ['sign', 'isSupported'],
                },
            }),
            nodePolyfills({
                include: [
                    'src/**/*',
                    'node_modules/**/*.js',
                ],
            }),
        ],
        watch: {
            clearScreen: false,
        },
    };

    const lowLevelApiConfig = {
        input: 'src/low-level-api/low-level-api.ts',
        output: outputFormats.map((format) => ({
            format,
            dir: 'dist', // not dist/low-level-api as ts plugin creates sub folder structure in dist as in rootDir
            entryFileNames: 'low-level-api/[name].[format].js',
            sourcemap: true,
            sourcemapPathTransform,
        })),
        plugins: [
            fixedEslint({
                throwOnError: isProduction,
            }),
            typescript({
                include: ['src/low-level-api/**', 'src/lib/**'],
                declaration: true,
                declarationDir: 'dist',
                rootDir: 'src', // temporary, see https://github.com/rollup/plugins/issues/61#issuecomment-596270901
                noEmitOnError: isProduction,
            }),
            resolve({
                browser: true, // use browser versions of packages if defined in their package.json
            }),
            sourcemaps(),
            commonjs(),
        ],
        watch: {
            clearScreen: false,
        },
    };

    const demoConfig = {
        input: 'src/demo/index.ts',
        external: ['../low-level-api/low-level-api.es.js', '../high-level-api/ledger-api.es.js'],
        output: {
            dir: 'dist/demo',
            format: 'es',
            sourcemap: true,
            sourcemapPathTransform,
        },
        plugins: [
            fixedEslint({
                throwOnError: isProduction,
            }),
            typescript({
                include: ['src/demo/**', 'src/lib/**'],
                noEmitOnError: isProduction,
            }),
            // typescript needs the import as specified to find the .d.ts file but for actual import we need .es.js file
            alias({
                entries: {
                    '../../dist/low-level-api/low-level-api': '../low-level-api/low-level-api.es.js',
                    '../../dist/high-level-api/ledger-api': '../high-level-api/ledger-api.es.js',
                },
            }),
            resolve({
                preferBuiltins: true, // don't touch imports of node builtins as these will be handled by nodePolyfills
            }),
            sourcemaps(),
            commonjs({
                namedExports: {
                    'u2f-api': ['sign', 'isSupported'],
                },
            }),
            nodePolyfills({
                include: [
                    'src/**/*',
                    'node_modules/**/*.js',
                ],
            }),
            copy({
                targets: [{
                    src: 'src/demo/template.html',
                    dest: 'dist/demo',
                    rename: 'index.html',
                }],
            }),
        ],
        watch: {
            clearScreen: false,
        },
    };

    if (isServing) {
        // Taken from https://github.com/webpack/webpack-dev-server/commit/e97741c84ca69913283ae5d48cc3f4e0cf8334e3
        // Note that webpack-dev-server in the mean time switched to generating a separate certificate per project but
        // we don't need that here.
        const sslCertificate = fs.readFileSync('ssl/server.pem');
        const httpsOptions = {
            key: sslCertificate,
            cert: sslCertificate,
        };

        demoConfig.plugins = [
            ...demoConfig.plugins,
            serve({
                // list dist/demo to make index.html available at server root
                contentBase: ['dist', 'dist/demo'],
                // ledger transport apis require https.
                https: httpsOptions,
            }),
            livereload({
                watch: 'dist',
                https: httpsOptions,
            }),
        ];
    }

    return [highLevelApiConfig, lowLevelApiConfig, demoConfig];
};
