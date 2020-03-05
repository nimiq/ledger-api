import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
    input: 'src/low-level-api/low-level-api.ts',
    output: [
        {
            dir: 'dist', // not dist/low-level-api as ts plugin creates sub folder structure in dist as in rootDir
            format: "es",
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
        typescript(),
        resolve({ browser: true }), // use browser versions of packages if defined in their package.json
        commonjs(),
    ],
};
