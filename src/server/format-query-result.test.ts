import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as loggerModule from '../logger.js';
import type { SearchResult } from '../types.js';
import {
  formatQueryResultRows,
  formatSearchResultAsRow,
  resetPaperNumberDeprecationLatchForTests,
} from './format-query-result.js';

const DEPRECATION_SUBSTRING =
  'paper_number is deprecated and will be removed in the next major release';

describe('formatSearchResultAsRow / formatQueryResultRows', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetPaperNumberDeprecationLatchForTests();
    warnSpy = vi.spyOn(loggerModule, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('warns once on first row even when document_id is null', () => {
    const doc: SearchResult = {
      id: 'v1',
      content: 'hello world',
      score: 0.99,
      metadata: { title: 'T' },
      reranked: false,
    };
    const row = formatSearchResultAsRow(doc);
    expect(row.document_id).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain(DEPRECATION_SUBSTRING);
  });

  it('does not warn again on second formatSearchResultAsRow call', () => {
    const doc: SearchResult = {
      id: 'v1',
      content: 'a',
      score: 0.5,
      metadata: { document_number: 'P1' },
      reranked: false,
    };
    formatSearchResultAsRow(doc);
    formatSearchResultAsRow(doc);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('warns at most once for formatQueryResultRows with multiple hits', () => {
    const results: SearchResult[] = [
      {
        id: 'a',
        content: 'one',
        score: 0.9,
        metadata: { document_number: 'D1' },
        reranked: false,
      },
      {
        id: 'b',
        content: 'two',
        score: 0.8,
        metadata: { document_number: 'D2' },
        reranked: false,
      },
    ];
    formatQueryResultRows(results);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
