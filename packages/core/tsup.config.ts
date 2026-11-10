import { defineConfig } from 'tsup';

export default defineConfig({
  // The routing worker (FR-55) is its own entry, next to index.js, where createRoutingWorker() looks for it.
  entry: { index: 'src/index.ts', 'routing.worker': 'src/routing/routing.worker.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ['react', 'react-dom', /^@pipeline-view\//],
});
