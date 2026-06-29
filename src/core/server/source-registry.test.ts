import { describe, expect, it, vi } from 'vitest';
import { buildSourceRegistry } from './source-registry.js';
import type { SourceDefinition } from './source-config.js';

const sources: SourceDefinition[] = [
  { name: 'public', apiKey: 'k1', indexName: 'idx-a', sparseIndexName: 'idx-a-sparse' },
  { name: 'private', apiKey: 'k2', indexName: 'idx-b', sparseIndexName: 'idx-b-sparse' },
];

function mockClient(name: string) {
  return {
    listNamespacesWithMetadata: vi.fn().mockResolvedValue([
      { namespace: 'wg21', recordCount: 10, metadata: { title: 'string' } },
    ]),
    checkIndexes: vi.fn().mockResolvedValue({ ok: true, errors: [] }),
    getSparseIndexName: () => `${name}-sparse`,
  };
}

describe('SourceRegistry', () => {
  it('aggregates namespaces from all sources', async () => {
    const clients = new Map([
      ['public', mockClient('public') as never],
      ['private', mockClient('private') as never],
    ]);
    const registry = buildSourceRegistry({
      sources,
      defaultSource: 'public',
      cacheTtlMs: 60_000,
      defaultTopK: 10,
      requestTimeoutMs: 15_000,
      clients,
    });
    const result = await registry.getAllNamespacesWithCache();
    expect(result.data).toHaveLength(2);
    expect(result.data.map((n) => n.source).sort()).toEqual(['private', 'public']);
  });

  it('isolates per-source namespace caches', async () => {
    const publicClient = mockClient('public');
    const privateClient = mockClient('private');
    const clients = new Map([
      ['public', publicClient as never],
      ['private', privateClient as never],
    ]);
    const registry = buildSourceRegistry({
      sources,
      defaultSource: 'public',
      cacheTtlMs: 60_000,
      defaultTopK: 10,
      requestTimeoutMs: 15_000,
      clients,
    });
    await registry.getNamespacesWithCache('public');
    await registry.getNamespacesWithCache('private');
    expect(publicClient.listNamespacesWithMetadata).toHaveBeenCalledTimes(1);
    expect(privateClient.listNamespacesWithMetadata).toHaveBeenCalledTimes(1);
  });
});
