import { describe, expect, it } from 'vitest';
import { resolveConfig } from './config.js';

describe('resolveConfig', () => {
  it('throws when API key is missing', () => {
    expect(() => resolveConfig({}, { PINECONE_API_KEY: '' })).toThrow(/Missing Pinecone API key/);
  });

  it('throws when index name is missing', () => {
    expect(() =>
      resolveConfig({ apiKey: 'sk-test' }, { PINECONE_API_KEY: 'sk-test', PINECONE_INDEX_NAME: '' })
    ).toThrow(/Missing Pinecone index name/);
  });

  it('requires index from overrides when env is unset', () => {
    expect(() => resolveConfig({ apiKey: 'sk-test' }, {})).toThrow(/Missing Pinecone index name/);
  });

  it('leaves rerankModel undefined when env and overrides omit it', () => {
    const cfg = resolveConfig(
      { apiKey: 'sk-test', indexName: 'my-index' },
      { PINECONE_API_KEY: 'sk-test', PINECONE_INDEX_NAME: 'my-index' }
    );
    expect(cfg.indexName).toBe('my-index');
    expect(cfg.sparseIndexName).toBe('my-index-sparse');
    expect(cfg.rerankModel).toBeUndefined();
  });

  it('sets rerankModel when provided', () => {
    const cfg = resolveConfig({
      apiKey: 'sk-test',
      indexName: 'my-index',
      rerankModel: 'my-reranker',
    });
    expect(cfg.rerankModel).toBe('my-reranker');
  });
});
