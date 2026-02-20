import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { walk } from 'estree-walker';
import MagicString from 'magic-string';

import alias from '@rollup/plugin-alias';
import virtual from '@rollup/plugin-virtual';
import resolve from '@rollup/plugin-node-resolve';
import eslint from '@rollup/plugin-eslint';
import typescript from '@rollup/plugin-typescript';
import sourcemaps from 'rollup-plugin-sourcemaps';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import inject from '@rollup/plugin-inject';
import replace from '@rollup/plugin-replace';

// demo page specific imports
import copy from 'rollup-plugin-copy';
import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';

async function calculateIntegrityHash(filename, algorithm = 'sha256') {
    const fileContent = await fs.promises.readFile(filename);
    const hash = crypto.createHash(algorithm).update(fileContent).digest('base64');
    return `${algorithm}-${hash}`;
}

// change sourcemap paths to a separate protocol and path such that they appear in a "virtual folder" in dev tools
const SOURCE_MAP_PREFIX = 'source-mapped://source-mapped/';
function sourcemapPathTransform(relativePath) {
    return `${SOURCE_MAP_PREFIX}${path.relative('../../', relativePath)}`;
}

// function debugModuleDependencies(module) {
//     return {
//         name: 'debug-module-dependencies',
//         writeBundle() {
//             console.log(`\n\nDebug module dependencies for ${module}.`);
//             const moduleIds = [...this.getModuleIds()].filter((id) => id.includes(module));
//             console.log('Matched bundled module ids:', moduleIds);
//             for (const moduleId of moduleIds) {
//                 const moduleInfo = this.getModuleInfo(moduleId);
//                 console.log('\n', {
//                     id: moduleInfo.id,
//                     importers: moduleInfo.importers,
//                     dynamicImporters: moduleInfo.dynamicImporters,
//                 });
//             }
//         },
//     };
// }

// Hoist dependency imports for dynamic imports similar to rollup's dependency hoisting for regular imports
// (see https://rollupjs.org/guide/en/#why-do-additional-imports-turn-up-in-my-entry-chunks-when-code-splitting) for
// quicker loading of the dependencies. Note that rollup does not do this by default, as the execution order is not
// guaranteed anymore (see https://github.com/rollup/rollup/issues/3009), but that doesn't matter in our case.
// Inspired by https://github.com/vikerman/rollup-plugin-hoist-import-deps which can't be used directly in our case due
// to https://github.com/vikerman/rollup-plugin-hoist-import-deps/issues/57.
function hoistDynamicImportDependencies() {
    return {
        name: 'hoist-dynamic-import-dependencies',

        generateBundle(options, bundle) {
            const warn = this.warn.bind(this);
            for (const chunkName of Object.keys(bundle)) {
                const chunk = bundle[chunkName];
                if (chunk.type !== 'chunk' || chunk.dynamicImports.length === 0) {
                    continue;
                }
                const { code } = chunk;

                let ast = null;
                try {
                    ast = this.parse(code);
                } catch (err) {
                    warn({
                        code: 'PARSE_ERROR',
                        message: `hoist-dynamic-import-dependencies: failed to parse ${chunk.fileName}.\n${err}`,
                    });
                }
                if (!ast) {
                    continue;
                }

                const magicString = new MagicString(code);
                walk(ast, {
                    enter(node) {
                        // Note that only the .es output generates dynamic imports
                        if (node.type !== 'ImportExpression') return;
                        const { value: importPath } = node.source;
                        if (!importPath) return; // unknown import path; for example for dynamic template strings

                        // as specified by chunkFileNames
                        const importBundleId = `high-level-api${importPath.substring(1)}`;
                        if (!bundle[importBundleId]) {
                            warn(`hoist-dynamic-import-dependencies: unknown bundle ${importBundleId}.\n`);
                            return;
                        }

                        const dependencies = bundle[importBundleId].imports
                            .filter((dependencyBundleId) => dependencyBundleId !== chunkName)
                            .map((dependencyBundleId) => dependencyBundleId.replace('high-level-api', '.'));
                        if (!dependencies.length) return;

                        magicString.prependLeft(node.start, `[${
                            dependencies.map((dependency) => `import('${dependency}')`).join(', ')
                        }, `);
                        magicString.appendRight(node.end, `][${dependencies.length}]`);
                    },
                });

                chunk.code = magicString.toString();
            }
        },
    };
}

