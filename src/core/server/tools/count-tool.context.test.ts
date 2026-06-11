import { describe, expect, it, vi } from 'vitest';
import { registerCountTool } from './count-tool.js';
import { countResponseSchema } from '../response-schemas.js';
import {
  assertToolErrorCode,
  createMockServer,
  createTestServerContext,
  expectMatchesResponseSchema,
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
    expectMatchesResponseSchema(countResponseSchema, body);
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

  it('succeeds without prior suggest when disableSuggestFlow is true', async () => {
    const count = vi.fn().mockResolvedValue({ count: 2, truncated: false });
    const ctx = createTestServerContext({
      config: { disableSuggestFlow: true },
      client: { count } as never,
    });
    const server = createMockServer();
    registerCountTool(server as never, ctx);
    const body = parseToolJson(
      await server.getHandler('count')!({
        namespace: 'wg21',
        query_text: 'how many',
      })
    );
    expect(body['status']).toBe('success');
    expect(count).toHaveBeenCalledOnce();
  });
});
