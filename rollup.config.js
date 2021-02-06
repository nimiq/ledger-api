import fs from 'fs';
import path from 'path';
import { walk } from 'estree-walker';
import MagicString from 'magic-string';

import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import sourcemaps from 'rollup-plugin-sourcemaps';
import eslint from '@rbnlffl/rollup-plugin-eslint';

// demo page specific imports
import alias from '@rollup/plugin-alias';
import polyfillNode from 'rollup-plugin-polyfill-node';
import copy from 'rollup-plugin-copy';
import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';

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

                        // as specified by chunkFileNames
                        const importBundleId = `high-level-api${importPath.substring(1)}`;
                        if (!bundle[importBundleId]) {
                            warn(`hoist-dynamic-import-dependencies: unknown bundle ${importBundleId}.\n`);
                            return;
                        }

                        const dependencies = bundle[importBundleId].imports
                            .filter((dependencyBundleId) => dependencyBundleId !== chunkName)
                            .map((dependencyBundleId) => dependencyBundleId.replace('high-level-api', '.'));
                        if (!dependencies) return;

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
        preserveEntrySignatures: 'allow-extension', // avoid rollup's additional facade chunk
        plugins: [
            // First run plugins that map imports to the actual imported files, e.g. aliased imports or browser versions
            // of packages, such that subsequent plugins operate on the right files.
            alias({
                entries: {
                    // replace readable-stream imported by @ledgerhq/hw-app-btc/src/hashPublicKey > ripemd160 >
                    // hash-base by stream which gets polyfilled by rollup-plugin-polyfill-node. Note that stream and
                    // readable-stream are largely compatible and effectively the same code. However, the stream
                    // polyfill used by rollup-plugin-polyfill-node is an older version which has less problems with
                    // circular dependencies. The circular dependencies are currently being resolved in readable-stream
                    // though and once merged (see https://github.com/nodejs/readable-stream/issues/348), this alias
                    // should be removed or even turned around. Note that without the replacement, the stream polyfill
                    // and readable-stream are both bundled, which is not desirable.
                    'readable-stream': 'stream',
                },
            }),
            resolve({
                browser: true, // use browser versions of packages if defined in their package.json
                preferBuiltins: false, // builtins are handled by polyfillNode
            }),
            // Have eslint high up in the hierarchy to lint the original files.
            eslint({
                // TODO remove once https://github.com/snowpackjs/rollup-plugin-polyfill-node/pull/3 is merged
                filterExclude: ['node_modules/**', /^polyfill-node:/], // ignore polyfill-node's virtual files
                throwOnError: isProduction,
            }),
            // Check types and transpile ts to js. Note that ts does only transpile and not bundle imports.
            typescript({
                include: ['src/high-level-api/**', 'src/low-level-api/**', 'src/lib/**'],
                declaration: true,
                declarationDir: 'dist',
                // temporary, see https://github.com/rollup/plugins/issues/61#issuecomment-596270901 and
                // https://github.com/rollup/plugins/issues/287
                rootDir: 'src',
                noEmitOnError: isProduction,
            }),
            // Read code including sourcemaps. Has to happen after ts as ts files should be loaded by typescript plugin
            // and the sourcemaps plugin can't parse ts files.
            sourcemaps({
                // TODO remove once https://github.com/snowpackjs/rollup-plugin-polyfill-node/pull/3 is merged
                exclude: [/^polyfill-node:/],
            }),
            // Plugins for processing dependencies.
            commonjs(),
            json({ // required for import of bitcoin-ops/index.json imported by bitcoinjs-lib
                compact: true,
            }),
            polyfillNode({
                include: [
                    'src/**/*',
                    'node_modules/**/*.js',
                ],
            }),
            // Last steps in output generation.
            hoistDynamicImportDependencies(),
            // debugModuleDependencies('stream'),
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
            exports: 'default',
        })),
        plugins: [
            eslint({
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
            // typescript needs the import as specified to find the .d.ts file but for actual import we need .es.js file
            alias({
                entries: {
                    '../../dist/low-level-api/low-level-api': '../low-level-api/low-level-api.es.js',
                    '../../dist/high-level-api/ledger-api': '../high-level-api/ledger-api.es.js',
                },
            }),
            resolve({
                preferBuiltins: false, // builtins are handled by polyfillNode
            }),
            // Have eslint high up in the hierarchy to lint the original files.
            eslint({
                // TODO remove once https://github.com/snowpackjs/rollup-plugin-polyfill-node/pull/3 is merged
                filterExclude: ['node_modules/**', /^polyfill-node:/], // ignore polyfill-node's virtual files
                throwOnError: isProduction,
            }),
            typescript({
                include: ['src/demo/**', 'src/lib/**'],
                noEmitOnError: isProduction,
            }),
            sourcemaps({
                // TODO remove once https://github.com/snowpackjs/rollup-plugin-polyfill-node/pull/3 is merged
                exclude: [/^polyfill-node:/],
            }),
            commonjs(),
            polyfillNode({
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
