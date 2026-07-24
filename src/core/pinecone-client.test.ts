import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PineconeClient } from './pinecone-client.js';
import { resolveConfig } from './config.js';
import type { SearchableIndex, PineconeHit } from '../types.js';
import * as rerankModule from './pinecone/rerank.js';
import { DENSE_LEG_FAILED_REASON, SPARSE_LEG_FAILED_REASON } from '../constants.js';
import { AppTimeoutError } from './server/retry.js';

/** Stubs for private methods (assigned at runtime; avoid intersecting private `PineconeClient` members). */
type PineconeClientMethodStubs = {
  ensureIndexes: () => Promise<{ denseIndex: SearchableIndex; sparseIndex: SearchableIndex }>;
  searchIndex: (
    index: SearchableIndex,
    query: string,
    topK: number,
    namespace?: string,
    metadataFilter?: Record<string, unknown>,
    options?: { fields?: string[] }
  ) => Promise<PineconeHit[]>;
};

function stubPineconeClient(client: PineconeClient): PineconeClientMethodStubs {
  return client as unknown as PineconeClientMethodStubs;
}

function stubDualLegSearchFailure(testClient: PineconeClientMethodStubs, searchError: Error): void {
  testClient.ensureIndexes = async () => ({
    denseIndex: {} as SearchableIndex,
    sparseIndex: {} as SearchableIndex,
  });
  testClient.searchIndex = async () => {
    throw searchError;
  };
}

function stubSingleLegHybridFailure(
  testClient: PineconeClientMethodStubs,
  options: {
    failedLeg: 'dense' | 'sparse';
    survivorHits: PineconeHit[];
  }
): void {
  const denseRef = {} as SearchableIndex;
  const sparseRef = {} as SearchableIndex;
  const failedRef = options.failedLeg === 'dense' ? denseRef : sparseRef;

  testClient.ensureIndexes = async () => ({
    denseIndex: denseRef,
    sparseIndex: sparseRef,
  });
  testClient.searchIndex = async (index) => {
    if (index === failedRef) {
      throw new Error(`${options.failedLeg} failure`);
    }
    return options.survivorHits;
  };
}

