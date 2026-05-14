import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PineconeClient } from './pinecone-client.js';
import type { SearchableIndex, PineconeHit } from './types.js';
import * as rerankModule from './pinecone/rerank.js';

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
    delete process.env['PINECONE_INDEX_NAME'];
    delete process.env['PINECONE_RERANK_MODEL'];
    delete process.env['PINECONE_TOP_K'];
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(client).toBeDefined();
    });

    it('should use environment variables as fallbacks', () => {
      process.env['PINECONE_INDEX_NAME'] = 'env-index';
      process.env['PINECONE_RERANK_MODEL'] = 'env-model';

      const envClient = new PineconeClient({
        apiKey: 'test-api-key',
      });

      expect(envClient).toBeDefined();
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

      testClient.ensureIndexes = async () => ({
        denseIndex: {} as SearchableIndex,
        sparseIndex: {} as SearchableIndex,
      });

      let searchCall = 0;
      testClient.searchIndex = async () => {
        searchCall += 1;
        if (searchCall === 1) {
          throw new Error('dense failure');
        }
        return [
          {
            _id: 'doc-1',
            _score: 0.9,
            fields: { chunk_text: 'hybrid content', author: 'tester' },
          },
        ];
      };

      const results = await client.query({
        query: 'hybrid search',
        namespace: 'test',
        topK: 5,
        useReranking: false,
      });

      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('hybrid content');
      expect(results[0].metadata.author).toBe('tester');
    });

    it('should throw when both dense and sparse searches fail', async () => {
      const testClient = stubPineconeClient(client);

      testClient.ensureIndexes = async () => ({
        denseIndex: {} as SearchableIndex,
        sparseIndex: {} as SearchableIndex,
      });
      testClient.searchIndex = async () => {
        throw new Error('index failure');
      };

      await expect(
        client.query({
          query: 'hybrid search',
          namespace: 'test',
          topK: 5,
          useReranking: false,
        })
      ).rejects.toThrow('Hybrid search failed: both dense and sparse index searches failed.');
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

    it('uses rerankResults from pinecone/rerank when useReranking is true', async () => {
      const spy = vi.spyOn(rerankModule, 'rerankResults').mockResolvedValue([
        {
          id: 'd1',
          content: 'from dense',
          score: 0.9,
          metadata: {},
          reranked: true,
        },
      ]);
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

        expect(results).toHaveLength(1);
        expect(results[0].reranked).toBe(true);
        expect(results[0].content).toBe('from dense');
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

      expect(results.length).toBe(2);
    });
  });

  describe('keywordSearch', () => {
    it('throws for empty query', async () => {
      await expect(client.keywordSearch({ query: '   ', namespace: 'n' })).rejects.toThrow(
        'Query cannot be empty'
      );
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
