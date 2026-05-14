import { describe, it, expect, vi } from 'vitest';
import { PineconeIndexSession } from './indexes.js';
import type { SearchableIndex } from '../types.js';

/** Subclass so tests inject index handles without calling the real Pinecone SDK. */
class PineconeIndexSessionTestDouble extends PineconeIndexSession {
  constructor(
    private readonly pair: { dense: SearchableIndex; sparse: SearchableIndex }
  ) {
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

      const rows = await session.listNamespacesFromKeywordIndex();

      expect(rows).toEqual([{ namespace: 'papers', recordCount: 42 }]);
    });

    it('returns empty array when describeIndexStats throws', async () => {
      const sparse = {
        describeIndexStats: vi.fn().mockRejectedValue(new Error('stats unavailable')),
      } as unknown as SearchableIndex;
      const session = new PineconeIndexSessionTestDouble({
        dense: {} as SearchableIndex,
        sparse,
      });

      const rows = await session.listNamespacesFromKeywordIndex();

      expect(rows).toEqual([]);
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
      expect(rows).toEqual([]);
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
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual({ namespace: 'ns1', recordCount: 0, metadata: {} });
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
      expect(rows).toHaveLength(1);
      expect(rows[0]?.namespace).toBe('ns1');
      expect(rows[0]?.metadata['title']).toBe('string');
      expect(rows[0]?.metadata['tags']).toBe('string[]');
      expect(rows[0]?.metadata['emptyArr']).toBe('array');
      expect(rows[0]?.metadata['nested']).toBe('object');
    });
  });

  describe('checkIndexes', () => {
    it('returns ok when describeIndexStats succeeds for dense and sparse', async () => {
      const dense = { describeIndexStats: vi.fn().mockResolvedValue({}) } as unknown as SearchableIndex;
      const sparse = { describeIndexStats: vi.fn().mockResolvedValue({}) } as unknown as SearchableIndex;
      const session = new PineconeIndexSessionTestDouble({ dense, sparse });

      const result = await session.checkIndexes();
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns ok false when dense describeIndexStats throws', async () => {
      const dense = {
        describeIndexStats: vi.fn().mockRejectedValue(new Error('dense down')),
      } as unknown as SearchableIndex;
      const sparse = { describeIndexStats: vi.fn().mockResolvedValue({}) } as unknown as SearchableIndex;
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
