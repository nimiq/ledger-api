import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
    input: 'src/low-level-api/low-level-api.ts',
    output: [
        {
            dir: 'dist/module',
            format: "es",
            sourcemap: true
        },
        {
            dir: 'dist/commonjs',
            format: 'cjs',
            sourcemap: true
        }
    ],
    plugins: [
        typescript(),
        resolve({ browser: true }), // use browser versions of packages if defined in their package.json
        commonjs(),
    ],
};
