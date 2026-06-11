import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAllianceConfig } from '../alliance/config.js';
import { setupAllianceServer } from '../alliance/setup.js';
import { setupCoreServer, teardownServer } from './setup.js';
import {
  createTestServerContext,
  isolateFromDefaultContext,
  resolveTestConfig,
} from './server/tools/test-helpers.js';

const MAILING_DOC_ID = 'boost-announce@lists.boost.org/message/O5VYCDZADVDHK5Z5LAYJBHMDOAFQL7P6';

describe('setup multi-instance (phase 4)', () => {
  afterEach(() => {
    teardownServer();
    isolateFromDefaultContext();
  });

  it('allows two ServerContext instances to register tools without teardown between them', async () => {
    isolateFromDefaultContext();
    const cfgA = resolveTestConfig({ apiKey: 'multi-setup-a' });
    const cfgB = resolveAllianceConfig({ apiKey: 'multi-setup-b', indexName: 'idx-b' });
    const ctxA = createTestServerContext({ config: cfgA });
    const ctxB = createTestServerContext({ config: cfgB });

    await expect(setupCoreServer({ context: ctxA })).resolves.toBeDefined();
    await expect(setupAllianceServer({ context: ctxB })).resolves.toBeDefined();
  });

  it('isolates URL registry between instances', async () => {
    isolateFromDefaultContext();
    const cfgA = resolveTestConfig({ apiKey: 'url-iso-a' });
    const cfgB = resolveAllianceConfig({ apiKey: 'url-iso-b', indexName: 'idx-b' });
    const ctxA = createTestServerContext({ config: cfgA });
    const ctxB = createTestServerContext({ config: cfgB });

    await setupCoreServer({ context: ctxA });
    await setupAllianceServer({ context: ctxB });

    const metadata = { doc_id: MAILING_DOC_ID };
    const fromA = ctxA.generateUrlForNamespace('mailing', metadata);
    const fromB = ctxB.generateUrlForNamespace('mailing', metadata);

    expect(fromA.method).toBe('unavailable');
    expect(fromA.url).toBeNull();
    expect(fromB.method).toBe('generated.mailing');
    expect(fromB.url).toContain('lists.boost.org');
  });

  it('isolates suggest-flow between instances', async () => {
    isolateFromDefaultContext();
    const cfgA = resolveTestConfig({ apiKey: 'flow-iso-a', disableSuggestFlow: false });
    const cfgB = resolveTestConfig({ apiKey: 'flow-iso-b', disableSuggestFlow: false });
    const ctxA = createTestServerContext({ config: cfgA });
    const ctxB = createTestServerContext({ config: cfgB });

    await setupCoreServer({ context: ctxA });
    await setupCoreServer({ context: ctxB });

    ctxA.markSuggested('wg21', {
      recommended_tool: 'fast',
      suggested_fields: ['title'],
      user_query: 'papers',
    });

    const resultB = ctxB.requireSuggested('wg21');
    expect(resultB.ok).toBe(false);
    if (!resultB.ok) {
      expect(resultB.message).toContain('suggest_query_params');
    }
  });

  it('isolates namespaces cache between instances', async () => {
    isolateFromDefaultContext();
    const listNsA = vi
      .fn()
      .mockResolvedValue([{ namespace: 'wg21', recordCount: 10, metadata: { source: 'a' } }]);
    const listNsB = vi
      .fn()
      .mockResolvedValue([{ namespace: 'other', recordCount: 5, metadata: { source: 'b' } }]);
    const cfgA = resolveTestConfig({ apiKey: 'cache-iso-a' });
    const cfgB = resolveTestConfig({ apiKey: 'cache-iso-b' });
    const ctxA = createTestServerContext({
      config: cfgA,
      client: { listNamespacesWithMetadata: listNsA } as never,
    });
    const ctxB = createTestServerContext({
      config: cfgB,
      client: { listNamespacesWithMetadata: listNsB } as never,
    });

    // Contexts already carry config; omit config at setup to preserve injected clients.
    await setupCoreServer({ context: ctxA });
    await setupCoreServer({ context: ctxB });

    const resultA = await ctxA.getNamespacesWithCache();
    expect(resultA.cache_hit).toBe(false);
    expect(listNsA).toHaveBeenCalledTimes(1);

    const resultB = await ctxB.getNamespacesWithCache();
    expect(resultB.cache_hit).toBe(false);
    expect(listNsB).toHaveBeenCalledTimes(1);
    expect(listNsA).toHaveBeenCalledTimes(1);
  });

  it('preserves externally injected client when context is provided', async () => {
    isolateFromDefaultContext();
    const mockClient = { query: vi.fn() };
    const ctx = createTestServerContext({ client: mockClient as never });

    await setupCoreServer({ context: ctx });

    expect(ctx.getClient()).toBe(mockClient);
  });

  it('await using disposes only the bound context; another instance can still setup', async () => {
    isolateFromDefaultContext();
    const ctxA = createTestServerContext({
      config: resolveTestConfig({ apiKey: 'await-using-a' }),
    });
    {
      await using _handle = await setupCoreServer({ context: ctxA });
      expect(ctxA.disposed).toBe(false);
    }
    expect(ctxA.disposed).toBe(true);

    const ctxB = createTestServerContext({
      config: resolveTestConfig({ apiKey: 'await-using-b' }),
    });
    await expect(setupCoreServer({ context: ctxB })).resolves.toBeDefined();
    expect(ctxB.disposed).toBe(false);
  });
});