export default async (commandLineArgs) => {
    const isProduction = commandLineArgs.configProduction; // called with --configProduction?
    const isServing = commandLineArgs.configServe;

    const nimiqLegacyCoreWasmIntegrityHash = await calculateIntegrityHash(
        './node_modules/@nimiq/core-web/worker-wasm.js');

    const highLevelApiConfig = {
        input: 'src/high-level-api/ledger-api.ts',
        output: {
            dir: 'dist', // not dist/high-level-api as ts plugin creates sub folder structure in dist as in rootDir
            entryFileNames: 'high-level-api/[name].[format].js',
            chunkFileNames: 'high-level-api/lazy-chunk-[name].[format].js',
            exports: 'named', // enable multiple exports at the cost that cjs bundle must be imported as bundle.default
            sourcemap: true,
            sourcemapPathTransform,
        },
        preserveEntrySignatures: 'allow-extension', // avoid rollup's additional facade chunk
        plugins: [
            // First run plugins that map imports to the actual imported files, e.g. aliased and shimmed imports or
            // browser versions of packages, such that subsequent plugins operate on the right files. Especially, we
            // polyfill node builtins via aliased and virtual packages and later inject their node globals via the
            // inject plugin.
            alias({
                entries: {
                    // Polyfill node's builtin stream module via readable-stream, which is essentially node's stream
                    // put into an npm package.
                    stream: 'readable-stream',
                    // Shim unnecessary axios for @ledgerhq/hw-transport-http.
                    axios: '../../../../src/shared/axios-shim.ts',
                },
            }),
            virtual({
                // Don't bundle unnecessary WebSocket polyfill.
                ws: 'export default {};',
                // Polyfill node's global and process.env.NODE_ENV.
                global: 'export default window;',
                process: `export default { env: { NODE_ENV: ${isProduction ? '"production"' : '"development"'} } };`,
            }),
            resolve({
                browser: true, // use browser versions of packages if defined in their package.json
                preferBuiltins: false, // process node builtins to use polyfill packages buffer, readable-stream, etc.
            }),
            // Have eslint high up in the hierarchy to lint the original files.
            eslint({
                throwOnError: isProduction,
            }),
            // Check types and transpile ts to js. Note that ts does only transpile and not bundle imports.
            typescript({
                include: ['src/high-level-api/**', 'src/low-level-api/**', 'src/shared/**'],
                declaration: true,
                declarationDir: 'dist',
                noEmitOnError: isProduction,
            }),
            // Read code including sourcemaps. Has to happen after typescript as ts files should be loaded by typescript
            // plugin and the sourcemaps plugin can't parse ts files.
            sourcemaps(),
            // Plugins for processing dependencies.
            commonjs(),
            json({ // required for import of bitcoin-ops/index.json imported by bitcoinjs-lib
                compact: true,
            }),
            inject({
                Buffer: ['buffer', 'Buffer'], // add "import { Buffer } from 'buffer'" when node's Buffer global is used
                global: 'global', // add "import global from 'global'" when node's global variable 'global' is used
                process: 'process', // add "import process from 'process'" when node's global variable 'process' is used
            }),
            // Last steps in output generation.
            replace({
                __nimiqLegacyCoreWasmIntegrityHash__: `'${nimiqLegacyCoreWasmIntegrityHash}'`,
            }),
            hoistDynamicImportDependencies(),
            // debugModuleDependencies('stream'),
        ],
        watch: {
            clearScreen: false,
        },
    };

    const lowLevelApiConfig = {
        input: 'src/low-level-api/low-level-api.ts',
        output: {
            dir: 'dist', // not dist/low-level-api as ts plugin creates sub folder structure in dist as in rootDir
            entryFileNames: 'low-level-api/[name].[format].js',
            sourcemap: true,
            sourcemapPathTransform,
            exports: 'default',
        },
        plugins: [
            eslint({
                throwOnError: isProduction,
            }),
            typescript({
                include: ['src/low-level-api/**', 'src/shared/**'],
                declaration: true,
                declarationDir: 'dist',
                noEmitOnError: isProduction,
            }),
            resolve({
                browser: true, // use browser versions of packages if defined in their package.json
            }),
            sourcemaps(),
            commonjs(),
            replace({
                __nimiqLegacyCoreWasmIntegrityHash__: `'${nimiqLegacyCoreWasmIntegrityHash}'`,
            }),
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
            sourcemap: true,
            sourcemapPathTransform,
        },
        plugins: [
            // First run plugins that map imports to the actual imported files, e.g. aliased and shimmed imports or
            // browser versions of packages, such that subsequent plugins operate on the right files. Especially, we
            // polyfill node builtins via aliased and virtual packages and later inject their node globals via the
            // inject plugin.
            alias({
                entries: {
                    // typescript needs the imports as specified to find the .d.ts files but for actual import we need
                    // the .es.js files.
                    '../../dist/low-level-api/low-level-api': '../low-level-api/low-level-api.es.js',
                    '../../dist/high-level-api/ledger-api': '../high-level-api/ledger-api.es.js',
                    // Shim unnecessary axios for @ledgerhq/hw-transport-http.
                    axios: '../../../../src/shared/axios-shim.ts',
                    // Polyfill node's builtin stream module via readable-stream, which is essentially node's stream
                    // put into an npm package.
                    stream: 'readable-stream',
                },
            }),
            virtual({
                // Don't bundle unnecessary WebSocket polyfill.
                ws: 'export default {};',
                // Polyfill node's global and process.env.NODE_ENV.
                global: 'export default window;',
                process: `export default { env: { NODE_ENV: ${isProduction ? '"production"' : '"development"'} } };`,
            }),
            resolve({
                browser: true, // use browser versions of packages if defined in their package.json
                preferBuiltins: false, // process node builtins to use polyfill packages buffer, readable-stream, etc.
            }),
            // Have eslint high up in the hierarchy to lint the original files.
            eslint({
                throwOnError: isProduction,
            }),
            // Check types and transpile ts to js. Note that ts does only transpile and not bundle imports.
            typescript({
                include: ['src/demo/**', 'src/shared/**'],
                noEmitOnError: isProduction,
            }),
            // Read code including sourcemaps. Has to happen after typescript as ts files should be loaded by typescript
            // plugin and the sourcemaps plugin can't parse ts files.
            sourcemaps(),
            // Plugins for processing dependencies.
            commonjs(),
            json(), // required for import of secp256k1/lib/messages.json in secp256k1 imported by bitcoinjs-message
            inject({
                Buffer: ['buffer', 'Buffer'], // add "import { Buffer } from 'buffer'" when node's Buffer global is used
                global: 'global', // add "import global from 'global'" when node's global variable 'global' is used
                process: 'process', // add "import process from 'process'" when node's global variable 'process' is used
            }),
            replace({
                __nimiqLegacyCoreWasmIntegrityHash__: `'${nimiqLegacyCoreWasmIntegrityHash}'`,
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
        const sslCertificate = await fs.promises.readFile('ssl/server.pem');
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
