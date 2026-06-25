import { describe, expect, it, vi } from 'vitest';
import { registerQueryTool } from './query-tool.js';
import { querySuccessResponseSchema } from '../response-schemas.js';
import {
  assertToolErrorCode,
  createMockServer,
  createTestServerContext,
  expectMatchesResponseSchema,
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
    expectMatchesResponseSchema(querySuccessResponseSchema, body);
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

  it('succeeds without prior suggest when disableSuggestFlow is true', async () => {
    const query = vi.fn().mockResolvedValue(makeHybridQueryResult());
    const ctx = createTestServerContext({
      config: { disableSuggestFlow: true },
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
    expect(body['status']).toBe('success');
    expect(query).toHaveBeenCalledOnce();
  });

  it('forwards rerank_skipped_reason and degradation_reason on injected context', async () => {
    const query = vi.fn().mockResolvedValue(
      makeHybridQueryResult({
        rerank_skipped_reason: 'no_model',
        degradation_reason: 'rerank_skipped_no_model: set PINECONE_RERANK_MODEL',
      })
    );
    const ctx = createTestServerContext({
      client: { query } as never,
    });
    ctx.markSuggested('wg21', {
      recommended_tool: 'detailed',
      suggested_fields: ['chunk_text'],
      user_query: 'q',
    });
    const server = createMockServer();
    registerQueryTool(server as never, ctx);
    const body = parseToolJson(
      await server.getHandler('query')!({
        query_text: 'hello',
        namespace: 'wg21',
        preset: 'detailed',
      })
    );
    const experimental = body['experimental'] as Record<string, unknown>;
    expect(experimental['rerank_skipped_reason']).toBe('no_model');
    expect(experimental['degradation_reason']).toMatch(/rerank_skipped_no_model/);
  });

  it('forwards hybrid_leg_failed for dense and sparse partial hybrid', async () => {
    const query = vi.fn();
    const ctx = createTestServerContext({
      client: { query } as never,
    });
    ctx.markSuggested('wg21', {
      recommended_tool: 'fast',
      suggested_fields: ['title'],
      user_query: 'q',
    });
    const server = createMockServer();
    registerQueryTool(server as never, ctx);
    const handler = server.getHandler('query')!;

    query.mockResolvedValue(makeHybridQueryResult({ hybrid_leg_failed: 'dense', degraded: false }));
    const denseBody = parseToolJson(
      await handler({ query_text: 'a', namespace: 'wg21', preset: 'fast' })
    );
    expect((denseBody['experimental'] as Record<string, unknown>)['hybrid_leg_failed']).toBe(
      'dense'
    );

    query.mockResolvedValue(
      makeHybridQueryResult({ hybrid_leg_failed: 'sparse', degraded: false })
    );
    const sparseBody = parseToolJson(
      await handler({ query_text: 'b', namespace: 'wg21', preset: 'fast' })
    );
    expect((sparseBody['experimental'] as Record<string, unknown>)['hybrid_leg_failed']).toBe(
      'sparse'
    );
  });

  it('returns TIMEOUT when client throws timeout error', async () => {
    const query = vi
      .fn()
      .mockRejectedValue(new Error('Timeout after 5000ms while waiting for query'));
    const ctx = createTestServerContext({
      client: { query } as never,
    });
    ctx.markSuggested('wg21', {
      recommended_tool: 'fast',
      suggested_fields: ['title'],
      user_query: 'q',
    });
    const server = createMockServer();
    registerQueryTool(server as never, ctx);
    const err = assertToolErrorCode(
      await server.getHandler('query')!({
        query_text: 'hello',
        namespace: 'wg21',
        preset: 'fast',
      }),
      'TIMEOUT'
    );
    expect(err.suggestion).toMatch(/retry|timeout/i);
  });
});
