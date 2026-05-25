import { describe, expect, it } from 'vitest';
import {
  applyAllianceRerankDefault,
  DEFAULT_ALLIANCE_RERANK_MODEL,
  resolveAllianceConfig,
} from './config.js';

describe('resolveAllianceConfig', () => {
  it('applies Alliance rerank default when env and overrides omit rerankModel', () => {
    const cfg = resolveAllianceConfig(
      { apiKey: 'sk-test', indexName: 'my-index' },
      { PINECONE_API_KEY: 'sk-test', PINECONE_INDEX_NAME: 'my-index' }
    );
    expect(cfg.rerankModel).toBe(DEFAULT_ALLIANCE_RERANK_MODEL);
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

describe('applyAllianceRerankDefault', () => {
  it('does not replace an existing rerankModel', () => {
    const cfg = applyAllianceRerankDefault({
      apiKey: 'k',
      indexName: 'i',
      sparseIndexName: 'i-sparse',
      rerankModel: 'already-set',
      defaultTopK: 10,
      logLevel: 'INFO',
      logFormat: 'text',
      cacheTtlMs: 1800_000,
      requestTimeoutMs: 15_000,
      disableSuggestFlow: false,
      checkIndexes: false,
    });
    expect(cfg.rerankModel).toBe('already-set');
  });
});
