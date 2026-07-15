import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import {
  parseInlineSources,
  parseSourcesConfigFile,
  resolveEnvIndirection,
  resolveSourceDefinitions,
} from './source-config.js';
import { resolveConfig } from '../config.js';

describe('source-config', () => {
  it('resolves env indirection', () => {
    const env = { PINECONE_API_KEY_1: 'key-one' };
    expect(resolveEnvIndirection('${PINECONE_API_KEY_1}', env)).toBe('key-one');
  });

  it('throws on malformed env indirection reference', () => {
    expect(() => resolveEnvIndirection('${internal-corpus}', {})).toThrow(
      /Invalid environment variable reference/
    );
  });

  it('parses inline sources', () => {
    const env = {
      K1: 'api-1',
      K2: 'api-2',
    };
    const sources = parseInlineSources(
      'api_key_1:${K1}:index_name_1;api_key_2:${K2}:index_name_2',
      env
    );
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({
      name: 'api_key_1',
      apiKey: 'api-1',
      indexName: 'index_name_1',
      sparseIndexName: 'index_name_1-sparse',
    });
    expect(sources[1]?.name).toBe('api_key_2');
  });

  it('throws on duplicate source name in inline string', () => {
    expect(() => parseInlineSources('api_key_1:sk-a:idx-a;api_key_1:sk-b:idx-b', {})).toThrow(
      /Duplicate source name "api_key_1"/
    );
  });

  it('parseSourcesConfigFile resolves env indirection and defaultSource', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pinecone-sources-'));
    const filePath = join(dir, 'sources.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        defaultSource: 'api_key_2',
        sources: {
          api_key_1: { apiKey: '${K1}', indexName: 'index_name_1' },
          api_key_2: { apiKey: '${K2}', indexName: 'index_name_2' },
        },
      })
    );
    const env = { K1: 'api-1', K2: 'api-2' };
    const parsed = parseSourcesConfigFile(filePath, env);
    expect(parsed.defaultSource).toBe('api_key_2');
    expect(parsed.sources).toHaveLength(2);
    const first = parsed.sources.find((s) => s.name === 'api_key_1');
    expect(first).toMatchObject({
      apiKey: 'api-1',
      indexName: 'index_name_1',
      sparseIndexName: 'index_name_1-sparse',
    });
  });

  it('parseSourcesConfigFile treats null sparseIndexName and rerankModel as omitted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pinecone-sources-'));
    const filePath = join(dir, 'null-sparse.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        defaultSource: 'api_key_1',
        sources: {
          api_key_1: {
            apiKey: 'k',
            indexName: 'index_name_1',
            sparseIndexName: null,
            rerankModel: null,
          },
        },
      })
    );
    const parsed = parseSourcesConfigFile(filePath, {});
    const first = parsed.sources.find((s) => s.name === 'api_key_1');
    expect(first?.sparseIndexName).toBe('index_name_1-sparse');
    expect(first?.rerankModel).toBeUndefined();
  });

  it('throws when defaultSource is not a configured source name', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pinecone-sources-'));
    const filePath = join(dir, 'bad-default.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        defaultSource: 'missing',
        sources: {
          api_key_1: { apiKey: 'k', indexName: 'idx' },
        },
      })
    );
    expect(() => parseSourcesConfigFile(filePath, {})).toThrow(/defaultSource/);
  });

  it('parseSourcesConfigFile reads description and namespaces with metadata_schema', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pinecone-sources-'));
    const filePath = join(dir, 'sources.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        defaultSource: 'api_key_1',
        sources: {
          api_key_1: {
            apiKey: 'k',
            indexName: 'index_name_1',
            description: 'Staff corpus hint',
            namespaces: {
              example_ns: {
                description: 'Namespace hint',
                metadata_schema: { field_a: 'string', field_b: 'number' },
              },
            },
          },
        },
      })
    );
    const parsed = parseSourcesConfigFile(filePath, {});
    const first = parsed.sources[0];
    expect(first?.description).toBe('Staff corpus hint');
    expect(first?.namespaces?.example_ns).toMatchObject({
      description: 'Namespace hint',
      metadata_schema: { field_a: 'string', field_b: 'number' },
    });
  });

  it('parseSourcesConfigFile omits description and namespaces when not set (back-compat)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pinecone-sources-'));
    const filePath = join(dir, 'minimal.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        defaultSource: 'api_key_1',
        sources: {
          api_key_1: { apiKey: 'k', indexName: 'idx' },
        },
      })
    );
    const parsed = parseSourcesConfigFile(filePath, {});
    const first = parsed.sources[0];
    expect(first?.description).toBeUndefined();
    expect(first?.namespaces).toBeUndefined();
  });

  it('parseSourcesConfigFile throws when source entry is not an object', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pinecone-sources-'));
    const filePath = join(dir, 'bad-source-entry.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        defaultSource: 'api_key_1',
        sources: {
          api_key_1: 'not-an-object',
        },
      })
    );
    expect(() => parseSourcesConfigFile(filePath, {})).toThrow(
      /Source "api_key_1" in config file .* must be an object/
    );
  });

  it('parseSourcesConfigFile throws when source description is not a string', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pinecone-sources-'));
    const filePath = join(dir, 'bad-source-description.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        defaultSource: 'api_key_1',
        sources: {
          api_key_1: { apiKey: 'k', indexName: 'idx', description: 42 },
        },
      })
    );
    expect(() => parseSourcesConfigFile(filePath, {})).toThrow(
      /Source "api_key_1": description must be a string/
    );
  });

  it('parseSourcesConfigFile throws when namespace description is not a string', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pinecone-sources-'));
    const filePath = join(dir, 'bad-namespace-description.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        defaultSource: 'api_key_1',
        sources: {
          api_key_1: {
            apiKey: 'k',
            indexName: 'idx',
            namespaces: { example_ns: { description: 42 } },
          },
        },
      })
    );
    expect(() => parseSourcesConfigFile(filePath, {})).toThrow(
      /namespaces\["example_ns"\]\.description must be a string/
    );
  });

  it('parseSourcesConfigFile throws on malformed metadata_schema value', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pinecone-sources-'));
    const filePath = join(dir, 'bad-schema.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        defaultSource: 'api_key_1',
        sources: {
          api_key_1: {
            apiKey: 'k',
            indexName: 'idx',
            namespaces: { ns1: { metadata_schema: { field_a: 123 } } },
          },
        },
      })
    );
    expect(() => parseSourcesConfigFile(filePath, {})).toThrow(/metadata_schema/);
  });

  it('parseInlineSources never includes description or namespaces', () => {
    const sources = parseInlineSources('api_key_1:sk:idx', {});
    expect(sources[0]).not.toHaveProperty('description');
    expect(sources[0]).not.toHaveProperty('namespaces');
  });

  it('resolveSourceDefinitions colon format still works (regression)', () => {
    const env = { K1: 'api-1', PINECONE_SOURCES: 'api_key_1:${K1}:index_name_1' };
    const parsed = resolveSourceDefinitions({}, env);
    expect(parsed?.sources[0]).toMatchObject({
      name: 'api_key_1',
      apiKey: 'api-1',
      indexName: 'index_name_1',
    });
    expect(parsed?.sources[0]).not.toHaveProperty('description');
  });

  it('resolveSourceDefinitions throws when PINECONE_SOURCES is inline JSON', () => {
    const env = {
      PINECONE_SOURCES: JSON.stringify({ api_key_1: { indexName: 'index_name_1' } }),
    };
    expect(() => resolveSourceDefinitions({}, env)).toThrow(
      /PINECONE_SOURCES no longer accepts inline JSON/
    );
  });

  it('resolveSourceDefinitions prefers config file over colon PINECONE_SOURCES', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pinecone-sources-'));
    const filePath = join(dir, 'sources.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        defaultSource: 'from_file',
        sources: {
          from_file: { apiKey: 'file-key', indexName: 'file-index' },
        },
      })
    );
    const env = {
      PINECONE_SOURCES: 'from_inline:sk:inline-index',
      PINECONE_CONFIG_FILE: filePath,
    };
    const parsed = resolveSourceDefinitions({}, env);
    expect(parsed?.defaultSource).toBe('from_file');
    expect(parsed?.sources[0]?.indexName).toBe('file-index');
  });

  it('parseSourcesConfigFile throws when defaulted apiKey env is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pinecone-sources-'));
    const filePath = join(dir, 'defaulted-apikey.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        defaultSource: 'api_key_1',
        sources: {
          api_key_1: { indexName: 'index_name_1' },
        },
      })
    );
    expect(() => parseSourcesConfigFile(filePath, {})).toThrow(
      /Environment variable api_key_1 is not set/
    );
  });

  it('parseSourcesConfigFile throws when hyphenated source name uses defaulted apiKey', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pinecone-sources-'));
    const filePath = join(dir, 'hyphenated.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        defaultSource: 'internal-corpus',
        sources: {
          'internal-corpus': { indexName: 'index_name_1' },
        },
      })
    );
    expect(() => parseSourcesConfigFile(filePath, {})).toThrow(
      /Invalid environment variable reference "\$\{internal-corpus\}"/
    );
  });

  it('resolveConfig uses PINECONE_SOURCES when set', () => {
    vi.stubEnv('PINECONE_SOURCES', 'api_key_1:sk-test:my-index');
    vi.stubEnv('PINECONE_API_KEY', 'ignored');
    try {
      const cfg = resolveConfig({});
      expect(cfg.sources).toHaveLength(1);
      expect(cfg.sources?.[0]?.name).toBe('api_key_1');
      expect(cfg.apiKey).toBe('sk-test');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('resolveConfig prefers PINECONE_SOURCES over PINECONE_API_KEY', () => {
    vi.stubEnv('PINECONE_SOURCES', 'api_key_1:from-sources:my-index');
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

  it('resolveConfig uses defaultSource for top-level index fields', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pinecone-sources-'));
    const filePath = join(dir, 'sources.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        defaultSource: 'api_key_2',
        sources: {
          api_key_1: { apiKey: 'k1', indexName: 'index_name_1' },
          api_key_2: { apiKey: 'k2', indexName: 'index_name_2' },
        },
      })
    );
    vi.stubEnv('PINECONE_CONFIG_FILE', filePath);
    try {
      const cfg = resolveConfig({});
      expect(cfg.defaultSource).toBe('api_key_2');
      expect(cfg.indexName).toBe('index_name_2');
      expect(cfg.apiKey).toBe('k2');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('resolveSourceDefinitions prefers config file over inline env', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pinecone-sources-'));
    const filePath = join(dir, 'sources.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        defaultSource: 'from_file',
        sources: {
          from_file: { apiKey: 'file-key', indexName: 'file-index' },
        },
      })
    );
    const env = {
      PINECONE_SOURCES: 'from_inline:sk:inline-index',
      PINECONE_CONFIG_FILE: filePath,
    };
    const parsed = resolveSourceDefinitions({}, env);
    expect(parsed?.defaultSource).toBe('from_file');
    expect(parsed?.sources[0]?.indexName).toBe('file-index');
  });

  it('resolveSourceDefinitions prefers overrides.configFile over env PINECONE_SOURCES', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pinecone-sources-'));
    const filePath = join(dir, 'sources.json');
    writeFileSync(
      filePath,
      JSON.stringify({
        defaultSource: 'from_override',
        sources: {
          from_override: { apiKey: 'override-key', indexName: 'override-index' },
        },
      })
    );
    const env = { PINECONE_SOURCES: 'from_env:sk:env-index' };
    const parsed = resolveSourceDefinitions({ configFile: filePath }, env);
    expect(parsed?.defaultSource).toBe('from_override');
    expect(parsed?.sources[0]?.indexName).toBe('override-index');
  });
});
