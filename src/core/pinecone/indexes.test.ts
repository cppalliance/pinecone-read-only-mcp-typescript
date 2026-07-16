import { describe, it, expect, vi, afterEach } from 'vitest';
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

/** Session with a short timeout for fake-timer I/O deadline tests. */
class TimeoutIndexSession extends PineconeIndexSession {
  constructor(
    private readonly pair: { dense: SearchableIndex; sparse: SearchableIndex },
    requestTimeoutMs = 50
  ) {
    super('test-api-key', 'test-index', undefined, requestTimeoutMs);
  }

  override async ensureIndexes(): Promise<{
    denseIndex: SearchableIndex;
    sparseIndex: SearchableIndex;
  }> {
    return { denseIndex: this.pair.dense, sparseIndex: this.pair.sparse };
  }
}

afterEach(() => {
  vi.useRealTimers();
});

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

    it('retries describeIndexStats on 503 then succeeds', async () => {
      let n = 0;
      const sparse = {
        describeIndexStats: vi.fn().mockImplementation(async () => {
          n++;
          if (n < 2) throw new Error('HTTP 503');
          return { namespaces: { papers: { recordCount: 7 } } };
        }),
      } as unknown as SearchableIndex;
      const session = new PineconeIndexSessionTestDouble({
        dense: {} as SearchableIndex,
        sparse,
      });

      const result = await session.listNamespacesFromKeywordIndex();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.namespaces).toEqual([{ namespace: 'papers', recordCount: 7 }]);
      }
      expect(sparse.describeIndexStats).toHaveBeenCalledTimes(2);
    });

    it('times out describeIndexStats at requestTimeoutMs', async () => {
      vi.useFakeTimers();
      const sparse = {
        describeIndexStats: vi.fn(() => new Promise(() => {})),
      } as unknown as SearchableIndex;
      const session = new TimeoutIndexSession({ dense: {} as SearchableIndex, sparse });
      const p = session.listNamespacesFromKeywordIndex();
      const assertion = expect(p).resolves.toMatchObject({
        ok: false,
        error: expect.stringMatching(
          /Timeout after 50ms while waiting for describeIndexStats-sparse/
        ),
      });
      await vi.advanceTimersByTimeAsync(50);
      await assertion;
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

    it('times out metadata sampling at requestTimeoutMs', async () => {
      vi.useFakeTimers();
      const dense = {
        describeIndexStats: vi.fn().mockResolvedValue({
          namespaces: { ns1: { recordCount: 2 } },
          dimension: 4,
        }),
        namespace: vi.fn().mockReturnValue({
          query: vi.fn(() => new Promise(() => {})),
        }),
      } as unknown as SearchableIndex;
      const session = new TimeoutIndexSession({ dense, sparse: {} as SearchableIndex });
      const p = session.listNamespacesWithMetadata();
      const assertion = expect(p).resolves.toMatchObject({
        namespaces: [
          {
            namespace: 'ns1',
            recordCount: 2,
            metadata: {},
            schema_source: 'sampled',
          },
        ],
      });
      await vi.advanceTimersByTimeAsync(50);
      await assertion;
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

    it('warns when declaredNamespaceNames includes description-only stale namespace', async () => {
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

      const rows = await session.listNamespacesWithMetadata(undefined, ['desc_only_stale']);

      expect(rows.namespaces.map((n) => n.namespace)).toEqual(['live_ns']);
      expect(rows.warnings.some((w) => w.includes('desc_only_stale'))).toBe(true);
    });

    it('samples description-only live namespace when no metadata_schema declared', async () => {
      const query = vi.fn().mockResolvedValue({
        matches: [{ metadata: { title: 'T' } }],
      });
      const dense = {
        describeIndexStats: vi.fn().mockResolvedValue({
          namespaces: { live_ns: { recordCount: 2 } },
          dimension: 4,
        }),
        namespace: () => ({ query }),
      } as unknown as SearchableIndex;
      const session = new PineconeIndexSessionTestDouble({
        dense,
        sparse: {} as SearchableIndex,
      });

      const rows = await session.listNamespacesWithMetadata(undefined, ['live_ns']);

      expect(rows.warnings).toEqual([]);
      expect(rows.namespaces[0]).toMatchObject({
        namespace: 'live_ns',
        schema_source: 'sampled',
      });
      expect(query).toHaveBeenCalledOnce();
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

  describe('fetchRecordFields', () => {
    class FetchFieldsSession extends PineconeIndexSession {
      constructor(
        private readonly fetchResponse: {
          records?: Record<string, { metadata?: Record<string, unknown>; [key: string]: unknown }>;
        }
      ) {
        super('test-api-key', 'test-index');
      }

      override ensureClient() {
        return {
          index: () => ({
            fetch: vi.fn().mockResolvedValue(this.fetchResponse),
          }),
        } as never;
      }
    }

    it('merges metadata and top-level scalar fields', async () => {
      const session = new FetchFieldsSession({
        records: {
          schema_manifest: {
            id: 'schema_manifest',
            chunk_text: '{"ok":true}',
            metadata: { extra: 'meta' },
          },
        },
      });

      const fields = await session.fetchRecordFields('_mcp_config', 'schema_manifest');
      expect(fields).toMatchObject({
        extra: 'meta',
        chunk_text: '{"ok":true}',
        id: 'schema_manifest',
      });
    });

    it('returns null when record is missing', async () => {
      const session = new FetchFieldsSession({ records: {} });
      const fields = await session.fetchRecordFields('_mcp_config', 'schema_manifest');
      expect(fields).toBeNull();
    });

    it('returns metadata-only fields when chunk_text is only in metadata', async () => {
      const session = new FetchFieldsSession({
        records: {
          schema_manifest: {
            metadata: { chunk_text: '{"from":"metadata"}' },
          },
        },
      });

      const fields = await session.fetchRecordFields('_mcp_config', 'schema_manifest');
      expect(fields?.chunk_text).toBe('{"from":"metadata"}');
    });

    it('rejects when fetch exceeds requestTimeoutMs', async () => {
      class HangingFetchSession extends PineconeIndexSession {
        constructor() {
          super('test-api-key', 'test-index', undefined, 50);
        }

        override ensureClient() {
          return {
            index: () => ({
              fetch: () => new Promise(() => {}),
            }),
          } as never;
        }
      }

      const session = new HangingFetchSession();
      await expect(session.fetchRecordFields('_mcp_config', 'schema_manifest')).rejects.toThrow(
        /Timeout after 50ms while waiting for fetchRecordFields/
      );
    });

    it('retries fetch on 503 then succeeds', async () => {
      let n = 0;
      class RetryFetchSession extends PineconeIndexSession {
        override ensureClient() {
          return {
            index: () => ({
              fetch: vi.fn().mockImplementation(async () => {
                n++;
                if (n < 2) throw new Error('HTTP 503');
                return {
                  records: {
                    schema_manifest: { metadata: { chunk_text: '{"ok":true}' } },
                  },
                };
              }),
            }),
          } as never;
        }
      }

      const session = new RetryFetchSession();
      const fields = await session.fetchRecordFields('_mcp_config', 'schema_manifest');
      expect(fields?.chunk_text).toBe('{"ok":true}');
      expect(n).toBe(2);
    });
  });
});
