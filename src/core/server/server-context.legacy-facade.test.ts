import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAllianceConfig } from '../../alliance/config.js';
import { setupAllianceServer } from '../../alliance/setup.js';
import { setPineconeClient, setupCoreServer, teardownServer } from '../index.js';
import { getPineconeClient } from './client-context.js';
import { createIsolatedContext, createServer, getDefaultServerContext } from './server-context.js';
import {
  createTestServerContext,
  isolateFromDefaultContext,
  resolveTestConfig,
} from './tools/test-helpers.js';

describe('legacy facade vs explicit setup context', () => {
  afterEach(() => {
    teardownServer();
    isolateFromDefaultContext();
  });

  it('legacy then setup with config keeps getPineconeClient consistent with default context', async () => {
    isolateFromDefaultContext();
    const injected = { query: vi.fn() };
    const cfg = resolveTestConfig({ apiKey: 'legacy-config', indexName: 'idx-config' });
    setPineconeClient(injected as never);

    await setupCoreServer(cfg);

    expect(getPineconeClient()).toBe(injected);
    expect(getDefaultServerContext().getClient()).toBe(injected);
  });

  it('legacy then setup with explicit context throws on getPineconeClient', async () => {
    isolateFromDefaultContext();
    const injected = { query: vi.fn() };
    setPineconeClient(injected as never);
    const isolatedCtx = createTestServerContext({
      config: resolveTestConfig({ apiKey: 'isolated', indexName: 'idx-iso' }),
      client: { query: vi.fn() } as never,
    });

    await setupCoreServer({ context: isolatedCtx });

    expect(() => getPineconeClient()).toThrow(/Legacy module facades are unavailable/);
    expect(() => getDefaultServerContext()).toThrow(/Legacy module facades are unavailable/);
    expect(isolatedCtx.hasToolsRegistered()).toBe(true);
  });

  it('setupAllianceServer with explicit context throws on legacy facade use', async () => {
    isolateFromDefaultContext();
    setPineconeClient({ query: vi.fn() } as never);
    const isolatedCtx = createIsolatedContext(
      resolveAllianceConfig({ apiKey: 'isolated', indexName: 'idx-iso' }),
      { client: { query: vi.fn() } as never }
    );

    await setupAllianceServer({ context: isolatedCtx });

    expect(() => getPineconeClient()).toThrow(/Legacy module facades are unavailable/);
  });

  it('instance-only setup with createServer context does not require legacy facades', async () => {
    isolateFromDefaultContext();
    const cfg = resolveTestConfig({ apiKey: 'instance-only', indexName: 'idx-io' });
    const ctx = createServer(cfg, { client: { query: vi.fn() } as never });

    await setupCoreServer({ context: ctx });

    expect(ctx.hasToolsRegistered()).toBe(true);
    expect(ctx.getClient()).toBeDefined();
  });

  it('createIsolatedContext setup without prior legacy use allows lazy default until facade call', async () => {
    isolateFromDefaultContext();
    const isolatedCtx = createIsolatedContext(resolveTestConfig({ apiKey: 'pure-iso' }), {
      client: { query: vi.fn() } as never,
    });

    await setupCoreServer({ context: isolatedCtx });

    expect(isolatedCtx.hasToolsRegistered()).toBe(true);
    expect(() => getPineconeClient()).toThrow(/Legacy module facades are unavailable/);
  });

  it('teardownServer after supersede restores legacy facade path', async () => {
    isolateFromDefaultContext();
    setPineconeClient({ query: vi.fn() } as never);
    const isolatedCtx = createTestServerContext({ client: { query: vi.fn() } as never });

    await setupCoreServer({ context: isolatedCtx });
    expect(() => getPineconeClient()).toThrow(/Legacy module facades are unavailable/);

    teardownServer();

    const reinjected = { query: vi.fn() };
    setPineconeClient(reinjected as never);
    expect(getPineconeClient()).toBe(reinjected);
  });
});
