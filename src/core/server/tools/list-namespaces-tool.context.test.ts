import { describe, expect, it, vi } from 'vitest';
import { registerListNamespacesTool } from './list-namespaces-tool.js';
import { listNamespacesResponseSchema } from '../response-schemas.js';
import {
  createMockServer,
  createMultiSourceTestContext,
  createTestServerContext,
  expectMatchesResponseSchema,
  makeMockPineconeClient,
  mockNamespacesWithMetadataResult,
  parseToolJson,
} from './test-helpers.js';

describe('list_namespaces tool handler (ServerContext instance path)', () => {
  it('returns namespaces from injected context cache miss', async () => {
    const listNamespacesWithMetadata = vi.fn().mockResolvedValue(
      mockNamespacesWithMetadataResult([
        {
          namespace: 'wg21',
          recordCount: 10,
          metadata: { title: 'string', url: 'string' },
        },
      ])
    );
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
        schema_source: 'sampled',
      },
    ]);
    expect(listNamespacesWithMetadata).toHaveBeenCalledOnce();
  });

  it('serves cached namespaces on second call via injected context', async () => {
    const listNamespacesWithMetadata = vi.fn().mockResolvedValue(
      mockNamespacesWithMetadataResult([
        {
          namespace: 'wg21',
          recordCount: 10,
          metadata: { title: 'string' },
        },
      ])
    );
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
    const client1 = makeMockPineconeClient(['wg21']);
    const client2 = {
      listNamespacesWithMetadata: vi.fn().mockRejectedValue(new Error('api_key_2 unreachable')),
      query: vi.fn(),
      count: vi.fn(),
      keywordSearch: vi.fn(),
      checkIndexes: vi.fn().mockResolvedValue({ ok: true, errors: [] }),
      getSparseIndexName: () => 'sparse',
    };
    const clients = new Map([
      ['api_key_1', client1],
      ['api_key_2', client2],
    ]);
    const { ctx } = createMultiSourceTestContext({ clients });

    const server = createMockServer();
    registerListNamespacesTool(server as never, ctx);
    const body = parseToolJson(await server.getHandler('list_namespaces')!({}));
    expectMatchesResponseSchema(listNamespacesResponseSchema, body);
    const namespaces = body['namespaces'] as Array<{ name: string; source?: string }>;
    expect(namespaces).toHaveLength(1);
    expect(namespaces[0]).toMatchObject({ name: 'wg21', source: 'api_key_1' });
    expect(body['source_errors']).toEqual({ api_key_2: 'api_key_2 unreachable' });
    expect(body['cache_hit']).toBe(false);
  });

  it('surfaces schema_source and config_warnings when declarations mismatch live data', async () => {
    const client1 = {
      listNamespacesWithMetadata: vi.fn().mockResolvedValue({
        namespaces: [
          {
            namespace: 'wg21',
            recordCount: 10,
            metadata: { title: 'string' },
            schema_source: 'declared',
          },
        ],
        warnings: [
          'Declared namespace "stale_ns" not found in Pinecone index "idx-a" — schema declaration is stale.',
        ],
      }),
      query: vi.fn(),
      count: vi.fn(),
      keywordSearch: vi.fn(),
      checkIndexes: vi.fn().mockResolvedValue({ ok: true, errors: [] }),
      getSparseIndexName: () => 'sparse',
    };
    const { ctx } = createMultiSourceTestContext({
      clients: new Map([['api_key_1', client1 as never]]),
      sources: [
        {
          name: 'api_key_1',
          apiKey: 'k1',
          indexName: 'idx-a',
          namespaces: {
            wg21: { metadata_schema: { title: 'string' } },
            stale_ns: { metadata_schema: { title: 'string' } },
          },
        },
        {
          name: 'api_key_2',
          apiKey: 'k2',
          indexName: 'idx-b',
        },
      ],
    });

    const server = createMockServer();
    registerListNamespacesTool(server as never, ctx);
    const body = parseToolJson(
      await server.getHandler('list_namespaces')!({ source: 'api_key_1' })
    );
    expect(body['namespaces']).toEqual([
      {
        name: 'wg21',
        record_count: 10,
        metadata_fields: { title: 'string' },
        source: 'api_key_1',
        schema_source: 'declared',
      },
    ]);
    expect(body['config_warnings']).toEqual([
      'Declared namespace "stale_ns" not found in Pinecone index "idx-a" — schema declaration is stale.',
    ]);
  });
});
