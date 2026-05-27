import { describe, expect, it } from 'vitest';
import { DEFAULT_INDEX_NAME, DEFAULT_RERANK_MODEL, resolveConfig } from './config.js';

describe('resolveConfig', () => {
  it('throws when API key is missing', () => {
    expect(() => resolveConfig({}, { PINECONE_API_KEY: '' })).toThrow(/Missing Pinecone API key/);
  });

  it('uses DEFAULT_INDEX_NAME when env and overrides omit indexName', () => {
    const cfg = resolveConfig({ apiKey: 'sk-test' }, { PINECONE_API_KEY: 'sk-test' });
    expect(cfg.indexName).toBe(DEFAULT_INDEX_NAME);
    expect(cfg.sparseIndexName).toBe(`${DEFAULT_INDEX_NAME}-sparse`);
  });

  it('uses PINECONE_INDEX_NAME from env when set', () => {
    const cfg = resolveConfig(
      { apiKey: 'sk-test' },
      { PINECONE_API_KEY: 'sk-test', PINECONE_INDEX_NAME: 'my-index' }
    );
    expect(cfg.indexName).toBe('my-index');
    expect(cfg.sparseIndexName).toBe('my-index-sparse');
  });

  it('uses DEFAULT_INDEX_NAME when env index is empty after trim', () => {
    const cfg = resolveConfig(
      { apiKey: 'sk-test' },
      { PINECONE_API_KEY: 'sk-test', PINECONE_INDEX_NAME: '   ' }
    );
    expect(cfg.indexName).toBe(DEFAULT_INDEX_NAME);
  });

  it('uses DEFAULT_RERANK_MODEL when env and overrides omit rerankModel', () => {
    const cfg = resolveConfig(
      { apiKey: 'sk-test', indexName: 'my-index' },
      { PINECONE_API_KEY: 'sk-test', PINECONE_INDEX_NAME: 'my-index' }
    );
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

  it('sets rerankModel when provided via overrides', () => {
    const cfg = resolveConfig({
      apiKey: 'sk-test',
      indexName: 'my-index',
      rerankModel: 'my-reranker',
    });
    expect(cfg.rerankModel).toBe('my-reranker');
  });
});
