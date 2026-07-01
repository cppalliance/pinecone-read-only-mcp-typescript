import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import {
  parseInlineSources,
  parseSourcesConfigFile,
  resolveEnvIndirection,
} from './source-config.js';
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

  it('throws on duplicate source name in inline string', () => {
    expect(() =>
      parseInlineSources('public:sk-a:idx-a;public:sk-b:idx-b', {})
    ).toThrow(/Duplicate source name "public"/);
  });

  it('parseSourcesConfigFile resolves env indirection and defaultSource', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pinecone-sources-'));
    const filePath = join(dir, 'sources.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        defaultSource: 'private',
        sources: {
          public: { apiKey: '${K1}', indexName: 'rag-hybrid' },
          private: { apiKey: '${K2}', indexName: 'rag-private' },
        },
      })
    );
    const env = { K1: 'api-1', K2: 'api-2' };
    const parsed = parseSourcesConfigFile(filePath, env);
    expect(parsed.defaultSource).toBe('private');
    expect(parsed.sources).toHaveLength(2);
    const pub = parsed.sources.find((s) => s.name === 'public');
    expect(pub).toMatchObject({
      apiKey: 'api-1',
      indexName: 'rag-hybrid',
      sparseIndexName: 'rag-hybrid-sparse',
    });
  });

  it('throws when defaultSource is not a configured source name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pinecone-sources-'));
    const filePath = join(dir, 'bad-default.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        defaultSource: 'missing',
        sources: {
          public: { apiKey: 'k', indexName: 'idx' },
        },
      })
    );
    expect(() => parseSourcesConfigFile(filePath, {})).toThrow(/defaultSource/);
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

  it('resolveConfig prefers PINECONE_SOURCES over PINECONE_API_KEY', () => {
    vi.stubEnv('PINECONE_SOURCES', 'public:from-sources:my-index');
    vi.stubEnv('PINECONE_API_KEY', 'from-single-key');
    vi.stubEnv('PINECONE_INDEX_NAME', 'single-index');
    try {
      const cfg = resolveConfig({});
      expect(cfg.sources).toHaveLength(1);
      expect(cfg.apiKey).toBe('from-sources');
      expect(cfg.indexName).toBe('my-index');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
