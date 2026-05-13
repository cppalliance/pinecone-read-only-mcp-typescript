import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNamespacesWithCache } from '../namespaces-cache.js';
import { markSuggested } from '../suggestion-flow.js';
import { registerSuggestQueryParamsTool } from './suggest-query-params-tool.js';
import { createMockServer, makeNamespaceCacheEntry, parseToolJson } from './test-helpers.js';

vi.mock('../namespaces-cache.js', () => ({
  getNamespacesWithCache: vi.fn(),
}));

vi.mock('../suggestion-flow.js', () => ({
  markSuggested: vi.fn(),
}));

const mockedGetNamespaces = vi.mocked(getNamespacesWithCache);
const mockedMarkSuggested = vi.mocked(markSuggested);

describe('suggest_query_params tool handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks suggestion flow and returns success when namespace exists in cache', async () => {
    mockedGetNamespaces.mockResolvedValue({
      data: [makeNamespaceCacheEntry('wg21')],
      cache_hit: false,
      expires_at: Date.now() + 1_800_000,
    });

    const server = createMockServer();
    registerSuggestQueryParamsTool(server as never);
    const body = parseToolJson(
      await server.getHandler('suggest_query_params')!({
        namespace: 'wg21',
        user_query: 'List papers with titles',
      })
    );

    expect(body.status).toBe('success');
    expect(body.namespace_found).toBe(true);
    expect(mockedMarkSuggested).toHaveBeenCalledTimes(1);
    expect(mockedMarkSuggested).toHaveBeenCalledWith(
      'wg21',
      expect.objectContaining({
        user_query: 'List papers with titles',
        suggested_fields: expect.any(Array),
      })
    );
  });

  it('does not mark suggested when namespace is absent from cache', async () => {
    mockedGetNamespaces.mockResolvedValue({
      data: [makeNamespaceCacheEntry('other')],
      cache_hit: true,
      expires_at: Date.now() + 1_800_000,
    });

    const server = createMockServer();
    registerSuggestQueryParamsTool(server as never);
    const body = parseToolJson(
      await server.getHandler('suggest_query_params')!({
        namespace: 'missing-ns',
        user_query: 'anything',
      })
    );

    expect(body.namespace_found).toBe(false);
    expect(mockedMarkSuggested).not.toHaveBeenCalled();
  });

  it('returns error when user_query is empty', async () => {
    mockedGetNamespaces.mockResolvedValue({
      data: [],
      cache_hit: false,
      expires_at: Date.now() + 1_800_000,
    });

    const server = createMockServer();
    registerSuggestQueryParamsTool(server as never);
    const raw = await server.getHandler('suggest_query_params')!({
      namespace: 'wg21',
      user_query: '   ',
    });

    expect((raw as { isError?: boolean }).isError).toBe(true);
    const body = parseToolJson(raw);
    expect(body.status).toBe('error');
    expect(body.message).toBe('user_query cannot be empty');
  });

  it('returns error when namespace cache fails', async () => {
    mockedGetNamespaces.mockRejectedValue(new Error('cache boom'));

    const server = createMockServer();
    registerSuggestQueryParamsTool(server as never);
    const raw = await server.getHandler('suggest_query_params')!({
      namespace: 'wg21',
      user_query: 'hello',
    });

    expect((raw as { isError?: boolean }).isError).toBe(true);
    const body = parseToolJson(raw);
    expect(body.status).toBe('error');
    expect(String(body.message)).toBe('Failed to suggest query params');
  });
});
