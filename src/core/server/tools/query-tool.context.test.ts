import { describe, expect, it, vi } from 'vitest';
import { registerQueryTool } from './query-tool.js';
import {
  assertToolErrorCode,
  createMockServer,
  createTestServerContext,
  makeHybridQueryResult,
  parseToolJson,
} from './test-helpers.js';

describe('query tool handler (ServerContext instance path)', () => {
  it('returns success when flow is satisfied on injected context', async () => {
    const query = vi.fn().mockResolvedValue(makeHybridQueryResult());
    const ctx = createTestServerContext({
      client: { query } as never,
    });
    ctx.markSuggested('wg21', {
      recommended_tool: 'fast',
      suggested_fields: ['title'],
      user_query: 'contracts',
    });

    const server = createMockServer();
    registerQueryTool(server as never, ctx);
    const raw = await server.getHandler('query')!({
      query_text: 'contracts',
      namespace: 'wg21',
      preset: 'fast',
    });
    const body = parseToolJson(raw);
    expect(body).toMatchObject({
      status: 'success',
      mode: 'query_fast',
      namespace: 'wg21',
      result_count: 1,
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it('returns FLOW_GATE when injected context has no suggest-flow state', async () => {
    const ctx = createTestServerContext({
      client: { query: vi.fn() } as never,
    });
    const server = createMockServer();
    registerQueryTool(server as never, ctx);
    const raw = await server.getHandler('query')!({
      query_text: 'contracts',
      namespace: 'wg21',
      preset: 'fast',
    });
    const err = assertToolErrorCode(raw, 'FLOW_GATE');
    expect(err.suggestion).toBe("Call suggest_query_params for namespace 'wg21' first");
  });
});
