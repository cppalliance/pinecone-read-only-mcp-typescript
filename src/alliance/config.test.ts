import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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

  it('defaults disableSuggestFlow to false (suggest gate on for Alliance)', () => {
    const cfg = resolveAllianceConfig({ apiKey: 'sk-test' }, { PINECONE_API_KEY: 'sk-test' });
    expect(cfg.disableSuggestFlow).toBe(false);
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

  it('applies resolved Alliance index default to multi-source entries missing indexName', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pinecone-alliance-sources-'));
    const filePath = join(dir, 'sources.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        defaultSource: 'api_key_1',
        sources: {
          api_key_1: { apiKey: 'k1', indexName: 'explicit-index' },
          api_key_2: { apiKey: 'k2' },
        },
      })
    );
    const cfg = resolveAllianceConfig(
      { configFile: filePath, indexName: 'cli-default-index' },
      { PINECONE_API_KEY: 'ignored' }
    );
    const second = cfg.sources?.find((s) => s.name === 'api_key_2');
    expect(second?.indexName).toBe('cli-default-index');
  });
});
