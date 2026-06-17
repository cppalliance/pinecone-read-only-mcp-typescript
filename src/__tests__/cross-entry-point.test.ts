import { afterEach, describe, expect, it, vi } from 'vitest';
import { setupAllianceServer } from '../alliance/setup.js';
import { resolveAllianceConfig } from '../alliance/config.js';
import { setPineconeClient } from '../core/index.js';
import { resolveConfig } from '../core/config.js';
import { getDefaultServerContext } from '../core/server/server-context.js';
import * as guidedQueryTool from '../core/server/tools/guided-query-tool.js';
import { registerQueryTool } from '../core/server/tools/query-tool.js';
import {
  assertToolErrorCode,
  createMockServer,
  createTestServerContext,
  makeHybridQueryResult,
  parseToolJson,
} from '../core/server/tools/test-helpers.js';
import { setupCoreServer, teardownServer } from '../core/setup.js';
import { PineconeClient } from '../core/pinecone-client.js';

describe('cross-entry-point: core vs Alliance defaults', () => {
  afterEach(() => {
    teardownServer();
  });

  it('core entry point disables suggest-flow gate by default', () => {
    const cfg = resolveConfig(
      { apiKey: 'sk-test', indexName: 'my-index' },
      { PINECONE_API_KEY: 'sk-test', PINECONE_INDEX_NAME: 'my-index' }
    );
    expect(cfg.disableSuggestFlow).toBe(true);
  });

  it('Alliance entry point enables suggest-flow gate by default', () => {
    const cfg = resolveAllianceConfig({ apiKey: 'sk-test' }, { PINECONE_API_KEY: 'sk-test' });
    expect(cfg.disableSuggestFlow).toBe(false);
  });

  it('core-initialized server: query succeeds without prior suggest_query_params', async () => {
    const query = vi.fn().mockResolvedValue(makeHybridQueryResult());
    const ctx = createTestServerContext({
      config: {
        disableSuggestFlow: true,
      },
      client: { query } as never,
    });
    const server = createMockServer();
    registerQueryTool(server as never, ctx);
    const body = parseToolJson(
      await server.getHandler('query')!({
        query_text: 'hello',
        namespace: 'wg21',
        preset: 'fast',
      })
    );
    expect(body.status).toBe('success');
    expect(query).toHaveBeenCalledOnce();
  });

  it('Alliance-initialized server: query returns FLOW_GATE without prior suggestion', async () => {
    const cfg = resolveAllianceConfig(
      { apiKey: 'sk-test', indexName: 'my-index' },
      { PINECONE_API_KEY: 'sk-test', PINECONE_INDEX_NAME: 'my-index' }
    );
    const ctx = createTestServerContext({
      config: cfg,
      client: { query: vi.fn() } as never,
    });
    const server = createMockServer();
    registerQueryTool(server as never, ctx);
    const raw = await server.getHandler('query')!({
      query_text: 'hello',
      namespace: 'wg21',
      preset: 'fast',
    });
    const err = assertToolErrorCode(raw, 'FLOW_GATE');
    expect(err.suggestion).toBe("Call suggest_query_params for namespace 'wg21' first");
  });

  it('setupAllianceServer wires Alliance gate defaults: query returns FLOW_GATE', async () => {
    const cfg = resolveAllianceConfig(
      { apiKey: 'sk-test', indexName: 'my-index' },
      { PINECONE_API_KEY: 'sk-test', PINECONE_INDEX_NAME: 'my-index' }
    );
    setPineconeClient(
      new PineconeClient({
        apiKey: cfg.apiKey,
        indexName: cfg.indexName,
        defaultTopK: cfg.defaultTopK,
      })
    );
    await setupAllianceServer({ config: cfg });
    const ctx = getDefaultServerContext();
    expect(ctx.getConfig().disableSuggestFlow).toBe(false);

    const server = createMockServer();
    registerQueryTool(server as never, ctx);
    const raw = await server.getHandler('query')!({
      query_text: 'hello',
      namespace: 'wg21',
      preset: 'fast',
    });
    assertToolErrorCode(raw, 'FLOW_GATE');
  });

  it('core setup registers guided_query handler', async () => {
    const cfg = resolveConfig({ apiKey: 'sk-cross', indexName: 'test-index' });
    const ctx = createTestServerContext({
      config: cfg,
      client: new PineconeClient({
        apiKey: cfg.apiKey,
        indexName: cfg.indexName,
        defaultTopK: cfg.defaultTopK,
      }),
    });
    const registerSpy = vi.spyOn(guidedQueryTool, 'registerGuidedQueryTool');

    await setupCoreServer({ context: ctx });

    expect(registerSpy).toHaveBeenCalledOnce();
    expect(ctx.hasToolsRegistered()).toBe(true);
    registerSpy.mockRestore();
  });
});
