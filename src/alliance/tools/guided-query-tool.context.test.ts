import { describe, expect, it, vi } from 'vitest';
import { registerGuidedQueryTool } from './guided-query-tool.js';
import {
  createMockServer,
  createTestServerContext,
  makeHybridQueryResult,
  parseToolJson,
} from '../../core/server/tools/test-helpers.js';

describe('guided_query tool handler (ServerContext instance path)', () => {
  it('returns success with decision_trace using injected context', async () => {
    const listNamespacesWithMetadata = vi.fn().mockResolvedValue([
      {
        namespace: 'papers',
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
    const query = vi.fn().mockResolvedValue(makeHybridQueryResult());
    const ctx = createTestServerContext({
      client: {
        listNamespacesWithMetadata,
        query,
        count: vi.fn().mockResolvedValue({ count: 7, truncated: false }),
      } as never,
    });

    const server = createMockServer();
    registerGuidedQueryTool(server as never, ctx);
    const raw = await server.getHandler('guided_query')!({
      user_query: 'What does the paper say about contracts?',
      namespace: 'papers',
      top_k: 8,
      preferred_tool: 'auto',
      enrich_urls: false,
    });
    const body = parseToolJson(raw);
    expect(body).toMatchObject({
      status: 'success',
    });
    const trace = body['decision_trace'] as Record<string, unknown>;
    expect(trace).toMatchObject({
      cache_hit: false,
      selected_namespace: 'papers',
      enrich_urls: false,
    });
    expect(trace['rerank_status']).toBeDefined();
    expect(query).toHaveBeenCalledOnce();
  });
});
