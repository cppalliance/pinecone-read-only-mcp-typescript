import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as loggerModule from '../logger.js';
import { reassembleByDocument } from './reassemble-documents.js';
import type { SearchResult } from '../types.js';

describe('reassembleByDocument', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(loggerModule, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('groups chunks by document_number', () => {
    const results: SearchResult[] = [
      {
        id: 'c1',
        content: 'First chunk.',
        score: 0.9,
        metadata: { document_number: 'P1234', chunk_index: 0 },
        reranked: false,
      },
      {
        id: 'c2',
        content: 'Second chunk.',
        score: 0.8,
        metadata: { document_number: 'P1234', chunk_index: 1 },
        reranked: false,
      },
      {
        id: 'c3',
        content: 'Other doc.',
        score: 0.7,
        metadata: { document_number: 'P5678' },
        reranked: false,
      },
    ];
    const docs = reassembleByDocument(results);
    expect(docs).toHaveLength(2);
    const p1234 = docs.find((d) => d.document_id === 'P1234');
    const p5678 = docs.find((d) => d.document_id === 'P5678');
    expect(p1234?.merged_content).toBe('First chunk.\n\nSecond chunk.');
    expect(p1234?.chunk_count).toBe(2);
    expect(p5678?.merged_content).toBe('Other doc.');
    expect(p5678?.chunk_count).toBe(1);
  });

  it('sorts chunks by chunk_index when present', () => {
    const results: SearchResult[] = [
      {
        id: 'b',
        content: 'Second',
        score: 0.5,
        metadata: { document_number: 'D1', chunk_index: 1 },
        reranked: false,
      },
      {
        id: 'a',
        content: 'First',
        score: 0.9,
        metadata: { document_number: 'D1', chunk_index: 0 },
        reranked: false,
      },
    ];
    const docs = reassembleByDocument(results);
    expect(docs[0].merged_content).toBe('First\n\nSecond');
  });

  it('uses doc_id when document_number is missing', () => {
    const results: SearchResult[] = [
      {
        id: 'x',
        content: 'Content',
        score: 0.8,
        metadata: { doc_id: 'my-doc-1' },
        reranked: false,
      },
    ];
    const docs = reassembleByDocument(results);
    expect(docs[0].document_id).toBe('my-doc-1');
  });

  it('respects maxChunksPerDocument', () => {
    const results: SearchResult[] = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`,
      content: `Chunk ${i}`,
      score: 0.9 - i * 0.01,
      metadata: { document_number: 'P1', chunk_index: i },
      reranked: false,
    }));
    const docs = reassembleByDocument(results, { maxChunksPerDocument: 3 });
    expect(docs).toHaveLength(1);
    expect(docs[0].chunk_count).toBe(3);
    expect(docs[0].merged_content).toBe('Chunk 0\n\nChunk 1\n\nChunk 2');
  });

  it('does not warn when all hits have a document key', () => {
    const results: SearchResult[] = [
      {
        id: 'c1',
        content: 'Only doc.',
        score: 0.9,
        metadata: { document_number: 'P1' },
        reranked: false,
      },
    ];
    reassembleByDocument(results);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns once with count when hits lack document key and empty vector id', () => {
    const results: SearchResult[] = [
      {
        id: '',
        content: 'Orphan chunk.',
        score: 0.5,
        metadata: {},
        reranked: false,
      },
    ];
    const docs = reassembleByDocument(results);
    expect(docs).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/skipped 1 hit/);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/sample_ids=<empty>/);
  });

  it('aggregates multiple skipped hits into one warn with total count', () => {
    const results: SearchResult[] = [
      {
        id: '',
        content: 'A',
        score: 0.5,
        metadata: {},
        reranked: false,
      },
      {
        id: '',
        content: 'B',
        score: 0.4,
        metadata: {},
        reranked: false,
      },
    ];
    const docs = reassembleByDocument(results);
    expect(docs).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/skipped 2 hit/);
  });

  it('warns only for invalid hits when mixed with valid document keys', () => {
    const results: SearchResult[] = [
      {
        id: '',
        content: 'Skipped.',
        score: 0.3,
        metadata: {},
        reranked: false,
      },
      {
        id: 'vec-1',
        content: 'Kept by id.',
        score: 0.9,
        metadata: {},
        reranked: false,
      },
    ];
    const docs = reassembleByDocument(results);
    expect(docs).toHaveLength(1);
    expect(docs[0].document_id).toBe('vec-1');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/skipped 1 hit/);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/sample_ids=<empty>/);
  });

  it('includes sample vector ids in skip warning up to limit', () => {
    const emptyDocNum = { document_number: '' } as Record<string, string>;
    const results: SearchResult[] = [
      { id: 'a', content: 'x', score: 0.1, metadata: emptyDocNum, reranked: false },
      { id: 'b', content: 'y', score: 0.2, metadata: emptyDocNum, reranked: false },
      { id: 'c', content: 'z', score: 0.3, metadata: emptyDocNum, reranked: false },
      { id: 'd', content: 'w', score: 0.4, metadata: emptyDocNum, reranked: false },
    ];
    reassembleByDocument(results);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const msg = String(warnSpy.mock.calls[0]?.[0]);
    expect(msg).toMatch(/skipped 4 hit/);
    expect(msg.match(/sample_ids=([^\s.]+)/)?.[1]).toBe('a,b,c');
  });
});
