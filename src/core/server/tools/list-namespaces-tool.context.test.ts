import { describe, expect, it, vi } from 'vitest';
import { registerListNamespacesTool } from './list-namespaces-tool.js';
import { listNamespacesResponseSchema } from '../response-schemas.js';
import {
  createMockServer,
  createMultiSourceTestContext,
  createTestServerContext,
  expectMatchesResponseSchema,
  makeMockPineconeClient,
  parseToolJson,
} from './test-helpers.js';

describe('list_namespaces tool handler (ServerContext instance path)', () => {
  it('returns namespaces from injected context cache miss', async () => {
    const listNamespacesWithMetadata = vi.fn().mockResolvedValue([
      {
        namespace: 'wg21',
        recordCount: 10,
        metadata: { title: 'string', url: 'string' },
      },
    ]);
    const ctx = createTestServerContext({
      client: { listNamespacesWithMetadata } as never,
    });

    const server = createMockServer();
    registerListNamespacesTool(server as never, ctx);
    const raw = await server.getHandler('list_namespaces')!({});
    const body = parseToolJson(raw);
    expectMatchesResponseSchema(listNamespacesResponseSchema, body);
    expect(body).toMatchObject({
      status: 'success',
      cache_hit: false,
      count: 1,
    });
    expect(body['namespaces']).toEqual([
      {
        name: 'wg21',
        record_count: 10,
        metadata_fields: { title: 'string', url: 'string' },
      },
    ]);
    expect(listNamespacesWithMetadata).toHaveBeenCalledOnce();
  });

  it('serves cached namespaces on second call via injected context', async () => {
    const listNamespacesWithMetadata = vi.fn().mockResolvedValue([
      {
        namespace: 'wg21',
        recordCount: 10,
        metadata: { title: 'string' },
      },
    ]);
    const ctx = createTestServerContext({
      client: { listNamespacesWithMetadata } as never,
    });
    const server = createMockServer();
    registerListNamespacesTool(server as never, ctx);

    await server.getHandler('list_namespaces')!({});
    const raw = await server.getHandler('list_namespaces')!({});
    const body = parseToolJson(raw);
    expect(body['cache_hit']).toBe(true);
    expect(listNamespacesWithMetadata).toHaveBeenCalledOnce();
  });
});

describe('list_namespaces tool handler (multi-source)', () => {
  it('tags namespaces with source and propagates source_errors on partial failure', async () => {
    const publicClient = makeMockPineconeClient(['wg21']);
    const privateClient = {
      listNamespacesWithMetadata: vi.fn().mockRejectedValue(new Error('private unreachable')),
      query: vi.fn(),
      count: vi.fn(),
      keywordSearch: vi.fn(),
      checkIndexes: vi.fn().mockResolvedValue({ ok: true, errors: [] }),
      getSparseIndexName: () => 'sparse',
    };
    const clients = new Map([
      ['public', publicClient],
      ['private', privateClient],
    ]);
    const { ctx } = createMultiSourceTestContext({ clients });

    const server = createMockServer();
    registerListNamespacesTool(server as never, ctx);
    const body = parseToolJson(await server.getHandler('list_namespaces')!({}));
    expectMatchesResponseSchema(listNamespacesResponseSchema, body);
    const namespaces = body['namespaces'] as Array<{ name: string; source?: string }>;
    expect(namespaces).toHaveLength(1);
    expect(namespaces[0]).toMatchObject({ name: 'wg21', source: 'public' });
    expect(body['source_errors']).toEqual({ private: 'private unreachable' });
    expect(body['cache_hit']).toBe(false);
  });
});
