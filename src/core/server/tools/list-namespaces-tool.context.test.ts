import { describe, expect, it, vi } from 'vitest';
import { setLogLevel } from '../../../logger.js';
import { registerListNamespacesTool } from './list-namespaces-tool.js';
import { listNamespacesResponseSchema } from '../response-schemas.js';
import {
  createMockServer,
  createMultiSourceTestContext,
  createTestServerContext,
  expectMatchesResponseSchema,
  makePartialFailureMultiSourceClients,
  mockNamespacesWithMetadataResult,
  parseToolJson,
  PCSK_KEY,
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
    const clients = makePartialFailureMultiSourceClients('api_key_2 unreachable');
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

  it('redacts a credential-shaped token embedded in a source_errors rejection message at DEBUG log level', async () => {
    setLogLevel('DEBUG');
    try {
      const clients = makePartialFailureMultiSourceClients(
        `api_key_2 unreachable: auth failed ${PCSK_KEY}`
      );
      const { ctx } = createMultiSourceTestContext({ clients });

      const server = createMockServer();
      registerListNamespacesTool(server as never, ctx);
      const raw = await server.getHandler('list_namespaces')!({});
      const text = raw.content[0]!.text;
      expect(text).not.toContain(PCSK_KEY);
      expect(text).toContain('***');

      const body = parseToolJson(raw);
      expectMatchesResponseSchema(listNamespacesResponseSchema, body);
      expect(body['source_errors']).toMatchObject({
        api_key_2: expect.not.stringContaining(PCSK_KEY),
      });
    } finally {
      setLogLevel('INFO');
    }
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

  it('surfaces per-namespace description from private config on matching live rows', async () => {
    const client1 = {
      listNamespacesWithMetadata: vi.fn().mockResolvedValue({
        namespaces: [
          {
            namespace: 'wg21',
            recordCount: 10,
            metadata: { title: 'string' },
            schema_source: 'sampled',
          },
        ],
        warnings: [],
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
            wg21: { description: 'WG21 papers corpus' },
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
        schema_source: 'sampled',
        description: 'WG21 papers corpus',
      },
    ]);
  });
});
