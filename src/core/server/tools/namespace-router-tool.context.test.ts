import { describe, expect, it, vi } from 'vitest';
import { registerNamespaceRouterTool } from './namespace-router-tool.js';
import { createMockServer, createTestServerContext, parseToolJson } from './test-helpers.js';

describe('namespace_router tool handler (ServerContext instance path)', () => {
  it('returns ranked suggestions from injected context cache miss', async () => {
    const listNamespacesWithMetadata = vi.fn().mockResolvedValue([
      {
        namespace: 'papers',
        recordCount: 42,
        metadata: { title: 'string', document_number: 'string' },
      },
    ]);
    const ctx = createTestServerContext({
      client: { listNamespacesWithMetadata } as never,
    });

    const server = createMockServer();
    registerNamespaceRouterTool(server as never, ctx);
    const raw = await server.getHandler('namespace_router')!({
      user_query: 'find cpp papers',
      top_n: 3,
    });
    const body = parseToolJson(raw);
    expect(body).toMatchObject({
      status: 'success',
      cache_hit: false,
      user_query: 'find cpp papers',
      recommended_namespace: 'papers',
    });
    expect(body['suggestions']).toEqual(
      expect.arrayContaining([expect.objectContaining({ namespace: 'papers' })])
    );
    expect(listNamespacesWithMetadata).toHaveBeenCalledOnce();
  });
});
