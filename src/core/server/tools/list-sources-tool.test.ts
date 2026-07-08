import { describe, expect, it } from 'vitest';
import { registerListSourcesTool } from './list-sources-tool.js';
import { listSourcesResponseSchema } from '../response-schemas.js';
import {
  assertToolErrorCode,
  createMockServer,
  createMultiSourceTestContext,
  expectMatchesResponseSchema,
  parseToolJson,
} from './test-helpers.js';

describe('list_sources tool handler', () => {
  it('returns LIFECYCLE when not in multi-source mode', async () => {
    const server = createMockServer();
    registerListSourcesTool(server as never);
    const err = assertToolErrorCode(await server.getHandler('list_sources')!({}), 'LIFECYCLE');
    expect(err.message).toMatch(/multi-source/i);
  });

  it('returns sources without description when none configured (back-compat shape)', async () => {
    const { ctx } = createMultiSourceTestContext();
    const server = createMockServer();
    registerListSourcesTool(server as never, ctx);
    const body = parseToolJson(await server.getHandler('list_sources')!({}));
    expectMatchesResponseSchema(listSourcesResponseSchema, body);
    expect(body['sources']).toEqual([{ name: 'api_key_1' }, { name: 'api_key_2' }]);
    expect(body['default']).toBe('api_key_1');
  });

  it('returns configured per-source description when present', async () => {
    const { ctx } = createMultiSourceTestContext({
      sources: [
        {
          name: 'api_key_1',
          apiKey: 'k1',
          indexName: 'idx-a',
          description: 'Public corpus',
        },
        {
          name: 'api_key_2',
          apiKey: 'k2',
          indexName: 'idx-b',
        },
      ],
    });
    const server = createMockServer();
    registerListSourcesTool(server as never, ctx);
    const body = parseToolJson(await server.getHandler('list_sources')!({}));
    expect(body['sources']).toEqual([
      { name: 'api_key_1', description: 'Public corpus' },
      { name: 'api_key_2' },
    ]);
  });
});
