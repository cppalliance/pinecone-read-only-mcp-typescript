import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from '../config.js';
import { PineconeClient } from '../pinecone-client.js';
import {
  ServerContext,
  createServer,
  getDefaultServerContext,
  setDefaultServerContext,
  teardownDefaultServerContext,
} from './server-context.js';

describe('ServerContext', () => {
  afterEach(() => {
    teardownDefaultServerContext();
  });

  const testConfig = () =>
    resolveConfig({
      apiKey: 'sk-test',
      indexName: 'test-index',
    });

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
    expect(ctx.requireSuggested('wg21').ok).toBe(false);

    ctx.setClient({ listNamespacesWithMetadata: listNamespaces } as never);
    ctx.setConfig(testConfig());
    const afterTeardown = await ctx.getNamespacesWithCache();
    expect(afterTeardown.cache_hit).toBe(false);
    expect(listNamespaces).toHaveBeenCalledTimes(2);
  });

  it('teardownDefaultServerContext clears process default', () => {
    createServer(testConfig());
    teardownDefaultServerContext();
    setDefaultServerContext(null);
    const fresh = getDefaultServerContext();
    expect(fresh).not.toBeNull();
  });
});
