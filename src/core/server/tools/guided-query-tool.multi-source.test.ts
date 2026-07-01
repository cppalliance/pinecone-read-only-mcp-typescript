import { describe, expect, it, vi } from 'vitest';
import { guidedQueryResponseSchema } from '../response-schemas.js';
import { registerGuidedQueryTool } from './guided-query-tool.js';
import {
  assertToolErrorCode,
  createMockServer,
  createMultiSourceTestContext,
  expectMatchesResponseSchema,
  makeHybridQueryResult,
  makeMockPineconeClient,
  parseToolJson,
} from './test-helpers.js';

describe('guided_query tool (multi-source)', () => {
  it('sets selected_source in decision_trace when namespace is auto-routed', async () => {
    const query = vi.fn().mockResolvedValue(makeHybridQueryResult());
    const client1 = makeMockPineconeClient(['papers'], { query });
    const client2 = makeMockPineconeClient(['internal']);
    const clients = new Map([
      ['api_key_1', client1],
      ['api_key_2', client2],
    ]);
    const { ctx } = createMultiSourceTestContext({
      namespacesBySource: { api_key_1: ['papers'], api_key_2: ['internal'] },
      clients,
    });

    const server = createMockServer();
    registerGuidedQueryTool(server as never, ctx);
    const body = parseToolJson(
      await server.getHandler('guided_query')!({
        user_query: 'What do papers say about contracts?',
        preferred_tool: 'fast',
        enrich_urls: false,
      })
    );
    expectMatchesResponseSchema(guidedQueryResponseSchema, body);
    const trace = (body['experimental'] as Record<string, unknown>)['decision_trace'] as Record<
      string,
      unknown
    >;
    expect(trace['selected_source']).toBe('api_key_1');
    expect(trace['selected_namespace']).toBe('papers');
    expect(query).toHaveBeenCalledOnce();
  });

  it('returns VALIDATION on namespace when namespace is missing on all sources', async () => {
    const { ctx } = createMultiSourceTestContext();
    const server = createMockServer();
    registerGuidedQueryTool(server as never, ctx);
    const err = assertToolErrorCode(
      await server.getHandler('guided_query')!({
        user_query: 'contracts',
        namespace: 'missing-ns',
        preferred_tool: 'fast',
        enrich_urls: false,
      }),
      'VALIDATION'
    );
    expect(err.field).toBe('namespace');
  });

  it('returns VALIDATION on namespace when namespace exists on multiple sources', async () => {
    const { ctx } = createMultiSourceTestContext();
    const server = createMockServer();
    registerGuidedQueryTool(server as never, ctx);
    const err = assertToolErrorCode(
      await server.getHandler('guided_query')!({
        user_query: 'contracts',
        namespace: 'shared',
        preferred_tool: 'fast',
        enrich_urls: false,
      }),
      'VALIDATION'
    );
    expect(err.field).toBe('namespace');
    expect(err.message).toMatch(/multiple sources/i);
  });
});
