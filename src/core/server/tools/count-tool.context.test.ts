import { describe, expect, it, vi } from 'vitest';
import { registerCountTool } from './count-tool.js';
import {
  assertToolErrorCode,
  createMockServer,
  createTestServerContext,
  parseToolJson,
} from './test-helpers.js';

describe('count tool handler (ServerContext instance path)', () => {
  it('returns success when flow is satisfied on injected context', async () => {
    const count = vi.fn().mockResolvedValue({ count: 7, truncated: true });
    const ctx = createTestServerContext({
      client: { count } as never,
    });
    ctx.markSuggested('wg21', {
      recommended_tool: 'count',
      suggested_fields: [],
      user_query: 'how many',
    });

    const server = createMockServer();
    registerCountTool(server as never, ctx);
    const raw = await server.getHandler('count')!({
      namespace: 'wg21',
      query_text: 'papers',
    });
    const body = parseToolJson(raw);
    expect(body).toMatchObject({
      status: 'success',
      count: 7,
      truncated: true,
      namespace: 'wg21',
    });
    expect(count).toHaveBeenCalledOnce();
  });

  it('returns FLOW_GATE when injected context has no suggest-flow state', async () => {
    const ctx = createTestServerContext({
      client: { count: vi.fn() } as never,
    });
    const server = createMockServer();
    registerCountTool(server as never, ctx);
    const raw = await server.getHandler('count')!({
      namespace: 'wg21',
      query_text: 'papers',
    });
    const err = assertToolErrorCode(raw, 'FLOW_GATE');
    expect(err.suggestion).toBe("Call suggest_query_params for namespace 'wg21' first");
  });
});
