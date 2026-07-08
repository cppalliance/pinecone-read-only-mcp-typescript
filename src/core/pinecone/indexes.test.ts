import { describe, it, expect, vi } from 'vitest';
import { PineconeIndexSession } from './indexes.js';
import type { SearchableIndex } from '../../types.js';

/** Subclass so tests inject index handles without calling the real Pinecone SDK. */
class PineconeIndexSessionTestDouble extends PineconeIndexSession {
  constructor(private readonly pair: { dense: SearchableIndex; sparse: SearchableIndex }) {
    super('test-api-key', 'test-index');
  }

  override async ensureIndexes(): Promise<{
    denseIndex: SearchableIndex;
    sparseIndex: SearchableIndex;
  }> {
    return { denseIndex: this.pair.dense, sparseIndex: this.pair.sparse };
  }
}

class ThrowingEnsureSession extends PineconeIndexSession {
  constructor() {
    super('test-api-key', 'test-index');
  }

  override async ensureIndexes(): Promise<{
    denseIndex: SearchableIndex;
    sparseIndex: SearchableIndex;
  }> {
    throw new Error('no client');
  }
}

describe('PineconeIndexSession', () => {
  describe('listNamespacesFromKeywordIndex', () => {
    it('returns namespace rows when describeIndexStats succeeds', async () => {
      const sparse = {
        describeIndexStats: vi.fn().mockResolvedValue({
          namespaces: { papers: { recordCount: 42 } },
        }),
      } as unknown as SearchableIndex;
      const session = new PineconeIndexSessionTestDouble({
        dense: {} as SearchableIndex,
        sparse,
      });

      const result = await session.listNamespacesFromKeywordIndex();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.namespaces).toEqual([{ namespace: 'papers', recordCount: 42 }]);
      }
    });

    it('returns ok false when describeIndexStats throws', async () => {
      const sparse = {
        describeIndexStats: vi.fn().mockRejectedValue(new Error('stats unavailable')),
      } as unknown as SearchableIndex;
      const session = new PineconeIndexSessionTestDouble({
        dense: {} as SearchableIndex,
        sparse,
      });

      const result = await session.listNamespacesFromKeywordIndex();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('stats unavailable');
      }
    });
  });

  describe('listNamespacesWithMetadata', () => {
    it('returns empty when dense stats have no namespaces', async () => {
      const dense = {
        describeIndexStats: vi.fn().mockResolvedValue({ namespaces: {} }),
      } as unknown as SearchableIndex;
      const session = new PineconeIndexSessionTestDouble({
        dense,
        sparse: {} as SearchableIndex,
      });

      const rows = await session.listNamespacesWithMetadata();
      expect(rows.namespaces).toEqual([]);
      expect(rows.warnings).toEqual([]);
    });

    it('returns row with empty metadata when recordCount is zero', async () => {
      const dense = {
        describeIndexStats: vi.fn().mockResolvedValue({
          namespaces: { ns1: { recordCount: 0 } },
        }),
        namespace: vi.fn(),
      } as unknown as SearchableIndex;
      const session = new PineconeIndexSessionTestDouble({
        dense,
        sparse: {} as SearchableIndex,
      });

      const rows = await session.listNamespacesWithMetadata();
      expect(rows.namespaces).toHaveLength(1);
      expect(rows.namespaces[0]).toEqual({
        namespace: 'ns1',
        recordCount: 0,
        metadata: {},
        schema_source: 'sampled',
      });
    });

    it('samples metadata when records exist and namespace.query returns matches', async () => {
      const dense = {
        describeIndexStats: vi.fn().mockResolvedValue({
          namespaces: { ns1: { recordCount: 2 } },
          dimension: 4,
        }),
        namespace: () => ({
          query: vi.fn().mockResolvedValue({
            matches: [
              {
                metadata: {
                  title: 'T',
                  tags: ['a', 'b'],
                  emptyArr: [],
                  nested: { x: 1 },
                },
              },
            ],
          }),
        }),
      } as unknown as SearchableIndex;
      const session = new PineconeIndexSessionTestDouble({
        dense,
        sparse: {} as SearchableIndex,
      });

      const rows = await session.listNamespacesWithMetadata();
      expect(rows.namespaces).toHaveLength(1);
      expect(rows.namespaces[0]?.namespace).toBe('ns1');
      expect(rows.namespaces[0]?.metadata['title']).toBe('string');
      expect(rows.namespaces[0]?.metadata['tags']).toBe('string[]');
      expect(rows.namespaces[0]?.metadata['emptyArr']).toBe('array');
      expect(rows.namespaces[0]?.metadata['nested']).toBe('object');
      expect(rows.namespaces[0]?.schema_source).toBe('sampled');
    });

    it('uses declared schema and skips sampling when declaredSchemas provides one', async () => {
      const query = vi.fn();
      const dense = {
        describeIndexStats: vi.fn().mockResolvedValue({
          namespaces: { declared_ns: { recordCount: 5 }, sampled_ns: { recordCount: 2 } },
          dimension: 4,
        }),
        namespace: () => ({ query }),
      } as unknown as SearchableIndex;
      const session = new PineconeIndexSessionTestDouble({
        dense,
        sparse: {} as SearchableIndex,
      });

      const rows = await session.listNamespacesWithMetadata({
        declared_ns: { title: 'string', author: 'string' },
      });

      const declared = rows.namespaces.find((n) => n.namespace === 'declared_ns');
      expect(declared).toMatchObject({
        metadata: { title: 'string', author: 'string' },
        schema_source: 'declared',
      });
      const sampled = rows.namespaces.find((n) => n.namespace === 'sampled_ns');
      expect(sampled?.schema_source).toBe('sampled');
      expect(query).toHaveBeenCalledOnce();
    });

    it('warns when declared namespace is missing from live Pinecone index', async () => {
      const dense = {
        describeIndexStats: vi.fn().mockResolvedValue({
          namespaces: { live_ns: { recordCount: 1 } },
        }),
        namespace: vi.fn(),
      } as unknown as SearchableIndex;
      const session = new PineconeIndexSessionTestDouble({
        dense,
        sparse: {} as SearchableIndex,
      });

      const rows = await session.listNamespacesWithMetadata({
        stale_ns: { title: 'string' },
      });

      expect(rows.namespaces.map((n) => n.namespace)).toEqual(['live_ns']);
      expect(rows.warnings.some((w) => w.includes('stale_ns'))).toBe(true);
    });
  });

  describe('checkIndexes', () => {
    it('returns ok when describeIndexStats succeeds for dense and sparse', async () => {
      const dense = {
        describeIndexStats: vi.fn().mockResolvedValue({}),
      } as unknown as SearchableIndex;
      const sparse = {
        describeIndexStats: vi.fn().mockResolvedValue({}),
      } as unknown as SearchableIndex;
      const session = new PineconeIndexSessionTestDouble({ dense, sparse });

      const result = await session.checkIndexes();
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns ok false when dense describeIndexStats throws', async () => {
      const dense = {
        describeIndexStats: vi.fn().mockRejectedValue(new Error('dense down')),
      } as unknown as SearchableIndex;
      const sparse = {
        describeIndexStats: vi.fn().mockResolvedValue({}),
      } as unknown as SearchableIndex;
      const session = new PineconeIndexSessionTestDouble({ dense, sparse });

      const result = await session.checkIndexes();
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('dense down'))).toBe(true);
    });

    it('returns ok false when ensureIndexes fails', async () => {
      const session = new ThrowingEnsureSession();
      const result = await session.checkIndexes();
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('no client'))).toBe(true);
    });
  });
});
