import { describe, expect, it, vi } from 'vitest';
import { parseInlineSources, resolveEnvIndirection } from './source-config.js';
import { resolveConfig } from '../config.js';

describe('source-config', () => {
  it('resolves env indirection', () => {
    const env = { PINECONE_PUBLIC_API_KEY: 'key-public' };
    expect(resolveEnvIndirection('${PINECONE_PUBLIC_API_KEY}', env)).toBe('key-public');
  });

  it('parses inline sources', () => {
    const env = {
      K1: 'api-1',
      K2: 'api-2',
    };
    const sources = parseInlineSources(
      'public:${K1}:rag-hybrid;private:${K2}:rag-private',
      env
    );
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      name: 'public',
      apiKey: 'api-1',
      indexName: 'rag-hybrid',
      sparseIndexName: 'rag-hybrid-sparse',
    });
    expect(sources[1]?.name).toBe('private');
  });

  it('resolveConfig uses PINECONE_SOURCES when set', () => {
    vi.stubEnv('PINECONE_SOURCES', 'public:sk-test:my-index');
    vi.stubEnv('PINECONE_API_KEY', 'ignored');
    try {
      const cfg = resolveConfig({});
      expect(cfg.sources).toHaveLength(1);
      expect(cfg.sources?.[0]?.name).toBe('public');
      expect(cfg.apiKey).toBe('sk-test');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
