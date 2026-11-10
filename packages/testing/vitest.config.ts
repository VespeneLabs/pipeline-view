import { defineConfig } from 'vitest/config';

/** Every test runs under happy-dom and jsdom, so hosts can test with either. */
export default defineConfig({
  test: {
    projects: [
      { extends: true, test: { name: 'happy-dom', environment: 'happy-dom' } },
      { extends: true, test: { name: 'jsdom', environment: 'jsdom' } },
    ],
  },
});
