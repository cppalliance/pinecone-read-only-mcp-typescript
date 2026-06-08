import { describe, expect, it, vi } from 'vitest';
import { registerBuiltinUrlGenerators } from '../url-builtins.js';
import { registerQueryTool } from '../../core/server/tools/query-tool.js';
import { registerSuggestQueryParamsTool } from './suggest-query-params-tool.js';
import { registerGuidedQueryTool } from './guided-query-tool.js';
import {
  assertToolErrorCode,
  createMockServer,
  createTestServerContext,
  makeHybridQueryResult,
  makeSearchResult,
  parseToolJson,
} from '../../core/server/tools/test-helpers.js';

const namespaceMetadata = {
  document_number: 'string',
  title: 'string',
  url: 'string',
  author: 'string',
  chunk_text: 'string',
};

function papersNamespaceClient(overrides?: { query?: ReturnType<typeof vi.fn> }) {
  return {
    listNamespacesWithMetadata: vi
      .fn()
      .mockResolvedValue([{ namespace: 'papers', recordCount: 42, metadata: namespaceMetadata }]),
    query: overrides?.query ?? vi.fn().mockResolvedValue(makeHybridQueryResult()),
    count: vi.fn().mockResolvedValue({ count: 7, truncated: false }),
  };
}

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

  it('surfaces degraded and hybrid_leg_failed in result', async () => {
    const query = vi.fn().mockResolvedValue(
      makeHybridQueryResult({
        degraded: true,
        degradation_reason: 'sparse_leg_empty',
        hybrid_leg_failed: 'sparse',
      })
    );
    const ctx = createTestServerContext({
      client: papersNamespaceClient({ query }) as never,
    });
    const server = createMockServer();
    registerGuidedQueryTool(server as never, ctx);
    const body = parseToolJson(
      await server.getHandler('guided_query')!({
        user_query: 'contracts',
        namespace: 'papers',
        preferred_tool: 'fast',
        enrich_urls: false,
      })
    );
    const result = body['result'] as Record<string, unknown>;
    expect(result['degraded']).toBe(true);
    expect(result['hybrid_leg_failed']).toBe('sparse');
    expect(result['degradation_reason']).toBe('sparse_leg_empty');
  });

  it('enriches urls via ctx builtins when enrich_urls is true', async () => {
    const mailingDocId = 'boost-announce@lists.boost.org/message/O5VYCDZADVDHK5Z5LAYJBHMDOAFQL7P6';
    const query = vi.fn().mockResolvedValue(
      makeHybridQueryResult({
        results: [
          makeSearchResult({
            metadata: {
              document_number: 'MSG-1',
              title: 'T',
              author: 'A',
              doc_id: mailingDocId,
            },
          }),
        ],
      })
    );
    const ctx = createTestServerContext({
      client: {
        listNamespacesWithMetadata: vi.fn().mockResolvedValue([
          {
            namespace: 'mailing',
            recordCount: 42,
            metadata: {
              document_number: 'string',
              title: 'string',
              author: 'string',
              chunk_text: 'string',
            },
          },
        ]),
        query,
        count: vi.fn(),
      } as never,
    });
    registerBuiltinUrlGenerators(ctx);
    const server = createMockServer();
    registerGuidedQueryTool(server as never, ctx);
    const body = parseToolJson(
      await server.getHandler('guided_query')!({
        user_query: 'announcement',
        namespace: 'mailing',
        preferred_tool: 'fast',
        enrich_urls: true,
      })
    );
    const result = body['result'] as Record<string, unknown>;
    const rows = result['results'] as Array<{ url: string }>;
    expect(rows[0]?.url).toContain('lists.boost.org');
  });

  it('returns TIMEOUT when orchestrator client throws timeout error', async () => {
    const query = vi
      .fn()
      .mockRejectedValue(new Error('Timeout after 5000ms while waiting for query'));
    const ctx = createTestServerContext({
      client: papersNamespaceClient({ query }) as never,
    });
    const server = createMockServer();
    registerGuidedQueryTool(server as never, ctx);
    const err = assertToolErrorCode(
      await server.getHandler('guided_query')!({
        user_query: 'contracts',
        namespace: 'papers',
        preferred_tool: 'fast',
        enrich_urls: false,
      }),
      'TIMEOUT'
    );
    expect(err.suggestion).toMatch(/retry|timeout/i);
  });

  it('does not block explicit suggest_query_params after internal suggest', async () => {
    const ctx = createTestServerContext({
      client: papersNamespaceClient() as never,
    });
    const guidedServer = createMockServer();
    registerGuidedQueryTool(guidedServer as never, ctx);
    await guidedServer.getHandler('guided_query')!({
      user_query: 'What does the paper say?',
      namespace: 'papers',
      preferred_tool: 'fast',
      enrich_urls: false,
    });

    const suggestServer = createMockServer();
    registerSuggestQueryParamsTool(suggestServer as never, ctx);
    const suggestBody = parseToolJson(
      await suggestServer.getHandler('suggest_query_params')!({
        namespace: 'papers',
        user_query: 'List titles',
      })
    );
    expect(suggestBody['status']).toBe('success');

    const queryServer = createMockServer();
    registerQueryTool(queryServer as never, ctx);
    const queryBody = parseToolJson(
      await queryServer.getHandler('query')!({
        query_text: 'List titles',
        namespace: 'papers',
        preset: 'fast',
      })
    );
    expect(queryBody['status']).toBe('success');
  });
});
