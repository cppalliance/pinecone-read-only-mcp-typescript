import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPineconeClient } from '../client-context.js';
import { getNamespacesWithCache } from '../namespaces-cache.js';
import { registerGuidedQueryTool } from './guided-query-tool.js';
import {
  createMockServer,
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
      query: vi.fn().mockResolvedValue([makeSearchResult()]),
      count: vi.fn().mockResolvedValue({ count: 7, truncated: false }),
    } as never);
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
    const trace = body.decision_trace as Record<string, unknown>;
    expect(trace.selected_namespace).toBe('papers');
    expect(trace.selected_tool).toBe('detailed');
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
  });

  it('returns error when user_query is empty', async () => {
    const server = createMockServer();
    registerGuidedQueryTool(server as never);

    const raw = await server.getHandler('guided_query')!({
      user_query: '  ',
      namespace: 'papers',
    });

    expect((raw as { isError?: boolean }).isError).toBe(true);
    expect(parseToolJson(raw).message).toBe('user_query cannot be empty');
  });

  it('returns error when no namespace can be resolved', async () => {
    mockedGetNamespaces.mockResolvedValue({
      data: [],
      cache_hit: false,
      expires_at: Date.now() + 1_800_000,
    });

    const server = createMockServer();
    registerGuidedQueryTool(server as never);

    const body = parseToolJson(
      await server.getHandler('guided_query')!({
        user_query: 'hello world',
      })
    );

    expect(body.status).toBe('error');
    expect(String(body.message)).toContain('No namespace available');
  });
});
