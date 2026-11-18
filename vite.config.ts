// Build config of the library. For the demo page, see vite.demo.config.ts.
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import MagicString from 'magic-string';
import packageJson from './package.json' with { type: 'json' };

// Dependencies are not bundled but kept external, to avoid duplicate bundling of dependencies and polyfills in apps
// that use this library and the dependencies themselves. See README.
const externalDependencies = Object.keys(packageJson.dependencies);
function isExternalDependency(id: string): boolean {
    return externalDependencies.some((dependency) => id === dependency || id.startsWith(`${dependency}/`));
}

// Change sourcemap paths to a separate protocol and path such that they appear in a "virtual folder" in dev tools.
const SOURCE_MAP_PREFIX = 'source-mapped://source-mapped/';

type AstNode = { type: string, start: number, end: number, source?: { value?: unknown }, [key: string]: unknown };
function walk(node: unknown, enter: (node: AstNode) => void): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        for (const child of node) walk(child, enter);
        return;
    }
    if (typeof (node as AstNode).type === 'string') enter(node as AstNode);
    for (const value of Object.values(node)) walk(value, enter);
}

// Hoist dependency imports for dynamic imports similar to rollup's dependency hoisting for regular imports
// (see https://rollupjs.org/faqs/#why-do-additional-imports-turn-up-in-my-entry-chunks-when-code-splitting) for
// quicker loading of the dependencies. Note that bundlers do not do this by default, as the execution order is not
// guaranteed anymore (see https://github.com/rollup/rollup/issues/3009), but that doesn't matter in our case.
// Inspired by https://github.com/vikerman/rollup-plugin-hoist-import-deps.
function hoistDynamicImportDependencies(): Plugin {
    return {
        name: 'hoist-dynamic-import-dependencies',
        apply: 'build',
        generateBundle(options, bundle) {
            for (const chunk of Object.values(bundle)) {
                if (chunk.type !== 'chunk' || chunk.dynamicImports.length === 0) continue;
                const chunkDir = path.posix.dirname(chunk.fileName);
                const magicString = new MagicString(chunk.code);
                walk(this.parse(chunk.code), (node) => {
                    if (node.type !== 'ImportExpression') return;
                    const importPath = node.source?.value;
                    // Skip unknown import paths, for example for dynamic template strings, and external dependencies.
                    if (typeof importPath !== 'string' || !importPath.startsWith('.')) return;
                    const importedChunk = bundle[path.posix.join(chunkDir, importPath)];
                    if (!importedChunk || importedChunk.type !== 'chunk') {
                        this.warn(`Unknown chunk ${importPath} imported in ${chunk.fileName}.`);
                        return;
                    }

                    const dependencies = importedChunk.imports
                        .filter((dependency) => dependency !== chunk.fileName && !isExternalDependency(dependency))
                        .map((dependency) => {
                            const relativePath = path.posix.relative(chunkDir, dependency);
                            return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
                        });
                    if (!dependencies.length) return;

                    magicString.prependLeft(node.start, `[${
                        dependencies.map((dependency) => `import('${dependency}')`).join(', ')
                    }, `);
                    magicString.appendRight(node.end, `][${dependencies.length}]`);
                });
                chunk.code = magicString.toString();
            }
        },
    };
}

export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        copyPublicDir: false,
        sourcemap: true,
        minify: false, // Leave minification to the consuming app.
        lib: {
            entry: {
                'high-level-api/ledger-api': 'src/high-level-api/ledger-api.ts',
                'low-level-api/low-level-api': 'src/low-level-api/low-level-api.ts',
            },
            formats: ['es'],
            fileName: (format, entryName) => `${entryName}.${format}.js`,
        },
        rolldownOptions: {
            external: isExternalDependency,
            preserveEntrySignatures: 'allow-extension', // avoid additional facade chunks
            output: {
                chunkFileNames: 'chunks/[name].es.js',
                sourcemapPathTransform: (relativePath) =>
                    `${SOURCE_MAP_PREFIX}${path.relative('../../', relativePath)}`,
            },
        },
    },
    plugins: [hoistDynamicImportDependencies()],
});
