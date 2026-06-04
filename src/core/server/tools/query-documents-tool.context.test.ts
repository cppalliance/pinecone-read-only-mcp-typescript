import { describe, expect, it, vi } from 'vitest';
import { registerQueryDocumentsTool } from './query-documents-tool.js';
import {
  assertToolErrorCode,
  createMockServer,
  createTestServerContext,
  makeHybridQueryResult,
  parseToolJson,
} from './test-helpers.js';

describe('query_documents tool handler (ServerContext instance path)', () => {
  it('returns success when flow is satisfied on injected context', async () => {
    const query = vi.fn().mockResolvedValue(makeHybridQueryResult());
    const ctx = createTestServerContext({
      client: { query } as never,
    });
    ctx.markSuggested('wg21', {
      recommended_tool: 'detailed',
      suggested_fields: [],
      user_query: 'semantic question',
    });

    const server = createMockServer();
    registerQueryDocumentsTool(server as never, ctx);
    const raw = await server.getHandler('query_documents')!({
      query_text: 'semantic question',
      namespace: 'wg21',
    });
    const body = parseToolJson(raw);
    expect(body).toMatchObject({
      status: 'success',
      namespace: 'wg21',
      query: 'semantic question',
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it('returns FLOW_GATE when injected context has no suggest-flow state', async () => {
    const ctx = createTestServerContext({
      client: { query: vi.fn() } as never,
    });
    const server = createMockServer();
    registerQueryDocumentsTool(server as never, ctx);
    const raw = await server.getHandler('query_documents')!({
      query_text: 'semantic question',
      namespace: 'wg21',
    });
    const err = assertToolErrorCode(raw, 'FLOW_GATE');
    expect(err.suggestion).toBe("Call suggest_query_params for namespace 'wg21' first");
  });
});
