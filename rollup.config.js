import fs from 'fs';

import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

// demo page specific imports
import copy from 'rollup-plugin-copy';
import serve from 'rollup-plugin-serve';
import livereload from 'rollup-plugin-livereload';

export default (commandLineArgs) => {
    const isServing = commandLineArgs.configServe; // called with --configServe?

    const lowLevelApiConfig = {
        input: 'src/low-level-api/low-level-api.ts',
        output: [
            {
                dir: 'dist', // not dist/low-level-api as ts plugin creates sub folder structure in dist as in rootDir
                format: 'es',
                entryFileNames: 'low-level-api/[name].[format].js',
                sourcemap: true
            },
            {
                dir: 'dist',
                format: 'cjs',
                entryFileNames: 'low-level-api/[name].[format].js',
                sourcemap: true
            }
        ],
        plugins: [
            typescript({
                include: ['src/low-level-api/**', 'src/type-shims.d.ts'],
                declaration: true,
                declarationDir: 'dist',
                rootDir: 'src', // temporary, see https://github.com/rollup/plugins/issues/61#issuecomment-596270901
                noEmitOnError: !isServing,
            }),
            resolve({ browser: true }), // use browser versions of packages if defined in their package.json
            commonjs(),
        ],
        watch: {
            clearScreen: false,
        },
    };

    const demoConfig = {
        input: 'src/demo/index.ts',
        output: {
            dir: 'dist/demo',
            format: 'es',
        },
        plugins: [
            typescript({
                include: ['src/demo/**'],
                noEmitOnError: !isServing,
            }),
            resolve(),
            commonjs(),
            copy({ targets: [{ src: 'src/demo/template.html', dest: 'dist/demo', rename: 'index.html' }] }),
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
        ]
    }

    return [lowLevelApiConfig, demoConfig];
}
