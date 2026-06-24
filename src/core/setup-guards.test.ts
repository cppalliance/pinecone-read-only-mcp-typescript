import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAllianceConfig } from '../alliance/config.js';
import { setupAllianceServer } from '../alliance/setup.js';
import { setPineconeClient, setupCoreServer, teardownServer } from './index.js';
import {
  ServerContext,
  createUnconfiguredAllianceContext,
  createIsolatedContext,
  getDefaultServerContext,
  setDefaultServerContext,
} from './server/server-context.js';
import {
  createTestServerContext,
  isolateFromDefaultContext,
  resolveTestConfig,
} from './server/tools/test-helpers.js';

describe('setup guards (CodeRabbit PR #150)', () => {
  afterEach(() => {
    teardownServer();
    isolateFromDefaultContext();
  });

  it('preserves injected client when setupAllianceServer receives context only', async () => {
    isolateFromDefaultContext();
    const mockClient = { query: vi.fn() };
    const ctx = createIsolatedContext(
      resolveAllianceConfig({ apiKey: 'sk-test', indexName: 'test-index' }),
      { client: mockClient as never }
    );

    await setupAllianceServer({ context: ctx });

    expect(ctx.getClient()).toBe(mockClient);
  });

  it('installs Alliance defaults on context without config (no core lazy-resolve)', async () => {
    isolateFromDefaultContext();
    const ctx = createUnconfiguredAllianceContext();
    expect(ctx.hasConfig()).toBe(false);
    expect(() => ctx.getConfig()).toThrow(/Alliance ServerContext has no config/);

    vi.stubEnv('PINECONE_API_KEY', 'sk-alliance-default');
    try {
      await setupAllianceServer({ context: ctx });
    } finally {
      vi.unstubAllEnvs();
    }

    expect(ctx.hasConfig()).toBe(true);
    expect(ctx.getConfig().disableSuggestFlow).toBe(false);
  });

  it('allows config update when context only has a lazy-built client', async () => {
    isolateFromDefaultContext();
    const cfgA = resolveTestConfig({ apiKey: 'lazy-config-a', indexName: 'idx-a' });
    const cfgB = resolveTestConfig({ apiKey: 'lazy-config-b', indexName: 'idx-b' });
    const ctx = createTestServerContext({ config: cfgA });
    ctx.getClient();
    expect(ctx.hasInjectedClient()).toBe(false);

    await expect(setupCoreServer({ config: cfgB, context: ctx })).resolves.toBeDefined();
    expect(ctx.getConfig().indexName).toBe('idx-b');
  });

  it('throws when setupCoreServer receives both config and context with injected client', async () => {
    isolateFromDefaultContext();
    const mockClient = { query: vi.fn() };
    const cfg = resolveTestConfig({ apiKey: 'guard-config-context' });
    const ctx = createTestServerContext({ config: cfg, client: mockClient as never });

    await expect(setupCoreServer({ config: cfg, context: ctx })).rejects.toThrow(
      /injected Pinecone client/
    );
    expect(ctx.getClient()).toBe(mockClient);
  });

  it('does not reuse a lazy-built client from the default context on legacy setup', async () => {
    isolateFromDefaultContext();
    const cfgA = resolveTestConfig({ apiKey: 'reuse-lazy-a', indexName: 'idx-a' });
    const cfgB = resolveTestConfig({ apiKey: 'reuse-lazy-b', indexName: 'idx-b' });

    const defaultCtx = new ServerContext(cfgA);
    const lazyClient = defaultCtx.getClient();
    expect(defaultCtx.hasInjectedClient()).toBe(false);
    setDefaultServerContext(defaultCtx);

    await setupCoreServer(cfgB);

    const newCtx = getDefaultServerContext();
    expect(newCtx.getConfig().indexName).toBe('idx-b');
    expect(newCtx.hasInjectedClient()).toBe(false);
    expect(newCtx.getClient()).not.toBe(lazyClient);
  });

  it('reuses an explicitly injected client on legacy setup', async () => {
    isolateFromDefaultContext();
    const cfgB = resolveTestConfig({ apiKey: 'reuse-explicit-b', indexName: 'idx-b' });
    const injected = { query: vi.fn() };
    setPineconeClient(injected as never);

    await setupCoreServer(cfgB);

    expect(getDefaultServerContext().getClient()).toBe(injected);
    expect(getDefaultServerContext().hasInjectedClient()).toBe(true);
  });

  it('throws TypeError for invalid setupCoreServer options object', async () => {
    await expect(setupCoreServer({ foo: 'bar' } as never)).rejects.toThrow(
      /CoreServerConfig or SetupCoreServerOptions/
    );
  });

  it('throws TypeError for invalid setupAllianceServer options object', async () => {
    await expect(setupAllianceServer({ foo: 'bar' } as never)).rejects.toThrow(
      /AllianceServerConfig or SetupAllianceServerOptions/
    );
  });

  it('rejects Alliance-branded config at runtime on setupCoreServer', async () => {
    const allianceCfg = resolveAllianceConfig({ apiKey: 'sk-test', indexName: 'idx' });
    await expect(setupCoreServer(allianceCfg as never)).rejects.toThrow(/CoreServerConfig/);
    await expect(setupCoreServer({ config: allianceCfg } as never)).rejects.toThrow(
      /CoreServerConfig/
    );
  });

  it('rejects core-branded config at runtime on setupAllianceServer', async () => {
    const coreCfg = resolveTestConfig({ apiKey: 'sk-test', indexName: 'idx' });
    await expect(setupAllianceServer(coreCfg as never)).rejects.toThrow(/AllianceServerConfig/);
    await expect(setupAllianceServer({ config: coreCfg } as never)).rejects.toThrow(
      /AllianceServerConfig/
    );
  });
});
