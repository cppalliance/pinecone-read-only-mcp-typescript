import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FAST_QUERY_FIELDS } from '../../constants.js';
import { getPineconeClient } from '../client-context.js';
import * as suggestionFlow from '../suggestion-flow.js';
import { registerQueryTool } from './query-tool.js';
import { createMockServer, makeSearchResult, parseToolJson } from './test-helpers.js';

vi.mock('../client-context.js', () => ({
  getPineconeClient: vi.fn(),
}));

const mockedGetClient = vi.mocked(getPineconeClient);

describe('query / query_fast / query_detailed tool handlers', () => {
  const flowOk = {
    ok: true as const,
    flow: {
      updatedAt: Date.now(),
      recommended_tool: 'query_detailed' as const,
      suggested_fields: ['chunk_text'],
      user_query: 'q',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(suggestionFlow, 'requireSuggested').mockReturnValue(flowOk);
    mockedGetClient.mockReturnValue({
      query: vi.fn().mockResolvedValue([makeSearchResult()]),
      count: vi.fn(),
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('query: happy path calls client.query and returns formatted rows', async () => {
    const server = createMockServer();
    registerQueryTool(server as never);
    const query = mockedGetClient().query as ReturnType<typeof vi.fn>;

    const body = parseToolJson(
      await server.getHandler('query')!({
        query_text: 'contracts',
        namespace: 'wg21',
        top_k: 5,
        use_reranking: true,
      })
    );

    expect(body.status).toBe('success');
    expect(body.mode).toBe('query');
    expect(body.result_count).toBe(1);
    expect(Array.isArray(body.results)).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'contracts',
        namespace: 'wg21',
        topK: 5,
        useReranking: true,
      })
    );
  });

  it('query_fast: uses no reranking and default lightweight fields', async () => {
    const server = createMockServer();
    registerQueryTool(server as never);
    const query = mockedGetClient().query as ReturnType<typeof vi.fn>;

    const body = parseToolJson(
      await server.getHandler('query_fast')!({
        query_text: 'list',
        namespace: 'wg21',
        top_k: 10,
      })
    );

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        useReranking: false,
        fields: [...FAST_QUERY_FIELDS],
      })
    );
    expect(body.mode).toBe('query_fast');
    expect(body.status).toBe('success');
  });

  it('query: rejects empty query_text before calling Pinecone', async () => {
    const server = createMockServer();
    registerQueryTool(server as never);
    const query = mockedGetClient().query as ReturnType<typeof vi.fn>;

    const raw = await server.getHandler('query')!({
      query_text: '   ',
      namespace: 'wg21',
      top_k: 10,
    });

    expect((raw as { isError?: boolean }).isError).toBe(true);
    expect(query).not.toHaveBeenCalled();
    const body = parseToolJson(raw);
    expect(body.message).toBe('Query text cannot be empty');
  });

  it('query: returns flow error when suggest_query_params was not called first', async () => {
    vi.spyOn(suggestionFlow, 'requireSuggested').mockReturnValue({
      ok: false,
      message:
        'Flow requires suggest_query_params first. Call suggest_query_params with namespace and user_query before query/count tools.',
    });

    const server = createMockServer();
    registerQueryTool(server as never);
    const query = mockedGetClient().query as ReturnType<typeof vi.fn>;

    const raw = await server.getHandler('query')!({
      query_text: 'hello',
      namespace: 'wg21',
      top_k: 10,
    });

    expect((raw as { isError?: boolean }).isError).toBe(true);
    expect(query).not.toHaveBeenCalled();
    const body = parseToolJson(raw);
    expect(body.message).toBe(
      'Flow requires suggest_query_params first. Call suggest_query_params with namespace and user_query before query/count tools.'
    );
  });

  it('query: returns TTL expiry message when suggestion context expired', async () => {
    vi.spyOn(suggestionFlow, 'requireSuggested').mockReturnValue({
      ok: false,
      message:
        'Previous suggest_query_params context expired (30 minutes). Call suggest_query_params again before query/count tools.',
    });

    const server = createMockServer();
    registerQueryTool(server as never);

    const body = parseToolJson(
      await server.getHandler('query')!({
        query_text: 'hello',
        namespace: 'wg21',
        top_k: 10,
      })
    );

    expect(body.status).toBe('error');
    expect(body.message).toBe(
      'Previous suggest_query_params context expired (30 minutes). Call suggest_query_params again before query/count tools.'
    );
  });

  it('query: surfaces unreranked hits when client returns reranked:false (rerank fallback shape)', async () => {
    mockedGetClient.mockReturnValue({
      query: vi
        .fn()
        .mockResolvedValue([makeSearchResult({ reranked: false, score: 0.5, content: 'x' })]),
      count: vi.fn(),
    } as never);

    const server = createMockServer();
    registerQueryTool(server as never);

    const body = parseToolJson(
      await server.getHandler('query')!({
        query_text: 'hello',
        namespace: 'wg21',
        top_k: 3,
      })
    );

    expect(body.status).toBe('success');
    const rows = body.results as Array<{ reranked: boolean }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].reranked).toBe(false);
  });
});
