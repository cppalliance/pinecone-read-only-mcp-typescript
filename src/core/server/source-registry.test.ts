import { describe, expect, it, vi } from 'vitest';
import { buildSourceRegistry } from './source-registry.js';
import type { SourceDefinition } from './source-config.js';

const sources: SourceDefinition[] = [
  { name: 'api_key_1', apiKey: 'k1', indexName: 'idx-a', sparseIndexName: 'idx-a-sparse' },
  { name: 'api_key_2', apiKey: 'k2', indexName: 'idx-b', sparseIndexName: 'idx-b-sparse' },
];

function mockClient(name: string) {
  return {
    listNamespacesWithMetadata: vi.fn().mockResolvedValue({
      namespaces: [
        { namespace: 'wg21', recordCount: 10, metadata: { title: 'string' }, schema_source: 'sampled' },
      ],
      warnings: [],
    }),
    checkIndexes: vi.fn().mockResolvedValue({ ok: true, errors: [] }),
    getSparseIndexName: () => `${name}-sparse`,
  };
}

describe('SourceRegistry', () => {
  it('aggregates namespaces from all sources', async () => {
    const clients = new Map([
      ['api_key_1', mockClient('api_key_1') as never],
      ['api_key_2', mockClient('api_key_2') as never],
    ]);
    const registry = buildSourceRegistry({
      sources,
      defaultSource: 'api_key_1',
      cacheTtlMs: 60_000,
      defaultTopK: 10,
      requestTimeoutMs: 15_000,
      clients,
    });
    const result = await registry.getAllNamespacesWithCache();
    expect(result.data).toHaveLength(2);
    expect(result.data.map((n) => n.source).sort()).toEqual(['api_key_1', 'api_key_2']);
  });

  it('isolates per-source namespace caches', async () => {
    const client1 = mockClient('api_key_1');
    const client2 = mockClient('api_key_2');
    const clients = new Map([
      ['api_key_1', client1 as never],
      ['api_key_2', client2 as never],
    ]);
    const registry = buildSourceRegistry({
      sources,
      defaultSource: 'api_key_1',
      cacheTtlMs: 60_000,
      defaultTopK: 10,
      requestTimeoutMs: 15_000,
      clients,
    });
    await registry.getNamespacesWithCache('api_key_1');
    await registry.getNamespacesWithCache('api_key_2');
    expect(client1.listNamespacesWithMetadata).toHaveBeenCalledTimes(1);
    expect(client2.listNamespacesWithMetadata).toHaveBeenCalledTimes(1);
  });

  it('returns partial namespaces and source_errors when one source fails', async () => {
    const client1 = mockClient('api_key_1');
    const client2 = {
      listNamespacesWithMetadata: vi.fn().mockRejectedValue(new Error('api_key_2 unreachable')),
      checkIndexes: vi.fn().mockResolvedValue({ ok: true, errors: [] }),
      getSparseIndexName: () => 'api_key_2-sparse',
    };
    const clients = new Map([
      ['api_key_1', client1 as never],
      ['api_key_2', client2 as never],
    ]);
    const registry = buildSourceRegistry({
      sources,
      defaultSource: 'api_key_1',
      cacheTtlMs: 60_000,
      defaultTopK: 10,
      requestTimeoutMs: 15_000,
      clients,
    });
    const result = await registry.getAllNamespacesWithCache();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.source).toBe('api_key_1');
    expect(result.source_errors).toEqual({ api_key_2: 'api_key_2 unreachable' });
    expect(result.cache_hit).toBe(false);
  });

  it('aggregates warnings across sources in getAllNamespacesWithCache', async () => {
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
        warnings: [
          'Declared namespace "stale" not found in Pinecone index "idx-a" — schema declaration is stale.',
        ],
      }),
      checkIndexes: vi.fn().mockResolvedValue({ ok: true, errors: [] }),
      getSparseIndexName: () => 'idx-a-sparse',
    };
    const client2 = mockClient('api_key_2');
    const registry = buildSourceRegistry({
      sources: [
        {
          ...sources[0]!,
          namespaces: { stale: { metadata_schema: { title: 'string' } } },
        },
        sources[1]!,
      ],
      defaultSource: 'api_key_1',
      cacheTtlMs: 60_000,
      defaultTopK: 10,
      requestTimeoutMs: 15_000,
      clients: new Map([
        ['api_key_1', client1 as never],
        ['api_key_2', client2 as never],
      ]),
    });
    const result = await registry.getAllNamespacesWithCache();
    expect(result.warnings?.some((w) => w.includes('stale'))).toBe(true);
    expect(client1.listNamespacesWithMetadata).toHaveBeenCalledWith({
      stale: { title: 'string' },
    });
  });
});
