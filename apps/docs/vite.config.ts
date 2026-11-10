import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      // perf.html: the NFR-1 stress page used by e2e/perf.spec.ts (not linked from the docs nav).
      input: { main: resolve(__dirname, 'index.html'), perf: resolve(__dirname, 'perf.html') },
    },
  },
});
