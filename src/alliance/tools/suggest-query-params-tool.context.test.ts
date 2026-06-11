import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerQueryTool } from '../../core/server/tools/query-tool.js';
import { registerSuggestQueryParamsTool } from './suggest-query-params-tool.js';
import { suggestQueryParamsResponseSchema } from '../../core/server/response-schemas.js';
import {
  createMockServer,
  createTestServerContext,
  expectMatchesResponseSchema,
  makeHybridQueryResult,
  parseToolJson,
} from '../../core/server/tools/test-helpers.js';

const namespaceMetadata = {
  document_number: 'string',
  title: 'string',
  url: 'string',
  author: 'string',
  chunk_text: 'string',
};

function mockNamespacesClient() {
  return {
    listNamespacesWithMetadata: vi
      .fn()
      .mockResolvedValue([{ namespace: 'wg21', recordCount: 42, metadata: namespaceMetadata }]),
  };
}

describe('suggest_query_params tool handler (ServerContext instance path)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks suggest-flow on injected context when namespace exists', async () => {
    const listNamespacesWithMetadata = vi.fn().mockResolvedValue([
      {
        namespace: 'wg21',
        recordCount: 42,
        metadata: {
          document_number: 'string',
          title: 'string',
          url: 'string',
          author: 'string',
          chunk_text: 'string',
        },
      },
    ]);
    const ctx = createTestServerContext({
      client: { listNamespacesWithMetadata } as never,
    });

    const server = createMockServer();
    registerSuggestQueryParamsTool(server as never, ctx);
    const raw = await server.getHandler('suggest_query_params')!({
      namespace: 'wg21',
      user_query: 'List papers with titles',
    });
    const body = parseToolJson(raw);
    expectMatchesResponseSchema(suggestQueryParamsResponseSchema, body);
    expect(body).toMatchObject({
      status: 'success',
      namespace_found: true,
      cache_hit: false,
    });

    const flowCheck = ctx.requireSuggested('wg21');
    expect(flowCheck.ok).toBe(true);
  });

  it('updates suggestion state when called twice for the same namespace', async () => {
    const ctx = createTestServerContext({
      client: mockNamespacesClient() as never,
    });
    const server = createMockServer();
    registerSuggestQueryParamsTool(server as never, ctx);
    const handler = server.getHandler('suggest_query_params')!;

    await handler({ namespace: 'wg21', user_query: 'List papers with titles' });
    await handler({ namespace: 'wg21', user_query: 'how many records match?' });

    const flowCheck = ctx.requireSuggested('wg21');
    expect(flowCheck.ok).toBe(true);
    if (flowCheck.ok) {
      expect(flowCheck.flow.user_query).toBe('how many records match?');
      expect(flowCheck.flow.recommended_tool).toBe('count');
    }
  });

  it('re-suggest after expiry allows query without FLOW_GATE', async () => {
    vi.useFakeTimers();
    const query = vi.fn().mockResolvedValue(makeHybridQueryResult());
    const ctx = createTestServerContext({
      config: { cacheTtlSeconds: 1 },
      client: { ...mockNamespacesClient(), query } as never,
    });
    const suggestServer = createMockServer();
    registerSuggestQueryParamsTool(suggestServer as never, ctx);
    const suggestHandler = suggestServer.getHandler('suggest_query_params')!;

    await suggestHandler({ namespace: 'wg21', user_query: 'contracts' });
    vi.advanceTimersByTime(2000);

    const reSuggestBody = parseToolJson(
      await suggestHandler({ namespace: 'wg21', user_query: 'contracts again' })
    );
    expect(reSuggestBody['status']).toBe('success');

    const queryServer = createMockServer();
    registerQueryTool(queryServer as never, ctx);
    const queryBody = parseToolJson(
      await queryServer.getHandler('query')!({
        query_text: 'contracts again',
        namespace: 'wg21',
        preset: 'fast',
      })
    );
    expect(queryBody['status']).toBe('success');
    expect(query).toHaveBeenCalledOnce();
  });
});
