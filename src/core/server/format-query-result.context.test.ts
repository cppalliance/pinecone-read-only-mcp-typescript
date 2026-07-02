import { afterEach, describe, expect, it } from 'vitest';
import { formatSearchResultAsRow } from './format-query-result.js';
import { ServerContext } from './server-context.js';
import { isolateFromDefaultContext, resolveTestConfig } from './tools/test-helpers.js';
import { teardownDefaultServerContext } from './server-context.js';
import type { SearchResult } from '../../types.js';

describe('formatSearchResultAsRow (ServerContext instance path)', () => {
  afterEach(() => {
    teardownDefaultServerContext();
  });

  it('enriches url from injected ctx registry when default context has no generator', () => {
    isolateFromDefaultContext();
    const ctx = new ServerContext(resolveTestConfig());
    ctx.registerUrlGenerator('papers', () => ({
      url: 'https://ctx.example/papers/doc-1',
      method: 'generated.custom',
    }));

    const doc: SearchResult = {
      id: 'v1',
      content: 'body',
      score: 0.9,
      metadata: { document_number: 'DOC-1', title: 'T', author: 'A' },
      reranked: false,
    };

    const row = formatSearchResultAsRow(doc, {
      namespace: 'papers',
      enrichUrls: true,
      ctx,
    });
    expect(row.url).toBe('https://ctx.example/papers/doc-1');
  });

  it('omits row source in single-source mode even when source option is set', () => {
    isolateFromDefaultContext();
    const ctx = new ServerContext(resolveTestConfig());
    const doc: SearchResult = {
      id: 'v1',
      content: 'body',
      score: 0.9,
      metadata: { document_number: 'DOC-1', title: 'T', author: 'A' },
      reranked: false,
    };

    const row = formatSearchResultAsRow(doc, {
      namespace: 'papers',
      source: 'api_key_1',
      ctx,
    });
    expect(row.source).toBeUndefined();
  });
});
