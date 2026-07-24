import { describe, it, expect, vi } from 'vitest';
import { rerankResults } from './rerank.js';
import type { MergedHit } from '../../types.js';
import { makeStructured429Once } from './test-helpers.js';

const sampleMerged: MergedHit[] = [
  { _id: '1', _score: 0.5, chunk_text: 'hello', metadata: { k: 'v' } },
];

function makePc(rerank: ReturnType<typeof vi.fn>) {
  return { inference: { rerank } } as unknown as Parameters<typeof rerankResults>[0];
}

describe('rerankResults', () => {
  it('returns empty outcome when there are no merged hits', async () => {
    const pc = {} as Parameters<typeof rerankResults>[0];
    const out = await rerankResults(pc, 'any-model', 'q', [], 5);
    expect(out.results).toEqual([]);
    expect(out.degraded).toBe(false);
  });

  it('maps successful inference.rerank response', async () => {
    const rerank = vi.fn().mockResolvedValue({
      data: [
        {
          score: 0.99,
          document: { _id: '1', chunk_text: 'hello', metadata: { k: 'v' } },
        },
      ],
    });
    const pc = makePc(rerank);

    const out = await rerankResults(pc, 'm', 'q', sampleMerged, 5);

    expect(out.results).toHaveLength(1);
    expect(out.degraded).toBe(false);
    expect(out.results[0]?.reranked).toBe(true);
    expect(out.results[0]?.id).toBe('1');
    expect(out.results[0]?.content).toBe('hello');
    expect(out.results[0]?.score).toBeCloseTo(0.99);
  });

  it('returns unreranked slice with degraded when rerank throws', async () => {
    const rerank = vi.fn().mockRejectedValue(new Error('rerank unavailable'));
    const pc = makePc(rerank);

    const out = await rerankResults(pc, 'm', 'q', sampleMerged, 5);

    expect(out.results).toHaveLength(1);
    expect(out.degraded).toBe(true);
    expect(out.degradation_reason).toMatch(/^rerank_failed:/);
    expect(out.results[0]?.reranked).toBe(false);
    expect(out.results[0]?.content).toBe('hello');
  });

  it('retries on 429 then succeeds without degrading', async () => {
    let n = 0;
    const rerank = vi.fn().mockImplementation(async () => {
      n++;
      if (n < 2) throw new Error('HTTP 429');
      return {
        data: [
          {
            score: 0.99,
            document: { _id: '1', chunk_text: 'hello', metadata: { k: 'v' } },
          },
        ],
      };
    });
    const pc = makePc(rerank);

    const out = await rerankResults(pc, 'm', 'q', sampleMerged, 5);

    expect(out.degraded).toBe(false);
    expect(out.results[0]?.reranked).toBe(true);
    expect(rerank).toHaveBeenCalledTimes(2);
  });

  it('retries on structured 429 without 429 in message then succeeds', async () => {
    const success = {
      data: [
        {
          score: 0.99,
          document: { _id: '1', chunk_text: 'hello', metadata: { k: 'v' } },
        },
      ],
    };
    const rerank = makeStructured429Once(success);
    const pc = makePc(rerank);

    const out = await rerankResults(pc, 'm', 'q', sampleMerged, 5);

    expect(out.degraded).toBe(false);
    expect(out.results[0]?.reranked).toBe(true);
    expect(rerank).toHaveBeenCalledTimes(2);
  });

  it('degrades after exhausting retries on persistent 503', async () => {
    const rerank = vi.fn().mockRejectedValue(new Error('HTTP 503'));
    const pc = makePc(rerank);

    const out = await rerankResults(pc, 'm', 'q', sampleMerged, 5, 5000);

    expect(out.degraded).toBe(true);
    expect(out.degradation_reason).toMatch(/^rerank_failed:/);
    expect(rerank).toHaveBeenCalledTimes(3);
  });

  it('returns empty reranked results with degraded=false when data is an empty array', async () => {
    const rerank = vi.fn().mockResolvedValue({ data: [] });
    const pc = makePc(rerank);

    const out = await rerankResults(pc, 'm', 'q', sampleMerged, 5);

    expect(out.results).toEqual([]);
    expect(out.degraded).toBe(false);
    expect(out.degradation_reason).toBeUndefined();
  });

  it('returns empty reranked results with degraded=false when data is absent', async () => {
    const rerank = vi.fn().mockResolvedValue({});
    const pc = makePc(rerank);

    const out = await rerankResults(pc, 'm', 'q', sampleMerged, 5);

    expect(out.results).toEqual([]);
    expect(out.degraded).toBe(false);
  });

  it('maps a rerank item with no document to an empty id/content result instead of throwing', async () => {
    const rerank = vi.fn().mockResolvedValue({
      data: [{ score: 0.42 }],
    });
    const pc = makePc(rerank);

    const out = await rerankResults(pc, 'm', 'q', sampleMerged, 5);

    expect(out.degraded).toBe(false);
    expect(out.results).toHaveLength(1);
    expect(out.results[0]?.id).toBe('');
    expect(out.results[0]?.content).toBe('');
    expect(out.results[0]?.metadata).toEqual({});
    expect(out.results[0]?.reranked).toBe(true);
    expect(out.results[0]?.score).toBeCloseTo(0.42);
  });

  it('maps duplicate documents in the rerank output to one result per data item', async () => {
    const document = { _id: '1', chunk_text: 'hello', metadata: { k: 'v' } };
    const rerank = vi.fn().mockResolvedValue({
      data: [
        { score: 0.9, document },
        { score: 0.8, document },
      ],
    });
    const pc = makePc(rerank);

    const out = await rerankResults(pc, 'm', 'q', sampleMerged, 5);

    expect(out.degraded).toBe(false);
    expect(out.results).toHaveLength(2);
    expect(out.results.map((r) => r.id)).toEqual(['1', '1']);
    expect(out.results.map((r) => r.content)).toEqual(['hello', 'hello']);
    expect(out.results[0]?.metadata).toEqual({ k: 'v' });
    expect(out.results[0]?.score).toBeCloseTo(0.9);
    expect(out.results[1]?.score).toBeCloseTo(0.8);
    expect(out.results.every((r) => r.reranked === true)).toBe(true);
  });
});
