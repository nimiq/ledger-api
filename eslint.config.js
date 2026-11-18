import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';

export default defineConfig(
    { ignores: ['dist/', 'node_modules/'] },
    js.configs.recommended,
    tseslint.configs.recommended,
    stylistic.configs.customize({
        indent: 4,
        quotes: 'single',
        semi: true,
        arrowParens: true,
        braceStyle: '1tbs',
        commaDangle: 'always-multiline',
        quoteProps: 'as-needed',
    }),
    {
        languageOptions: {
            globals: globals.browser,
        },
        rules: {
            '@stylistic/max-len': ['error', 120],
            '@stylistic/member-delimiter-style': ['error', {
                multiline: { delimiter: 'semi' },
                overrides: { typeLiteral: { multiline: { delimiter: 'comma' }, singleline: { delimiter: 'comma' } } },
            }],
            '@stylistic/operator-linebreak': ['error', 'before'],
            '@stylistic/multiline-ternary': 'off',
            '@stylistic/list-style': 'off',
            '@stylistic/max-statements-per-line': 'off',
            '@stylistic/lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'prefer-const': ['error', { destructuring: 'all' }],
        },
    },
    {
        files: ['speculos-bridge/**', '*.config.{js,ts}'],
        languageOptions: {
            globals: globals.node,
        },
    },
);
