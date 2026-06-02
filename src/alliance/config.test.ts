import { describe, expect, it } from 'vitest';
import {
  ALLIANCE_DEFAULT_INDEX_NAME,
  ALLIANCE_DEFAULT_RERANK_MODEL,
  resolveAllianceConfig,
} from './config.js';

describe('resolveAllianceConfig', () => {
  it('applies Alliance index and rerank defaults when env omits both', () => {
    const cfg = resolveAllianceConfig({ apiKey: 'sk-test' }, { PINECONE_API_KEY: 'sk-test' });
    expect(cfg.indexName).toBe(ALLIANCE_DEFAULT_INDEX_NAME);
    expect(cfg.sparseIndexName).toBe(`${ALLIANCE_DEFAULT_INDEX_NAME}-sparse`);
    expect(cfg.rerankModel).toBe(ALLIANCE_DEFAULT_RERANK_MODEL);
  });

  it('applies Alliance rerank default when env and overrides omit rerankModel but index is set', () => {
    const cfg = resolveAllianceConfig(
      { apiKey: 'sk-test', indexName: 'my-index' },
      { PINECONE_API_KEY: 'sk-test', PINECONE_INDEX_NAME: 'my-index' }
    );
    expect(cfg.indexName).toBe('my-index');
    expect(cfg.rerankModel).toBe(ALLIANCE_DEFAULT_RERANK_MODEL);
  });

  it('preserves explicit rerankModel from overrides', () => {
    const cfg = resolveAllianceConfig({
      apiKey: 'sk-test',
      indexName: 'my-index',
      rerankModel: 'custom-reranker',
    });
    expect(cfg.rerankModel).toBe('custom-reranker');
  });

  it('preserves rerankModel from env over Alliance default', () => {
    const cfg = resolveAllianceConfig(
      { apiKey: 'sk-test', indexName: 'my-index' },
      {
        PINECONE_API_KEY: 'sk-test',
        PINECONE_INDEX_NAME: 'my-index',
        PINECONE_RERANK_MODEL: 'env-reranker',
      }
    );
    expect(cfg.rerankModel).toBe('env-reranker');
  });

  it('preserves explicit index from env over Alliance default', () => {
    const cfg = resolveAllianceConfig(
      { apiKey: 'sk-test' },
      { PINECONE_API_KEY: 'sk-test', PINECONE_INDEX_NAME: 'custom-index' }
    );
    expect(cfg.indexName).toBe('custom-index');
  });
});
