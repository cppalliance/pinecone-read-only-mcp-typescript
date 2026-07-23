import { describe, it, expect, vi, afterEach } from 'vitest';
import { AppTimeoutError } from '../server/retry.js';
import {
  searchIndex,
  mergeResults,
  sliceMergedHitsToSearchResults,
  mapSparseHitsToSearchResults,
  countUniqueDocumentsFromHits,
} from './search.js';
import type { PineconeHit, SearchableIndex } from '../../types.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('searchIndex', () => {
  it('uses index.search when available and passes fields', async () => {
    const search = vi.fn().mockResolvedValue({
      result: { hits: [{ _id: '1', _score: 1, fields: { chunk_text: 'x' } }] },
    });
    const index = { search } as unknown as SearchableIndex;
    const hits = await searchIndex(index, 'hi', 5, 'ns', { k: 'v' }, { fields: ['chunk_text'] });
    expect(hits).toHaveLength(1);
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'ns',
        fields: ['chunk_text'],
        query: expect.objectContaining({ filter: { k: 'v' } }),
      })
    );
  });

  it('uses namespace-scoped searchRecords when search is absent', async () => {
    const searchRecords = vi.fn().mockResolvedValue({
      result: { hits: [{ _id: 'r1', _score: 0.5, fields: {} }] },
    });
    const index = {
      namespace: vi.fn().mockReturnValue({ searchRecords }),
    } as unknown as SearchableIndex;
    const hits = await searchIndex(index, 'hi', 3, 'ns');
    expect(hits).toHaveLength(1);
    expect(searchRecords).toHaveBeenCalled();
  });

  it('uses top-level searchRecords when there is no namespace', async () => {
    const searchRecords = vi.fn().mockResolvedValue({ result: { hits: [] } });
    const index = { searchRecords } as unknown as SearchableIndex;
    const hits = await searchIndex(index, 'hi', 2, undefined);
    expect(hits).toEqual([]);
    expect(searchRecords).toHaveBeenCalled();
  });

  it('returns empty hits when searchRecords is missing on fallback target', async () => {
    const index = { namespace: vi.fn().mockReturnValue({}) } as unknown as SearchableIndex;
    const hits = await searchIndex(index, 'hi', 2, 'ns');
    expect(hits).toEqual([]);
  });

  it('wraps errors with namespace context', async () => {
    const index = {
      search: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as SearchableIndex;
    await expect(searchIndex(index, 'hi', 5, 'my-ns')).rejects.toThrow(
      'Pinecone search failed for namespace "my-ns": boom'
    );
  });

  it('retries on 503 then succeeds', async () => {
    let n = 0;
    const search = vi.fn().mockImplementation(async () => {
      n++;
      if (n < 2) throw new Error('HTTP 503');
      return { result: { hits: [{ _id: '1', _score: 1, fields: {} }] } };
    });
    const index = { search } as unknown as SearchableIndex;
    const hits = await searchIndex(index, 'hi', 5);
    expect(hits).toHaveLength(1);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('retries on structured 429 without 429 in message then succeeds', async () => {
    let n = 0;
    const search = vi.fn().mockImplementation(async () => {
      n++;
      if (n < 2) {
        throw Object.assign(new Error('Rate limited'), { status: 429 });
      }
      return { result: { hits: [{ _id: '1', _score: 1, fields: {} }] } };
    });
    const index = { search } as unknown as SearchableIndex;
    const hits = await searchIndex(index, 'hi', 5);
    expect(hits).toHaveLength(1);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 401', async () => {
    const search = vi.fn().mockRejectedValue(new Error('HTTP 401'));
    const index = { search } as unknown as SearchableIndex;
    await expect(searchIndex(index, 'hi', 5)).rejects.toThrow(/401/);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('times out at requestTimeoutMs and rejects with AppTimeoutError', async () => {
    vi.useFakeTimers();
    const search = vi.fn(() => new Promise(() => {}));
    const index = { search } as unknown as SearchableIndex;
    const p = searchIndex(index, 'hi', 5, undefined, undefined, undefined, 50);
    const assertion = expect(p).rejects.toBeInstanceOf(AppTimeoutError);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });
});

describe('mergeResults', () => {
  it('keeps higher score when duplicate _id appears in dense and sparse', () => {
    const merged = mergeResults(
      [{ _id: '1', _score: 0.9, fields: { chunk_text: 'a' } }],
      [{ _id: '1', _score: 0.1, fields: { chunk_text: 'b' } }]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.chunk_text).toBe('a');
  });
});

describe('sliceMergedHitsToSearchResults', () => {
  it('maps merged hits to SearchResult rows', () => {
    const out = sliceMergedHitsToSearchResults(
      [
        { _id: 'a', _score: 1, chunk_text: 'c', metadata: {} },
        { _id: 'b', _score: 0.5, chunk_text: 'd', metadata: { x: 1 } },
      ],
      1
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('a');
    expect(out[0]?.reranked).toBe(false);
  });
});

describe('mapSparseHitsToSearchResults', () => {
  it('splits chunk_text from other fields', () => {
    const hits: PineconeHit[] = [
      { _id: 'z', _score: 0.2, fields: { chunk_text: 'body', author: 'me' } },
    ];
    const out = mapSparseHitsToSearchResults(hits);
    expect(out[0]?.content).toBe('body');
    expect(out[0]?.metadata['author']).toBe('me');
  });
});

describe('countUniqueDocumentsFromHits', () => {
  it('dedupes by document_number', () => {
    const hits: PineconeHit[] = [
      { _id: 'c1', _score: 1, fields: { document_number: 'D1' } },
      { _id: 'c2', _score: 0.9, fields: { document_number: 'D1' } },
    ];
    const r = countUniqueDocumentsFromHits(hits, 'ns');
    expect(r.count).toBe(1);
    expect(r.truncated).toBe(false);
  });
});
