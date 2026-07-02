import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveConfig } from '../../config.js';
import { getPineconeClient } from '../client-context.js';
import { resetServerConfig, setServerConfig } from '../config-context.js';
import * as suggestionFlow from '../suggestion-flow.js';
import { registerCountTool } from './count-tool.js';
import { assertToolErrorCode, createMockServer, parseToolJson } from './test-helpers.js';

vi.mock('../client-context.js', () => ({
  getPineconeClient: vi.fn(),
}));

const mockedGetClient = vi.mocked(getPineconeClient);

describe('count tool handler', () => {
  const flowOk = {
    ok: true as const,
    flow: {
      updatedAt: Date.now(),
      recommended_tool: 'count' as const,
      suggested_fields: [],
      user_query: 'q',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(suggestionFlow, 'requireSuggested').mockReturnValue(flowOk);
    mockedGetClient.mockReturnValue({
      count: vi.fn().mockResolvedValue({ count: 3, truncated: false }),
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns VALIDATION when namespace is whitespace-only', async () => {
    const server = createMockServer();
    registerCountTool(server as never);
    const raw = await server.getHandler('count')!({
      namespace: '  ',
      query_text: 'doc',
    });
    const err = assertToolErrorCode(raw, 'VALIDATION');
    expect(err.field).toBe('namespace');
  });

  it('returns VALIDATION when source is provided without ServerContext', async () => {
    const server = createMockServer();
    registerCountTool(server as never);
    const err = assertToolErrorCode(
      await server.getHandler('count')!({
        namespace: 'wg21',
        query_text: 'doc',
        source: 'api_key_1',
      }),
      'VALIDATION'
    );
    expect(err.field).toBe('source');
    expect(mockedGetClient().count).not.toHaveBeenCalled();
  });

  it('returns VALIDATION when query_text is empty', async () => {
    const server = createMockServer();
    registerCountTool(server as never);
    const raw = await server.getHandler('count')!({
      namespace: 'wg21',
      query_text: '   ',
    });
    const err = assertToolErrorCode(raw, 'VALIDATION');
    expect(err.field).toBe('query_text');
    expect(mockedGetClient().count).not.toHaveBeenCalled();
  });

  it('returns VALIDATION when metadata_filter is invalid', async () => {
    const server = createMockServer();
    registerCountTool(server as never);
    const raw = await server.getHandler('count')!({
      namespace: 'wg21',
      query_text: 'doc',
      metadata_filter: { year: { $unknown: 1 } },
    });
    const err = assertToolErrorCode(raw, 'VALIDATION');
    expect(err.field).toBe('year.$unknown');
  });

  it('returns FLOW_GATE when suggestion flow is not satisfied', async () => {
    vi.spyOn(suggestionFlow, 'requireSuggested').mockReturnValue({
      ok: false,
      message: 'Call suggest_query_params first.',
    });
    const server = createMockServer();
    registerCountTool(server as never);
    const raw = await server.getHandler('count')!({
      namespace: 'wg21',
      query_text: 'x',
    });
    const err = assertToolErrorCode(raw, 'FLOW_GATE');
    expect(err.suggestion).toBe("Call suggest_query_params for namespace 'wg21' first");
  });

  it('returns PINECONE_ERROR when client.count throws', async () => {
    mockedGetClient.mockReturnValue({
      count: vi.fn().mockRejectedValue(new Error('pinecone down')),
    } as never);
    const server = createMockServer();
    registerCountTool(server as never);
    const raw = await server.getHandler('count')!({
      namespace: 'wg21',
      query_text: 'x',
    });
    expect(assertToolErrorCode(raw, 'PINECONE_ERROR').code).toBe('PINECONE_ERROR');
  });
});

describe('count tool with core resolveConfig default (gate off)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetServerConfig();
  });

  it('does not return FLOW_GATE without prior suggest_query_params', async () => {
    setServerConfig(resolveConfig({ apiKey: 'sk-test', indexName: 'my-index' }));
    expect(resolveConfig({ apiKey: 'sk-test', indexName: 'my-index' }).disableSuggestFlow).toBe(
      true
    );

    mockedGetClient.mockReturnValue({
      count: vi.fn().mockResolvedValue({ count: 2, truncated: false }),
    } as never);

    const server = createMockServer();
    registerCountTool(server as never);
    const raw = await server.getHandler('count')!({
      namespace: 'wg21',
      query_text: 'how many',
    });

    const envelope = raw as { isError?: boolean };
    expect(envelope.isError).not.toBe(true);
    const body = parseToolJson(raw);
    expect(body['status']).toBe('success');
    expect(mockedGetClient().count).toHaveBeenCalled();
  });
});
