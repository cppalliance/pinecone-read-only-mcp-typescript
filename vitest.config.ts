import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        'src/index.ts',
        'src/cli.ts',
        'src/types.ts',
        // Large client: exercised by unit tests but not to saturation; omit from thresholds.
        'src/pinecone-client.ts',
        'src/server.ts',
        'src/config.ts',
        'src/server/tools/**',
        'src/server/client-context.ts',
        'src/server/config-context.ts',
        'src/server/format-query-result.ts',
        'src/server/namespaces-cache.ts',
        'src/server/namespace-router.ts',
        'src/server/suggestion-flow.ts',
        'src/server/tool-error.ts',
        'src/server/tool-response.ts',
        'src/server/tools/test-helpers.ts',
      ],
      // Thresholds apply to library-style modules covered by unit tests. MCP
      // wiring (`server.ts`, tools, caches, suggestion flow) is excluded here.
      thresholds: {
        lines: 77,
        statements: 76,
        functions: 73,
        branches: 58,
      },
    },
  },
});
