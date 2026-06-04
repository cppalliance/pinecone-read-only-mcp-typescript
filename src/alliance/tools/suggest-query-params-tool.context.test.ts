import { describe, expect, it, vi } from 'vitest';
import { registerSuggestQueryParamsTool } from './suggest-query-params-tool.js';
import {
  createMockServer,
  createTestServerContext,
  parseToolJson,
} from '../../core/server/tools/test-helpers.js';

describe('suggest_query_params tool handler (ServerContext instance path)', () => {
  it('marks suggest-flow on injected context when namespace exists', async () => {
    const listNamespacesWithMetadata = vi.fn().mockResolvedValue([
      {
        namespace: 'wg21',
        recordCount: 42,
        metadata: {
          document_number: 'string',
          title: 'string',
          url: 'string',
          author: 'string',
          chunk_text: 'string',
        },
      },
    ]);
    const ctx = createTestServerContext({
      client: { listNamespacesWithMetadata } as never,
    });

    const server = createMockServer();
    registerSuggestQueryParamsTool(server as never, ctx);
    const raw = await server.getHandler('suggest_query_params')!({
      namespace: 'wg21',
      user_query: 'List papers with titles',
    });
    const body = parseToolJson(raw);
    expect(body).toMatchObject({
      status: 'success',
      namespace_found: true,
      cache_hit: false,
    });

    const flowCheck = ctx.requireSuggested('wg21');
    expect(flowCheck.ok).toBe(true);
  });
});
