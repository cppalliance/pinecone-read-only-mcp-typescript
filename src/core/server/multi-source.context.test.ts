import { describe, expect, it, vi } from 'vitest';
import { resolveConfig } from '../config.js';
import { ServerContext } from './server-context.js';
import { buildSourceRegistry } from './source-registry.js';
import type { SourceDefinition } from './source-config.js';

const sources: SourceDefinition[] = [
  { name: 'public', apiKey: 'k1', indexName: 'idx-a', sparseIndexName: 'idx-a-sparse' },
  { name: 'private', apiKey: 'k2', indexName: 'idx-b', sparseIndexName: 'idx-b-sparse' },
];

function mockClient(namespaces: string[]) {
  return {
    listNamespacesWithMetadata: vi.fn().mockResolvedValue(
      namespaces.map((namespace) => ({
        namespace,
        recordCount: 1,
        metadata: { title: 'string' },
      }))
    ),
    checkIndexes: vi.fn().mockResolvedValue({ ok: true, errors: [] }),
    getSparseIndexName: () => 'sparse',
  };
}

function multiSourceContext() {
  const clients = new Map([
    ['public', mockClient(['wg21', 'shared']) as never],
    ['private', mockClient(['shared', 'internal']) as never],
  ]);
  const registry = buildSourceRegistry({
    sources,
    defaultSource: 'public',
    cacheTtlMs: 60_000,
    defaultTopK: 10,
    requestTimeoutMs: 15_000,
    clients,
  });
  const config = resolveConfig({
    sources: 'public:k1:idx-a;private:k2:idx-b',
    disableSuggestFlow: false,
  });
  return new ServerContext(config, { sourceRegistry: registry });
}

describe('multi-source ServerContext', () => {
  it('resolveSource returns AMBIGUOUS_NAMESPACE when namespace exists on multiple sources', async () => {
    const ctx = multiSourceContext();
    const result = await ctx.resolveSource(undefined, 'shared');
    expect(result).toEqual({
      ok: false,
      code: 'AMBIGUOUS_NAMESPACE',
      message: 'Namespace "shared" exists on multiple sources. Pass source explicitly.',
    });
  });

  it('resolveSource infers source when namespace is unique', async () => {
    const ctx = multiSourceContext();
    const result = await ctx.resolveSource(undefined, 'wg21');
    expect(result).toEqual({ ok: true, source: 'public' });
  });

  it('isolates compound suggest-flow keys per source', () => {
    const ctx = multiSourceContext();
    ctx.markSuggested(
      'shared',
      { recommended_tool: 'fast', suggested_fields: ['title'], user_query: 'q1' },
      'public'
    );
    ctx.markSuggested(
      'shared',
      { recommended_tool: 'count', suggested_fields: [], user_query: 'q2' },
      'private'
    );
    expect(ctx.requireSuggested('shared', 'public').ok).toBe(true);
    expect(ctx.requireSuggested('shared', 'private').ok).toBe(true);
    expect(ctx.requireSuggested('shared', 'public').flow?.user_query).toBe('q1');
    expect(ctx.requireSuggested('shared', 'private').flow?.user_query).toBe('q2');
  });

  it('registers URL generators per source without collision', () => {
    const ctx = multiSourceContext();
    ctx.registerUrlGenerator('shared', () => ({ url: 'https://public.example', method: 'generated' }), 'public');
    ctx.registerUrlGenerator('shared', () => ({ url: 'https://private.example', method: 'generated' }), 'private');
    expect(ctx.generateUrlForNamespace('shared', {}, 'public').url).toBe('https://public.example');
    expect(ctx.generateUrlForNamespace('shared', {}, 'private').url).toBe('https://private.example');
  });
});
