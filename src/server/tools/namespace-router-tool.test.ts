import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNamespacesWithCache } from '../namespaces-cache.js';
import { registerNamespaceRouterTool } from './namespace-router-tool.js';
import { assertToolError, createMockServer, makeNamespaceCacheEntry } from './test-helpers.js';

vi.mock('../namespaces-cache.js', () => ({
  getNamespacesWithCache: vi.fn(),
}));

const mockedGetNamespaces = vi.mocked(getNamespacesWithCache);

describe('namespace_router tool handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetNamespaces.mockResolvedValue({
      data: [makeNamespaceCacheEntry('papers')],
      cache_hit: false,
      expires_at: Date.now() + 1_800_000,
    });
  });

  it('returns VALIDATION when user_query is empty', async () => {
    const server = createMockServer();
    registerNamespaceRouterTool(server as never);
    const raw = await server.getHandler('namespace_router')!({
      user_query: '  ',
      top_n: 3,
    });
    const err = assertToolError(raw);
    expect(err.code).toBe('VALIDATION');
    expect(err.field).toBe('user_query');
  });

  it('returns PINECONE_ERROR when getNamespacesWithCache throws', async () => {
    mockedGetNamespaces.mockRejectedValue(new Error('cache failure'));
    const server = createMockServer();
    registerNamespaceRouterTool(server as never);
    const raw = await server.getHandler('namespace_router')!({
      user_query: 'find cpp papers',
      top_n: 2,
    });
    expect(assertToolError(raw).code).toBe('PINECONE_ERROR');
  });
});
