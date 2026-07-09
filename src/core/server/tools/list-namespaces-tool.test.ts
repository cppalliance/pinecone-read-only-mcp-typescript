import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNamespacesWithCache } from '../namespaces-cache.js';
import { registerListNamespacesTool } from './list-namespaces-tool.js';
import { createMockServer, parseToolJson, assertToolErrorCode } from './test-helpers.js';

vi.mock('../namespaces-cache.js', () => ({
  getNamespacesWithCache: vi.fn(),
}));

const mockedGetNamespaces = vi.mocked(getNamespacesWithCache);

describe('list_namespaces tool handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success with namespaces on happy path', async () => {
    const expiresAt = Date.now() + 1_800_000;
    mockedGetNamespaces.mockResolvedValue({
      data: [
        { namespace: 'a', recordCount: 1, metadata: { title: 'string' } },
        { namespace: 'b', recordCount: 2, metadata: { url: 'string' } },
      ],
      cache_hit: false,
      expires_at: expiresAt,
    });

    const server = createMockServer();
    registerListNamespacesTool(server as never);
    const handler = server.getHandler('list_namespaces')!;
    const raw = await handler({});

    const body = parseToolJson(raw);
    expect(body.status).toBe('success');
    expect(body.cache_hit).toBe(false);
    expect(body.count).toBe(2);
    expect(body.namespaces).toEqual([
      { name: 'a', record_count: 1, metadata_fields: { title: 'string' } },
      { name: 'b', record_count: 2, metadata_fields: { url: 'string' } },
    ]);
    expect(typeof body.cache_ttl_seconds).toBe('number');
  });

  it('propagates cache_hit when namespaces cache is warm', async () => {
    mockedGetNamespaces.mockResolvedValue({
      data: [{ namespace: 'x', recordCount: 0, metadata: {} }],
      cache_hit: true,
      expires_at: Date.now() + 60_000,
    });

    const server = createMockServer();
    registerListNamespacesTool(server as never);
    const body = parseToolJson(await server.getHandler('list_namespaces')!({}));

    expect(body.cache_hit).toBe(true);
    expect(body.count).toBe(1);
  });

  it('returns VALIDATION when source is provided without ServerContext', async () => {
    const server = createMockServer();
    registerListNamespacesTool(server as never);
    const err = assertToolErrorCode(
      await server.getHandler('list_namespaces')!({ source: 'api_key_1' }),
      'VALIDATION'
    );
    expect(err.field).toBe('source');
  });

  it('returns error payload when getNamespacesWithCache throws', async () => {
    mockedGetNamespaces.mockRejectedValue(new Error('network down'));

    const server = createMockServer();
    registerListNamespacesTool(server as never);
    const raw = await server.getHandler('list_namespaces')!({});
    const payload = raw as { isError?: boolean };

    expect(payload.isError).toBe(true);
    const err = assertToolErrorCode(raw, 'PINECONE_ERROR');
    expect(err.message).toBe('Failed to list namespaces');
  });

  it('propagates config_warnings and schema_source via legacy namespaces-cache facade', async () => {
    mockedGetNamespaces.mockResolvedValue({
      data: [
        {
          namespace: 'wg21',
          recordCount: 10,
          metadata: { title: 'string' },
          schema_source: 'declared',
        },
      ],
      cache_hit: false,
      expires_at: Date.now() + 60_000,
      warnings: [
        'Declared namespace "stale_ns" not found in Pinecone index "idx-a" — schema declaration is stale.',
      ],
    });

    const server = createMockServer();
    registerListNamespacesTool(server as never);
    const body = parseToolJson(await server.getHandler('list_namespaces')!({}));

    expect(body.config_warnings).toEqual([
      'Declared namespace "stale_ns" not found in Pinecone index "idx-a" — schema declaration is stale.',
    ]);
    expect(body.namespaces).toEqual([
      {
        name: 'wg21',
        record_count: 10,
        metadata_fields: { title: 'string' },
        schema_source: 'declared',
      },
    ]);
  });
});
