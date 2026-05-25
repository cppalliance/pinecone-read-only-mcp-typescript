import { describe, expect, it } from 'vitest';
import { DEFAULT_RERANK_MODEL } from '../core/config.js';
import { resolveAllianceConfig } from './config.js';

describe('resolveAllianceConfig', () => {
  it('applies Alliance rerank default when env and overrides omit rerankModel', () => {
    const cfg = resolveAllianceConfig(
      { apiKey: 'sk-test', indexName: 'my-index' },
      { PINECONE_API_KEY: 'sk-test', PINECONE_INDEX_NAME: 'my-index' }
    );
    expect(cfg.rerankModel).toBe(DEFAULT_RERANK_MODEL);
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
});
