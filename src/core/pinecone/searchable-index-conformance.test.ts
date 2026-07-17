import { describe, it, expect } from 'vitest';
import { Pinecone } from '@pinecone-database/pinecone';

/**
 * SDK-shape conformance guard for SearchableIndex (#220).
 *
 * `indexes.ts` force-casts `pc.index(...)` to `SearchableIndex` with `as unknown as`,
 * which erases type checking, and the other tests only mock our own interface. So
 * nothing verifies the real SDK index still provides the members the code calls. If a
 * Pinecone SDK bump renames or removes one, it slips past the compiler and fails at
 * runtime in production. This asserts those members exist on a real SDK index, so a
 * drift fails here loudly instead.
 *
 * A compile-time assertion was tried but the SDK types the index too loosely to catch
 * drift, so this is a runtime existence check. `pc.index()` returns a handle
 * synchronously with no network call, so it needs no live Pinecone.
 */
describe('SearchableIndex SDK conformance (#220)', () => {
  const index = new Pinecone({ apiKey: 'pc-conformance-test' }).index(
    'conformance-test'
  ) as unknown as Record<string, unknown>;

  // Called on the top-level index: indexes.ts uses describeIndexStats() and
  // namespace(), and search.ts uses searchRecords() on the index fallback branch.
  it.each(['describeIndexStats', 'namespace', 'searchRecords'] as const)(
    'the SDK index exposes %s()',
    (method) => {
      expect(typeof index[method]).toBe('function');
    }
  );

  // Called on the namespace handle from index.namespace(ns): indexes.ts does
  // namespace(ns).query(...) and search.ts does namespace(ns).searchRecords(...).
  const namespaceHandle = (index.namespace as (name: string) => Record<string, unknown>)(
    'conformance-test'
  );
  it.each(['query', 'searchRecords'] as const)(
    'the SDK namespace handle exposes %s()',
    (method) => {
      expect(typeof namespaceHandle[method]).toBe('function');
    }
  );

  // indexes.ts must call SDK methods on the index/namespace receiver inside runIo;
  // detached calls throw against the real SDK (wpak-ai PR #225).
  it('describeIndexStats throws when called detached from the index', () => {
    const describeIndexStats = index.describeIndexStats as () => Promise<unknown>;
    expect(() => describeIndexStats()).toThrow(
      /_describeIndexStats|Cannot read properties of undefined/
    );
  });

  it('namespace().query rejects when called detached from the namespace handle', async () => {
    const query = namespaceHandle.query as (opts: {
      topK: number;
      vector: number[];
      includeMetadata: boolean;
    }) => Promise<unknown>;
    await expect(query({ topK: 1, vector: [0], includeMetadata: true })).rejects.toThrow(
      /_queryCommand|Cannot read properties of undefined/
    );
  });
});
