import { describe, it, expect, vi } from 'vitest';
import { rerankResults } from './rerank.js';
import type { MergedHit } from '../types.js';

const sampleMerged: MergedHit[] = [
  { _id: '1', _score: 0.5, chunk_text: 'hello', metadata: { k: 'v' } },
];

describe('rerankResults', () => {
  it('returns empty array when there are no merged hits', async () => {
    const pc = {} as Parameters<typeof rerankResults>[0];
    const out = await rerankResults(pc, 'any-model', 'q', [], 5);
    expect(out).toEqual([]);
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
    const pc = { inference: { rerank } } as Parameters<typeof rerankResults>[0];

    const out = await rerankResults(pc, 'm', 'q', sampleMerged, 5);

    expect(out).toHaveLength(1);
    expect(out[0]?.reranked).toBe(true);
    expect(out[0]?.id).toBe('1');
    expect(out[0]?.content).toBe('hello');
    expect(out[0]?.score).toBeCloseTo(0.99);
  });

  it('returns unreranked slice when rerank throws', async () => {
    const rerank = vi.fn().mockRejectedValue(new Error('rerank unavailable'));
    const pc = { inference: { rerank } } as Parameters<typeof rerankResults>[0];

    const out = await rerankResults(pc, 'm', 'q', sampleMerged, 5);

    expect(out).toHaveLength(1);
    expect(out[0]?.reranked).toBe(false);
    expect(out[0]?.content).toBe('hello');
  });
});
