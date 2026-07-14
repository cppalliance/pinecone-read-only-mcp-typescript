import { describe, expect, it, vi } from 'vitest';
import type { PineconeClient } from '../pinecone-client.js';
import type { SourceDefinition } from './source-config.js';
import {
  SCHEMA_MANIFEST_NAMESPACE,
  SCHEMA_MANIFEST_RECORD_ID,
  loadRemoteSchemaForSource,
  loadRemoteSchemaForSources,
} from './remote-schema.js';

function baseDefinition(overrides?: Partial<SourceDefinition>): SourceDefinition {
  return {
    name: 'api_key_1',
    apiKey: 'key',
    indexName: 'rag-hybrid',
    sparseIndexName: 'rag-hybrid-sparse',
    ...overrides,
  };
}

function mockClient(
  fetchImpl: (namespace: string, id: string) => Promise<Record<string, unknown> | null>
): PineconeClient {
  return {
    fetchRecordFields: vi.fn(fetchImpl),
  } as unknown as PineconeClient;
}

describe('remote-schema', () => {
  it('merges description and namespaces from chunk_text in metadata', async () => {
    const manifest = {
      description: 'Corpus hint',
      namespaces: {
        mailing: {
          description: 'Mailing threads',
          metadata_schema: { doc_id: 'string' },
          record_count: 100,
        },
      },
    };
    const client = mockClient(async () => ({
      chunk_text: JSON.stringify(manifest),
    }));

    const { definition, warning } = await loadRemoteSchemaForSource(client, baseDefinition());

    expect(warning).toBeUndefined();
    expect(definition.description).toBe('Corpus hint');
    expect(definition.namespaces?.mailing).toMatchObject({
      description: 'Mailing threads',
      metadata_schema: { doc_id: 'string' },
    });
    expect(client.fetchRecordFields).toHaveBeenCalledWith(
      SCHEMA_MANIFEST_NAMESPACE,
      SCHEMA_MANIFEST_RECORD_ID
    );
  });

  it('reads chunk_text when returned as a top-level field', async () => {
    const manifest = {
      namespaces: {
        docs: { metadata_schema: { title: 'string' } },
      },
    };
    const client = mockClient(async () => ({
      id: SCHEMA_MANIFEST_RECORD_ID,
      chunk_text: JSON.stringify(manifest),
    }));

    const { definition } = await loadRemoteSchemaForSource(client, baseDefinition());

    expect(definition.namespaces?.docs?.metadata_schema).toEqual({ title: 'string' });
  });

  it('returns unchanged when record is missing (no warning)', async () => {
    const client = mockClient(async () => null);
    const input = baseDefinition();

    const { definition, warning } = await loadRemoteSchemaForSource(client, input);

    expect(warning).toBeUndefined();
    expect(definition).toEqual(input);
  });

  it('returns warning on malformed JSON in chunk_text', async () => {
    const client = mockClient(async () => ({ chunk_text: '{not json' }));
    const input = baseDefinition();

    const { definition, warning } = await loadRemoteSchemaForSource(client, input);

    expect(definition).toEqual(input);
    expect(warning).toMatch(/malformed \(invalid JSON/);
  });

  it('returns warning when chunk_text is valid JSON but namespaces has the wrong shape', async () => {
    const client = mockClient(async () => ({
      chunk_text: JSON.stringify({ namespaces: ['not', 'an', 'object'] }),
    }));
    const input = baseDefinition();

    const { definition, warning } = await loadRemoteSchemaForSource(client, input);

    expect(definition).toEqual(input);
    expect(warning).toMatch(/malformed \(manifest "namespaces" must be an object\)/);
  });

  it('returns warning when fetch throws', async () => {
    const client = mockClient(async () => {
      throw new Error('network down');
    });
    const input = baseDefinition();

    const { definition, warning } = await loadRemoteSchemaForSource(client, input);

    expect(definition).toEqual(input);
    expect(warning).toMatch(/failed to fetch/);
  });

  it('skips fetch when local namespaces are already set', async () => {
    const fetchFn = vi.fn(async () => ({ chunk_text: '{}' }));
    const client = mockClient(fetchFn);
    const input = baseDefinition({
      namespaces: { local_ns: { description: 'local' } },
    });

    const { definition, warning } = await loadRemoteSchemaForSource(client, input);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(warning).toBeUndefined();
    expect(definition).toEqual(input);
  });

  it('keeps local description when merging remote namespaces', async () => {
    const client = mockClient(async () => ({
      chunk_text: JSON.stringify({
        description: 'remote description',
        namespaces: { ns1: { metadata_schema: { a: 'string' } } },
      }),
    }));
    const input = baseDefinition({ description: 'local description' });

    const { definition } = await loadRemoteSchemaForSource(client, input);

    expect(definition.description).toBe('local description');
    expect(definition.namespaces?.ns1?.metadata_schema).toEqual({ a: 'string' });
  });

  it('loadRemoteSchemaForSources processes multiple entries', async () => {
    const client1 = mockClient(async () => ({
      chunk_text: JSON.stringify({ description: 'source one' }),
    }));
    const client2 = mockClient(async () => null);

    const result = await loadRemoteSchemaForSources([
      { definition: baseDefinition({ name: 's1' }), client: client1 },
      { definition: baseDefinition({ name: 's2' }), client: client2 },
    ]);

    expect(result.definitions).toHaveLength(2);
    expect(result.definitions[0]?.description).toBe('source one');
    expect(result.warnings).toHaveLength(0);
  });
});
