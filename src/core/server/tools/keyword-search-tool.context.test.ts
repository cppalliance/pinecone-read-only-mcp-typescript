import { describe, expect, it, vi } from 'vitest';
import { registerKeywordSearchTool } from './keyword-search-tool.js';
import { keywordSearchResponseSchema } from '../response-schemas.js';
import {
  createMockServer,
  createTestServerContext,
  expectMatchesResponseSchema,
  makeSearchResult,
  parseToolJson,
} from './test-helpers.js';

describe('keyword_search tool handler (ServerContext instance path)', () => {
  it('returns success using injected client', async () => {
    const keywordSearch = vi.fn().mockResolvedValue([makeSearchResult()]);
    const ctx = createTestServerContext({
      client: {
        keywordSearch,
        getSparseIndexName: () => 'test-index-sparse',
      } as never,
    });

    const server = createMockServer();
    registerKeywordSearchTool(server as never, ctx);
    const raw = await server.getHandler('keyword_search')!({
      query_text: 'contracts',
      namespace: 'wg21',
      top_k: 5,
    });
    const body = parseToolJson(raw);
    expectMatchesResponseSchema(keywordSearchResponseSchema, body);
    expect(body).toMatchObject({
      status: 'success',
      query: 'contracts',
      namespace: 'wg21',
      index: 'test-index-sparse',
      result_count: 1,
    });
    expect(keywordSearch).toHaveBeenCalledOnce();
  });
});
