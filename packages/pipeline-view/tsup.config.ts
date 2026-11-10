import { defineConfig } from 'tsup';

/**
 * One publishable package with subpaths. The workspace packages are inlined, and ESM code splitting puts
 * core into a shared chunk, so '.', './symbols', './react' and './testing' use ONE core instance (one globalSymbols
 * registry, one Diagram class). Types are assembled by scripts/finish-build.mjs, not by tsup.
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    symbols: 'src/symbols.ts',
    react: 'src/react.ts',
    testing: 'src/testing.ts',
  },
  format: ['esm'],
  splitting: true,
  treeshake: true,
  sourcemap: true,
  clean: true,
  dts: false,
  noExternal: [/^@pipeline-view\//],
  external: ['react', 'react-dom', /^react\//, /^react-dom\//],
  // Shared chunks live in dist/chunks/, so size checks can exclude them per subpath (.size-limit.json).
  esbuildOptions(options) {
    options.chunkNames = 'chunks/[name]-[hash]';
  },
});
