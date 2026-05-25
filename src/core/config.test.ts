import { describe, expect, it } from 'vitest';
import { DEFAULT_RERANK_MODEL, resolveConfig } from './config.js';

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

  it('uses DEFAULT_RERANK_MODEL when env and overrides omit rerankModel', () => {
    const cfg = resolveConfig(
      { apiKey: 'sk-test', indexName: 'my-index' },
      { PINECONE_API_KEY: 'sk-test', PINECONE_INDEX_NAME: 'my-index' }
    );
    expect(cfg.indexName).toBe('my-index');
    expect(cfg.sparseIndexName).toBe('my-index-sparse');
    expect(cfg.rerankModel).toBe(DEFAULT_RERANK_MODEL);
  });

  it('uses PINECONE_RERANK_MODEL from env when set', () => {
    const cfg = resolveConfig(
      { apiKey: 'sk-test', indexName: 'my-index' },
      {
        PINECONE_API_KEY: 'sk-test',
        PINECONE_INDEX_NAME: 'my-index',
        PINECONE_RERANK_MODEL: 'env-reranker',
      }
    );
    expect(cfg.rerankModel).toBe('env-reranker');
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
