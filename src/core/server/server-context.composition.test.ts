import { afterEach, describe, expect, it, vi } from 'vitest';
import { PineconeClient } from '../pinecone-client.js';
import { resolveTestConfig } from './tools/test-helpers.js';
import {
  ServerContext,
  createIsolatedContext,
  createServer,
  getDefaultServerContext,
  teardownDefaultServerContext,
} from './server-context.js';

describe('ServerContext composition API', () => {
  afterEach(() => {
    teardownDefaultServerContext();
  });

  const testConfig = () => resolveTestConfig();

  it('applies injected client, URL generators, namespace cache seed, and suggestion flow seed at construction', async () => {
    const listNamespaces = vi.fn();
    const generator = vi.fn(() => ({
      url: 'https://example.com/doc',
      method: 'generated.custom' as const,
    }));
    const cacheData = [{ namespace: 'wg21', recordCount: 1, metadata: { title: 'string' } }];
    const expiresAt = Date.now() + 60_000;

    const ctx = new ServerContext(testConfig(), {
      client: { listNamespacesWithMetadata: listNamespaces } as never,
      urlGenerators: [['wg21', generator]],
      namespaceCacheSeed: { data: cacheData, expiresAt },
      suggestionFlowSeed: [
        {
          namespace: 'wg21',
          recommended_tool: 'fast',
          suggested_fields: ['title'],
          user_query: 'contracts',
        },
      ],
    });

    expect(ctx.hasInjectedClient()).toBe(true);
    expect(ctx.hasUrlGenerator('wg21')).toBe(true);

    const cached = await ctx.getNamespacesWithCache();
    expect(cached.cache_hit).toBe(true);
    expect(cached.data).toEqual(cacheData);
    expect(listNamespaces).not.toHaveBeenCalled();

    const flow = ctx.requireSuggested('wg21');
    expect(flow.ok).toBe(true);
  });

  it('constructs with suggestionFlowSeed and no config without throwing', () => {
    expect(
      () =>
        new ServerContext(undefined, {
          suggestionFlowSeed: [
            {
              namespace: 'wg21',
              recommended_tool: 'fast',
              suggested_fields: ['title'],
              user_query: 'contracts',
            },
          ],
        })
    ).not.toThrow();

    expect(() => new ServerContext(undefined, {}).getConfig()).toThrow(/Missing Pinecone API key/);
  });

  it('createIsolatedContext does not install process default; createServer does', () => {
    const config = testConfig();
    const isolated = createIsolatedContext(config, {
      client: { query: vi.fn() } as never,
    });
    expect(getDefaultServerContext()).not.toBe(isolated);

    teardownDefaultServerContext();

    const singleton = createServer(config, {
      client: { query: vi.fn() } as never,
    });
    expect(getDefaultServerContext()).toBe(singleton);
  });

  it('matches post-hoc setClient for getClient and getNamespacesWithCache', async () => {
    const config = testConfig();
    const listNamespaces = vi
      .fn()
      .mockResolvedValue([{ namespace: 'wg21', recordCount: 1, metadata: { title: 'string' } }]);
    const injected = { listNamespacesWithMetadata: listNamespaces } as never;

    const viaComposition = new ServerContext(config, { client: injected });
    const viaSetter = new ServerContext(config);
    viaSetter.setClient(injected);

    expect(viaComposition.getClient()).toBe(injected);
    expect(viaSetter.getClient()).toBe(injected);

    await viaComposition.getNamespacesWithCache();
    await viaSetter.getNamespacesWithCache();
    expect(listNamespaces).toHaveBeenCalledTimes(2);
  });

  it('refetches when namespace cache seed is expired', async () => {
    const listNamespaces = vi
      .fn()
      .mockResolvedValue([{ namespace: 'wg21', recordCount: 2, metadata: { title: 'string' } }]);
    const ctx = new ServerContext(testConfig(), {
      client: { listNamespacesWithMetadata: listNamespaces } as never,
      namespaceCacheSeed: {
        data: [{ namespace: 'stale', recordCount: 1, metadata: { title: 'string' } }],
        expiresAt: Date.now() - 1,
      },
    });

    const result = await ctx.getNamespacesWithCache();
    expect(result.cache_hit).toBe(false);
    expect(listNamespaces).toHaveBeenCalledOnce();
    expect(result.data[0]?.namespace).toBe('wg21');
  });

  it('setConfig preserves URL generators but clears namespace cache and suggest-flow', async () => {
    const listNamespaces = vi
      .fn()
      .mockResolvedValue([{ namespace: 'wg21', recordCount: 1, metadata: { title: 'string' } }]);
    const ctx = new ServerContext(testConfig(), {
      client: { listNamespacesWithMetadata: listNamespaces } as never,
      urlGenerators: [['wg21', () => ({ url: 'https://example.com', method: 'generated.custom' })]],
      namespaceCacheSeed: {
        data: [{ namespace: 'wg21', recordCount: 1, metadata: { title: 'string' } }],
        expiresAt: Date.now() + 60_000,
      },
      suggestionFlowSeed: [
        {
          namespace: 'wg21',
          recommended_tool: 'fast',
          suggested_fields: ['title'],
          user_query: 'contracts',
        },
      ],
    });

    expect((await ctx.getNamespacesWithCache()).cache_hit).toBe(true);
    expect(ctx.requireSuggested('wg21').ok).toBe(true);

    ctx.setConfig(resolveTestConfig({ indexName: 'other-index' }));
    ctx.setClient({ listNamespacesWithMetadata: listNamespaces } as never);

    expect(ctx.hasUrlGenerator('wg21')).toBe(true);
    expect(ctx.requireSuggested('wg21').ok).toBe(false);

    const afterConfigChange = await ctx.getNamespacesWithCache();
    expect(afterConfigChange.cache_hit).toBe(false);
    expect(listNamespaces).toHaveBeenCalledTimes(1);
  });

  it('throws synchronously for invalid composition seeds', () => {
    expect(
      () =>
        new ServerContext(testConfig(), {
          suggestionFlowSeed: [
            {
              namespace: '   ',
              recommended_tool: 'fast',
              suggested_fields: [],
              user_query: '',
            },
          ],
        })
    ).toThrow(/suggestionFlowSeed: namespace must not be empty/);

    expect(
      () =>
        new ServerContext(testConfig(), {
          urlGenerators: [['', () => ({ url: null, method: 'unavailable' })]],
        })
    ).toThrow(/namespace must be a non-empty string/);
  });

  it('teardown and AsyncDisposable clear injected client and URL generators', async () => {
    const ctx = new ServerContext(testConfig(), {
      client: { query: vi.fn() } as never,
      urlGenerators: [['wg21', () => ({ url: 'https://example.com', method: 'generated.custom' })]],
    });

    expect(ctx.hasUrlGenerator('wg21')).toBe(true);

    await (async () => {
      await using scoped = ctx;
      expect(scoped.disposed).toBe(false);
    })();

    expect(ctx.disposed).toBe(true);
    expect(() => ctx.getClientIfSet()).toThrow(/not initialized/);
    expect(ctx.hasUrlGenerator('wg21')).toBe(false);
  });

  it('fromClient wraps client in composition object', () => {
    const injected = { query: vi.fn() } as unknown as PineconeClient;
    const ctx = ServerContext.fromClient(testConfig(), injected);
    expect(ctx.getClient()).toBe(injected);
    expect(ctx.hasInjectedClient()).toBe(true);
  });
});
