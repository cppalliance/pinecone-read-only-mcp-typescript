import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPineconeClient } from '../client-context.js';
import { getNamespacesWithCache } from '../namespaces-cache.js';
import { registerGuidedQueryTool } from './guided-query-tool.js';
import {
  assertToolErrorCode,
  createMockServer,
  makeHybridQueryResult,
  makeNamespaceCacheEntry,
  makeSearchResult,
  parseToolJson,
} from './test-helpers.js';

vi.mock('../client-context.js', () => ({
  getPineconeClient: vi.fn(),
}));

vi.mock('../namespaces-cache.js', () => ({
  getNamespacesWithCache: vi.fn(),
}));

/** Real `markSuggested` may call `getServerConfig()` during sweep (CI has no API key); isolate the handler. */
vi.mock('../suggestion-flow.js', () => ({
  markSuggested: vi.fn(),
}));

const mockedGetNamespaces = vi.mocked(getNamespacesWithCache);
const mockedGetClient = vi.mocked(getPineconeClient);

describe('guided_query tool handler', () => {
  const nsEntry = makeNamespaceCacheEntry('papers', {
    document_number: 'string',
    title: 'string',
    url: 'string',
    author: 'string',
    chunk_text: 'string',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetNamespaces.mockResolvedValue({
      data: [nsEntry],
      cache_hit: false,
      expires_at: Date.now() + 1_800_000,
    });
    mockedGetClient.mockReturnValue({
      query: vi.fn().mockResolvedValue(makeHybridQueryResult()),
      count: vi.fn().mockResolvedValue({ count: 7, truncated: false }),
    } as never);
  });

  it('guided_query: surfaces rerank failure in decision_trace', async () => {
    mockedGetClient.mockReturnValue({
      query: vi.fn().mockResolvedValue(
        makeHybridQueryResult({
          degraded: true,
          degradation_reason: 'rerank_failed: timeout',
          results: [makeSearchResult({ reranked: false })],
        })
      ),
      count: vi.fn().mockResolvedValue({ count: 7, truncated: false }),
    } as never);

    const server = createMockServer();
    registerGuidedQueryTool(server as never);

    const body = parseToolJson(
      await server.getHandler('guided_query')!({
        user_query: 'What does the paper say about contracts?',
        namespace: 'papers',
        top_k: 8,
        preferred_tool: 'auto',
        enrich_urls: false,
      })
    );

    const trace = (body.experimental as Record<string, unknown>).decision_trace as Record<
      string,
      unknown
    >;
    expect(trace.rerank_status).toBe('failed');
    const result = body.result as Record<string, unknown>;
    const resultExperimental = result.experimental as Record<string, unknown>;
    expect(resultExperimental.degraded).toBe(true);
    expect(resultExperimental.degradation_reason).toBe('rerank_failed: timeout');
  });

  it('guided_query: reports skipped_no_model when rerank was requested but no model configured', async () => {
    mockedGetClient.mockReturnValue({
      query: vi.fn().mockResolvedValue(
        makeHybridQueryResult({
          rerank_skipped_reason: 'no_model',
          degradation_reason: 'rerank_skipped_no_model: set PINECONE_RERANK_MODEL',
        })
      ),
      count: vi.fn().mockResolvedValue({ count: 7, truncated: false }),
    } as never);

    const server = createMockServer();
    registerGuidedQueryTool(server as never);

    const body = parseToolJson(
      await server.getHandler('guided_query')!({
        user_query: 'What does the paper say about contracts?',
        namespace: 'papers',
        preferred_tool: 'detailed',
      })
    );

    const trace = (body.experimental as Record<string, unknown>).decision_trace as Record<
      string,
      unknown
    >;
    expect(trace.rerank_status).toBe('skipped_no_model');
  });

  it('runs query_detailed path on auto when user asks for content', async () => {
    const server = createMockServer();
    registerGuidedQueryTool(server as never);
    const query = mockedGetClient().query as ReturnType<typeof vi.fn>;

    const body = parseToolJson(
      await server.getHandler('guided_query')!({
        user_query: 'What does the paper say about contracts?',
        namespace: 'papers',
        top_k: 8,
        preferred_tool: 'auto',
        enrich_urls: false,
      })
    );

    expect(body.status).toBe('success');
    const trace = (body.experimental as Record<string, unknown>).decision_trace as Record<
      string,
      unknown
    >;
    expect(trace.selected_namespace).toBe('papers');
    expect(trace.selected_tool).toBe('detailed');
    expect(trace.rerank_status).toBe('success');
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'papers',
        topK: 8,
        useReranking: true,
      })
    );
    const result = body.result as Record<string, unknown>;
    expect(result.mode).toBe('query_detailed');
  });

  it('runs count when preferred_tool is count', async () => {
    const server = createMockServer();
    registerGuidedQueryTool(server as never);
    const count = mockedGetClient().count as ReturnType<typeof vi.fn>;

    const body = parseToolJson(
      await server.getHandler('guided_query')!({
        user_query: 'browse',
        namespace: 'papers',
        preferred_tool: 'count',
      })
    );

    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'browse',
        namespace: 'papers',
      })
    );
    const result = body.result as Record<string, unknown>;
    expect(result.tool).toBe('count');
    expect(result.count).toBe(7);
    const trace = (body.experimental as Record<string, unknown>).decision_trace as Record<
      string,
      unknown
    >;
    expect(trace.rerank_status).toBe('skipped');
  });

  it('returns error when user_query is empty', async () => {
    const server = createMockServer();
    registerGuidedQueryTool(server as never);

    const raw = await server.getHandler('guided_query')!({
      user_query: '  ',
      namespace: 'papers',
    });

    expect((raw as { isError?: boolean }).isError).toBe(true);
    const err = assertToolErrorCode(raw, 'VALIDATION');
    expect(err.field).toBe('user_query');
    expect(err.message).toBe('user_query cannot be empty');
  });

  it('returns error when no namespace can be resolved', async () => {
    mockedGetNamespaces.mockResolvedValue({
      data: [],
      cache_hit: false,
      expires_at: Date.now() + 1_800_000,
    });

    const server = createMockServer();
    registerGuidedQueryTool(server as never);

    const raw = await server.getHandler('guided_query')!({
      user_query: 'hello world',
    });

    const err = assertToolErrorCode(raw, 'PINECONE_ERROR');
    expect(err.recoverable).toBe(true);
    expect(err.message).toContain('No namespace available');
  });

  it('returns VALIDATION when explicit namespace is not in cached namespaces', async () => {
    const server = createMockServer();
    registerGuidedQueryTool(server as never);
    const raw = await server.getHandler('guided_query')!({
      user_query: 'hello',
      namespace: 'not-in-cache',
    });
    const err = assertToolErrorCode(raw, 'VALIDATION');
    expect(err.field).toBe('namespace');
    expect(err.message).toContain('not-in-cache');
  });
});
