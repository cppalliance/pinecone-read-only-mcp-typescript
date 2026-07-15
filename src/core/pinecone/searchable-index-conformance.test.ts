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
});