describe('PineconeClient', () => {
  let client: PineconeClient;

  beforeEach(() => {
    client = new PineconeClient({
      apiKey: 'test-api-key',
      indexName: 'test-index',
      rerankModel: 'test-model',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(client).toBeDefined();
    });

    it('honors resolveConfig overrides without PINECONE_* env on the client path', () => {
      const prevIndex = process.env['PINECONE_INDEX_NAME'];
      const prevModel = process.env['PINECONE_RERANK_MODEL'];
      const prevTopK = process.env['PINECONE_TOP_K'];
      delete process.env['PINECONE_INDEX_NAME'];
      delete process.env['PINECONE_RERANK_MODEL'];
      delete process.env['PINECONE_TOP_K'];
      try {
        const resolved = resolveConfig({
          apiKey: 'test-api-key',
          indexName: 'resolved-index',
          rerankModel: 'resolved-model',
          defaultTopK: 42,
        });
        const c = new PineconeClient({
          apiKey: resolved.apiKey,
          indexName: resolved.indexName,
          rerankModel: resolved.rerankModel,
          defaultTopK: resolved.defaultTopK,
        });
        expect(c.getSparseIndexName()).toBe('resolved-index-sparse');
      } finally {
        if (prevIndex !== undefined) process.env['PINECONE_INDEX_NAME'] = prevIndex;
        else delete process.env['PINECONE_INDEX_NAME'];
        if (prevModel !== undefined) process.env['PINECONE_RERANK_MODEL'] = prevModel;
        else delete process.env['PINECONE_RERANK_MODEL'];
        if (prevTopK !== undefined) process.env['PINECONE_TOP_K'] = prevTopK;
        else delete process.env['PINECONE_TOP_K'];
      }
    });
  });

  describe('fetchRecordFields', () => {
    it('delegates to indexSession.fetchRecordFields', async () => {
      const fields = { chunk_text: '{"ok":true}' };
      const fetchMock = vi.fn().mockResolvedValue(fields);
      Object.assign(client, {
        indexSession: { fetchRecordFields: fetchMock },
      });

      const result = await client.fetchRecordFields('_mcp_config', 'schema_manifest');

      expect(fetchMock).toHaveBeenCalledWith('_mcp_config', 'schema_manifest');
      expect(result).toEqual(fields);
    });
  });

  describe('query', () => {
    it('should throw error for empty query', async () => {
      await expect(
        client.query({
          query: '',
          namespace: 'test',
        })
      ).rejects.toThrow('Query cannot be empty');
    });

    it('should throw error for topK less than 1', async () => {
      await expect(
        client.query({
          query: 'test query',
          namespace: 'test',
          topK: 0,
        })
      ).rejects.toThrow('topK must be at least 1');
    });

    it('should continue hybrid search when one index fails', async () => {
      const testClient = stubPineconeClient(client);
      stubSingleLegHybridFailure(testClient, {
        failedLeg: 'dense',
        survivorHits: [
          {
            _id: 'doc-1',
            _score: 0.9,
            fields: { chunk_text: 'hybrid content', author: 'tester' },
          },
        ],
      });

      const out = await client.query({
        query: 'hybrid search',
        namespace: 'test',
        topK: 5,
        useReranking: false,
      });

      expect(out.results).toHaveLength(1);
      expect(out.results[0]?.content).toBe('hybrid content');
      expect(out.results[0]?.metadata.author).toBe('tester');
      expect(out.hybrid_leg_failed).toBe('dense');
      expect(out.degraded).toBe(false);
    });

    it('reports hybrid_leg_failed and degraded when dense fails and sparse returns empty', async () => {
      const testClient = stubPineconeClient(client);
      stubSingleLegHybridFailure(testClient, { failedLeg: 'dense', survivorHits: [] });

      const out = await client.query({
        query: 'hybrid search',
        namespace: 'test',
        topK: 5,
        useReranking: false,
      });

      expect(out.results).toHaveLength(0);
      expect(out.hybrid_leg_failed).toBe('dense');
      expect(out.degraded).toBe(true);
      expect(out.degradation_reason).toBe(DENSE_LEG_FAILED_REASON);
    });

    it('reports hybrid_leg_failed and degraded when sparse fails and dense returns empty', async () => {
      const testClient = stubPineconeClient(client);
      stubSingleLegHybridFailure(testClient, { failedLeg: 'sparse', survivorHits: [] });

      const out = await client.query({
        query: 'hybrid search',
        namespace: 'test',
        topK: 5,
        useReranking: false,
      });

      expect(out.results).toHaveLength(0);
      expect(out.hybrid_leg_failed).toBe('sparse');
      expect(out.degraded).toBe(true);
      expect(out.degradation_reason).toBe(SPARSE_LEG_FAILED_REASON);
    });

    it('returns no degradation when both legs succeed with empty hits', async () => {
      const testClient = stubPineconeClient(client);
      testClient.ensureIndexes = async () => ({
        denseIndex: {} as SearchableIndex,
        sparseIndex: {} as SearchableIndex,
      });
      testClient.searchIndex = async () => [];

      const out = await client.query({
        query: 'hybrid search',
        namespace: 'test',
        topK: 5,
        useReranking: false,
      });

      expect(out.results).toHaveLength(0);
      expect(out.hybrid_leg_failed).toBeNull();
      expect(out.degraded).toBe(false);
      expect(out.degradation_reason).toBeUndefined();
    });

    it('prioritizes leg-failure degradation_reason over rerank_skipped_no_model when both apply', async () => {
      const noModelClient = new PineconeClient({
        apiKey: 'test-api-key',
        indexName: 'test-index',
      });
      const testClient = stubPineconeClient(noModelClient);
      stubSingleLegHybridFailure(testClient, { failedLeg: 'dense', survivorHits: [] });

      const out = await noModelClient.query({
        query: 'hybrid search',
        namespace: 'test',
        topK: 5,
        useReranking: true,
      });

      expect(out.hybrid_leg_failed).toBe('dense');
      expect(out.degraded).toBe(true);
      expect(out.degradation_reason).toBe(DENSE_LEG_FAILED_REASON);
      expect(out.rerank_skipped_reason).toBe('no_model');
    });

    it('should throw when both dense and sparse searches fail', async () => {
      const testClient = stubPineconeClient(client);
      stubDualLegSearchFailure(testClient, new Error('index failure'));

      await expect(
        client.query({
          query: 'hybrid search',
          namespace: 'test',
          topK: 5,
          useReranking: false,
        })
      ).rejects.toThrow('Hybrid search failed: both dense and sparse index searches failed.');
    });

    it('propagates app timeout when both dense and sparse searches fail', async () => {
      const testClient = stubPineconeClient(client);
      stubDualLegSearchFailure(testClient, new AppTimeoutError(50, 'search'));

      await expect(
        client.query({
          query: 'hybrid search',
          namespace: 'test',
          topK: 5,
          useReranking: false,
        })
      ).rejects.toBeInstanceOf(AppTimeoutError);
    });
  });

  describe('count', () => {
    it('should return unique document count using semantic search only with minimal fields', async () => {
      const testClient = stubPineconeClient(client);
      testClient.ensureIndexes = async () => ({
        denseIndex: {} as SearchableIndex,
        sparseIndex: {} as SearchableIndex,
      });

      // Two chunks from doc A, one from doc B -> unique count 2
      testClient.searchIndex = async (_index, _query, _topK, _ns, _filter, options) => {
        expect(options?.fields).toEqual(['document_number', 'url', 'doc_id']);
        return [
          {
            _id: 'c1',
            _score: 1,
            fields: { document_number: 'p1234r0', url: 'https://example.com/1' },
          },
          {
            _id: 'c2',
            _score: 0.9,
            fields: { document_number: 'p1234r0', url: 'https://example.com/1' },
          },
          {
            _id: 'c3',
            _score: 0.8,
            fields: { document_number: 'p5678r0', url: 'https://example.com/2' },
          },
        ];
      };

      const result = await client.count({
        query: 'paper',
        namespace: 'wg21-papers',
        metadataFilter: { author: { $in: ['John Doe'] } },
      });

      expect(result.count).toBe(2);
      expect(result.truncated).toBe(false);
    });

    it('should set truncated when hit limit is reached', async () => {
      const testClient = stubPineconeClient(client);
      testClient.ensureIndexes = async () => ({
        denseIndex: {} as SearchableIndex,
        sparseIndex: {} as SearchableIndex,
      });
      const manyHits: PineconeHit[] = Array.from({ length: 10000 }, (_, i) => ({
        _id: `id-${i}`,
        _score: 1,
        fields: { doc_id: `doc-${i}` },
      }));
      testClient.searchIndex = async () => manyHits;

      const result = await client.count({ query: 'paper', namespace: 'ns' });

      expect(result.count).toBe(10000);
      expect(result.truncated).toBe(true);
    });

    it('falls back to chunk _id when no document identifier fields exist', async () => {
      const testClient = stubPineconeClient(client);
      testClient.ensureIndexes = async () => ({
        denseIndex: {} as SearchableIndex,
        sparseIndex: {} as SearchableIndex,
      });
      testClient.searchIndex = async () => [
        { _id: 'chunk-only', _score: 1, fields: { chunk_text: 'x' } },
      ];

      const result = await client.count({ query: 'paper', namespace: 'ns' });

      expect(result.count).toBe(1);
      expect(result.truncated).toBe(false);
    });
  });

  describe('getSparseIndexName', () => {
    it('returns {indexName}-sparse derived from config indexName', () => {
      const c = new PineconeClient({ apiKey: 'k', indexName: 'my' });
      expect(c.getSparseIndexName()).toBe('my-sparse');
    });
  });

  describe('query (rerank and fields)', () => {
    it('rejects non-finite topK', async () => {
      await expect(client.query({ query: 'q', namespace: 'n', topK: Number.NaN })).rejects.toThrow(
        'topK must be a finite number'
      );
    });

    it('adds chunk_text to requested fields when reranking', async () => {
      const testClient = stubPineconeClient(client);
      const denseRef = {} as SearchableIndex;
      const sparseRef = {} as SearchableIndex;
      testClient.ensureIndexes = async () => ({
        denseIndex: denseRef,
        sparseIndex: sparseRef,
      });
      let fieldsPassed: string[] | undefined;
      testClient.searchIndex = async (_index, _q, _tk, _ns, _f, opts) => {
        fieldsPassed = opts?.fields;
        return [];
      };

      await client.query({
        query: 'q',
        namespace: 'n',
        topK: 5,
        useReranking: true,
        fields: ['title', 'url'],
      });

      expect(fieldsPassed).toBeDefined();
      expect(fieldsPassed).toContain('chunk_text');
      expect(fieldsPassed).toContain('title');
    });

    it('skips rerank API when rerankModel is not configured even if useReranking is true', async () => {
      const noRerankClient = new PineconeClient({
        apiKey: 'test-api-key',
        indexName: 'test-index',
      });
      const spy = vi.spyOn(rerankModule, 'rerankResults');
      try {
        const testClient = stubPineconeClient(noRerankClient);
        const denseRef = {} as SearchableIndex;
        const sparseRef = {} as SearchableIndex;
        testClient.ensureIndexes = async () => ({
          denseIndex: denseRef,
          sparseIndex: sparseRef,
        });
        testClient.searchIndex = async (index) => {
          if (index === denseRef) {
            return [{ _id: 'd1', _score: 0.9, fields: { chunk_text: 'plain' } }];
          }
          return [];
        };

        const results = await noRerankClient.query({
          query: 'q',
          namespace: 'n',
          topK: 5,
          useReranking: true,
        });

        expect(results.results).toHaveLength(1);
        expect(results.results[0]?.reranked).toBe(false);
        expect(results.rerank_skipped_reason).toBe('no_model');
        expect(results.degradation_reason).toMatch(/rerank_skipped_no_model/);
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it('uses rerankResults from pinecone/rerank when useReranking is true', async () => {
      const spy = vi.spyOn(rerankModule, 'rerankResults').mockResolvedValue({
        results: [
          {
            id: 'd1',
            content: 'from dense',
            score: 0.9,
            metadata: {},
            reranked: true,
          },
        ],
        degraded: false,
      });
      try {
        const testClient = stubPineconeClient(client);
        const denseRef = {} as SearchableIndex;
        const sparseRef = {} as SearchableIndex;
        testClient.ensureIndexes = async () => ({
          denseIndex: denseRef,
          sparseIndex: sparseRef,
        });
        testClient.searchIndex = async (index) => {
          if (index === denseRef) {
            return [{ _id: 'd1', _score: 0.9, fields: { chunk_text: 'from dense' } }];
          }
          return [];
        };

        const results = await client.query({
          query: 'q',
          namespace: 'n',
          topK: 5,
          useReranking: true,
        });

        expect(results.results).toHaveLength(1);
        expect(results.results[0]?.reranked).toBe(true);
        expect(results.results[0]?.content).toBe('from dense');
        expect(spy).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it('propagates rerank degradation to hybrid query outcome', async () => {
      const spy = vi.spyOn(rerankModule, 'rerankResults').mockResolvedValue({
        results: [
          {
            id: 'd1',
            content: 'from dense',
            score: 0.9,
            metadata: {},
            reranked: false,
          },
        ],
        degraded: true,
        degradation_reason: 'rerank_failed: timeout',
      });
      try {
        const testClient = stubPineconeClient(client);
        const denseRef = {} as SearchableIndex;
        const sparseRef = {} as SearchableIndex;
        testClient.ensureIndexes = async () => ({
          denseIndex: denseRef,
          sparseIndex: sparseRef,
        });
        testClient.searchIndex = async (index) => {
          if (index === denseRef) {
            return [{ _id: 'd1', _score: 0.9, fields: { chunk_text: 'from dense' } }];
          }
          return [];
        };

        const out = await client.query({
          query: 'q',
          namespace: 'n',
          topK: 5,
          useReranking: true,
        });

        expect(out.degraded).toBe(true);
        expect(out.degradation_reason).toBe('rerank_failed: timeout');
        expect(out.results[0]?.reranked).toBe(false);
        expect(spy).toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it('dedupes hits with blank _id via synthetic keys', async () => {
      const testClient = stubPineconeClient(client);
      const denseRef = {} as SearchableIndex;
      const sparseRef = {} as SearchableIndex;
      testClient.ensureIndexes = async () => ({
        denseIndex: denseRef,
        sparseIndex: sparseRef,
      });
      testClient.searchIndex = async (index) => {
        if (index === denseRef) {
          return [
            { _id: '   ', _score: 1, fields: { chunk_text: 'a' } },
            { _id: '', _score: 0.5, fields: { chunk_text: 'b' } },
          ];
        }
        return [];
      };

      const results = await client.query({
        query: 'q',
        namespace: 'n',
        topK: 10,
        useReranking: false,
      });

      expect(results.results.length).toBe(2);
    });
  });

  describe('keywordSearch', () => {
    it('throws for empty query', async () => {
      await expect(client.keywordSearch({ query: '   ', namespace: 'n' })).rejects.toThrow(
        'Query cannot be empty'
      );
    });

    it('passes configured requestTimeoutMs to search call sites', async () => {
      vi.useFakeTimers();
      const timeoutClient = new PineconeClient({
        apiKey: 'test-api-key',
        indexName: 'test-index',
        requestTimeoutMs: 50,
      });
      const testClient = stubPineconeClient(timeoutClient);
      const search = vi.fn(() => new Promise(() => {}));
      const sparseRef = { search } as SearchableIndex;
      testClient.ensureIndexes = async () => ({
        denseIndex: {} as SearchableIndex,
        sparseIndex: sparseRef,
      });

      const p = timeoutClient.keywordSearch({ query: 'q', namespace: 'n' });
      const assertion = expect(p).rejects.toBeInstanceOf(AppTimeoutError);
      await vi.advanceTimersByTimeAsync(50);
      await assertion;
    });

    it('searches sparse index only and maps hits', async () => {
      const testClient = stubPineconeClient(client);
      const denseRef = {} as SearchableIndex;
      const sparseRef = {} as SearchableIndex;
      testClient.ensureIndexes = async () => ({
        denseIndex: denseRef,
        sparseIndex: sparseRef,
      });
      testClient.searchIndex = async (index) => {
        if (index === sparseRef) {
          return [{ _id: 'k1', _score: 0.7, fields: { chunk_text: 'lexical', tag: 'x' } }];
        }
        return [];
      };

      const results = await client.keywordSearch({
        query: 'find me',
        namespace: 'ns',
        topK: 3,
      });

      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('lexical');
      expect(results[0].metadata['tag']).toBe('x');
    });
  });
});
