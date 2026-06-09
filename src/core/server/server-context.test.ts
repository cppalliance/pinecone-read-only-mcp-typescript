import { afterEach, describe, expect, it, vi } from 'vitest';
import { PineconeClient } from '../pinecone-client.js';
import { resolveTestConfig } from './tools/test-helpers.js';
import {
  ServerContext,
  createServer,
  getDefaultServerContext,
  teardownDefaultServerContext,
} from './server-context.js';

describe('ServerContext', () => {
  afterEach(() => {
    teardownDefaultServerContext();
    vi.useRealTimers();
  });

  const testConfig = () => resolveTestConfig();

  it('lazy-builds Pinecone client on first getClient()', () => {
    const ctx = new ServerContext(testConfig());
    const client = ctx.getClient();
    expect(client).toBeInstanceOf(PineconeClient);
    expect(ctx.getClient()).toBe(client);
  });

  it('honors externally injected client via setClient and fromClient', () => {
    const config = testConfig();
    const injected = { query: vi.fn() } as unknown as PineconeClient;

    const viaSetter = new ServerContext(config);
    viaSetter.setClient(injected);
    expect(viaSetter.getClient()).toBe(injected);
    expect(viaSetter.getClientIfSet()).toBe(injected);

    const viaFactory = ServerContext.fromClient(config, injected);
    expect(viaFactory.getClient()).toBe(injected);
  });

  it('createServer installs default context', () => {
    const config = testConfig();
    const ctx = createServer(config);
    expect(getDefaultServerContext()).toBe(ctx);
    expect(ctx.getConfig()).toEqual(config);
  });

  it('setConfig clears client, namespaces cache, and suggest-flow', async () => {
    const listA = vi
      .fn()
      .mockResolvedValue([{ namespace: 'a', recordCount: 1, metadata: { title: 'string' } }]);
    const listB = vi
      .fn()
      .mockResolvedValue([{ namespace: 'b', recordCount: 2, metadata: { title: 'string' } }]);
    const ctx = ServerContext.fromClient(testConfig(), {
      listNamespacesWithMetadata: listA,
    } as never);

    ctx.markSuggested('wg21', {
      recommended_tool: 'fast',
      suggested_fields: ['title'],
      user_query: 'contracts',
    });
    await ctx.getNamespacesWithCache();
    expect((await ctx.getNamespacesWithCache()).cache_hit).toBe(true);
    expect(ctx.requireSuggested('wg21').ok).toBe(true);

    ctx.setConfig(resolveTestConfig({ indexName: 'other-index' }));
    expect(() => ctx.getClientIfSet()).toThrow(/not initialized/);
    expect(ctx.requireSuggested('wg21').ok).toBe(false);

    ctx.setClient({ listNamespacesWithMetadata: listB } as never);
    const afterConfigChange = await ctx.getNamespacesWithCache();
    expect(afterConfigChange.cache_hit).toBe(false);
    expect(listA).toHaveBeenCalledOnce();
    expect(listB).toHaveBeenCalledOnce();
  });

  it('requireSuggested bypasses gate when disableSuggestFlow comes from resolved config', () => {
    const prevDisable = process.env['PINECONE_DISABLE_SUGGEST_FLOW'];
    const prevKey = process.env['PINECONE_API_KEY'];
    const prevIndex = process.env['PINECONE_INDEX_NAME'];
    try {
      process.env['PINECONE_DISABLE_SUGGEST_FLOW'] = 'true';
      process.env['PINECONE_API_KEY'] = 'sk-test';
      process.env['PINECONE_INDEX_NAME'] = 'test-index';
      const ctx = new ServerContext();
      expect(ctx.requireSuggested('wg21')).toMatchObject({ ok: true });
    } finally {
      if (prevDisable === undefined) {
        delete process.env['PINECONE_DISABLE_SUGGEST_FLOW'];
      } else {
        process.env['PINECONE_DISABLE_SUGGEST_FLOW'] = prevDisable;
      }
      if (prevKey === undefined) {
        delete process.env['PINECONE_API_KEY'];
      } else {
        process.env['PINECONE_API_KEY'] = prevKey;
      }
      if (prevIndex === undefined) {
        delete process.env['PINECONE_INDEX_NAME'];
      } else {
        process.env['PINECONE_INDEX_NAME'] = prevIndex;
      }
    }
  });

  it('teardown clears client, URL registry, suggest-flow, and namespaces cache', async () => {
    const config = testConfig();
    const listNamespaces = vi
      .fn()
      .mockResolvedValue([{ namespace: 'wg21', recordCount: 1, metadata: { title: 'string' } }]);
    const ctx = ServerContext.fromClient(config, {
      listNamespacesWithMetadata: listNamespaces,
    } as never);

    ctx.registerUrlGenerator('wg21', () => ({
      url: 'https://example.com/doc',
      method: 'generated.custom',
    }));
    ctx.markSuggested('wg21', {
      recommended_tool: 'count',
      suggested_fields: ['title'],
      user_query: 'how many',
    });

    await ctx.getNamespacesWithCache();
    expect(ctx.hasUrlGenerator('wg21')).toBe(true);
    expect(ctx.requireSuggested('wg21').ok).toBe(true);
    expect((await ctx.getNamespacesWithCache()).cache_hit).toBe(true);

    ctx.teardown();
    expect(() => ctx.getClientIfSet()).toThrow(/not initialized/);
    expect(ctx.hasUrlGenerator('wg21')).toBe(false);
    ctx.setConfig(testConfig());
    expect(ctx.requireSuggested('wg21').ok).toBe(false);

    ctx.setClient({ listNamespacesWithMetadata: listNamespaces } as never);
    const afterTeardown = await ctx.getNamespacesWithCache();
    expect(afterTeardown.cache_hit).toBe(false);
    expect(listNamespaces).toHaveBeenCalledTimes(2);
  });

  it('teardownDefaultServerContext clears process default', () => {
    createServer(testConfig());
    teardownDefaultServerContext();
    const fresh = getDefaultServerContext();
    expect(fresh).not.toBeNull();
  });

  it('requireSuggested returns expiry message after TTL on instance context', () => {
    vi.useFakeTimers();
    const ctx = new ServerContext(resolveTestConfig({ cacheTtlSeconds: 1 }));
    ctx.markSuggested('wg21', {
      recommended_tool: 'fast',
      suggested_fields: ['title'],
      user_query: 'contracts',
    });
    expect(ctx.requireSuggested('wg21').ok).toBe(true);
    vi.advanceTimersByTime(2000);
    const expired = ctx.requireSuggested('wg21');
    expect(expired.ok).toBe(false);
    if (!expired.ok) {
      expect(expired.message).toMatch(/expired/);
    }
  });
});
