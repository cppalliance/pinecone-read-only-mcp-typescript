import { defineConfig } from 'vitest/config';

/**
 * Global coverage gates (v8). Thresholds sit ~2–3% below the last measured
 * `npm run test:coverage` totals on main so normal fluctuation does not fail CI,
 * while still catching meaningful regressions. Re-measure after large refactors.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: ['node_modules/', 'dist/', '**/*.test.ts'],
      thresholds: {
        lines: 73,
        statements: 72,
        branches: 58,
        functions: 76,
      },
    },
  },
});
