import { describe, expect, it } from 'vitest';
import { resolveConfig } from './config.js';

describe('resolveConfig', () => {
  it('throws when API key is missing', () => {
    expect(() => resolveConfig({}, { PINECONE_API_KEY: '' })).toThrow(/Missing Pinecone API key/);
  });

  it('throws when index name is missing', () => {
    expect(() => resolveConfig({ apiKey: 'sk-test' }, { PINECONE_API_KEY: 'sk-test' })).toThrow(
      /Missing Pinecone index name/
    );
  });

  it('throws when PINECONE_INDEX_NAME is whitespace', () => {
    expect(() =>
      resolveConfig(
        { apiKey: 'sk-test' },
        { PINECONE_API_KEY: 'sk-test', PINECONE_INDEX_NAME: '   ' }
      )
    ).toThrow(/Missing Pinecone index name/);
  });

  it('uses PINECONE_INDEX_NAME from env when set', () => {
    const cfg = resolveConfig(
      { apiKey: 'sk-test' },
      { PINECONE_API_KEY: 'sk-test', PINECONE_INDEX_NAME: 'my-index' }
    );
    expect(cfg.indexName).toBe('my-index');
    expect(cfg.sparseIndexName).toBe('my-index-sparse');
  });

  it('uses indexName from overrides when set', () => {
    const cfg = resolveConfig({ apiKey: 'sk-test', indexName: 'override-index' }, {});
    expect(cfg.indexName).toBe('override-index');
    expect(cfg.sparseIndexName).toBe('override-index-sparse');
  });

  it('omits rerankModel when env and overrides omit rerankModel', () => {
    const cfg = resolveConfig(
      { apiKey: 'sk-test', indexName: 'my-index' },
      { PINECONE_API_KEY: 'sk-test', PINECONE_INDEX_NAME: 'my-index' }
    );
    expect(cfg.rerankModel).toBeUndefined();
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
