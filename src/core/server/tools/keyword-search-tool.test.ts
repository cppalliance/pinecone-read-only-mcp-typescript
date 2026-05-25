import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPineconeClient } from '../client-context.js';
import { registerKeywordSearchTool } from './keyword-search-tool.js';
import { assertToolErrorCode, createMockServer, makeSearchResult } from './test-helpers.js';

vi.mock('../client-context.js', () => ({
  getPineconeClient: vi.fn(),
}));

const mockedGetClient = vi.mocked(getPineconeClient);

describe('keyword_search tool handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetClient.mockReturnValue({
      keywordSearch: vi.fn().mockResolvedValue([makeSearchResult()]),
      getSparseIndexName: () => 'test-index-sparse',
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns VALIDATION when query_text is empty', async () => {
    const server = createMockServer();
    registerKeywordSearchTool(server as never);
    const raw = await server.getHandler('keyword_search')!({
      query_text: '  ',
      namespace: 'ns',
      top_k: 5,
    });
    const err = assertToolErrorCode(raw, 'VALIDATION');
    expect(err.field).toBe('query_text');
  });

  it('returns VALIDATION when namespace is empty', async () => {
    const server = createMockServer();
    registerKeywordSearchTool(server as never);
    const raw = await server.getHandler('keyword_search')!({
      query_text: 'hello',
      namespace: '   ',
      top_k: 5,
    });
    const err = assertToolErrorCode(raw, 'VALIDATION');
    expect(err.field).toBe('namespace');
  });

  it('returns VALIDATION when metadata_filter is invalid', async () => {
    const server = createMockServer();
    registerKeywordSearchTool(server as never);
    const raw = await server.getHandler('keyword_search')!({
      query_text: 'q',
      namespace: 'ns',
      top_k: 5,
      metadata_filter: { bad: { $nope: true } },
    });
    const err = assertToolErrorCode(raw, 'VALIDATION');
    expect(err.field).toBe('bad.$nope');
  });

  it('happy path returns success', async () => {
    const server = createMockServer();
    registerKeywordSearchTool(server as never);
    const raw = await server.getHandler('keyword_search')!({
      query_text: 'contracts',
      namespace: 'wg21',
      top_k: 3,
    });
    expect((raw as { isError?: boolean }).isError).toBeFalsy();
    const text = (raw as { content: Array<{ text: string }> }).content[0].text;
    const body = JSON.parse(text) as { status: string; result_count?: number };
    expect(body.status).toBe('success');
    expect(body.result_count).toBe(1);
  });

  it('returns PINECONE_ERROR when keywordSearch throws', async () => {
    mockedGetClient.mockReturnValue({
      keywordSearch: vi.fn().mockRejectedValue(new Error('sparse error')),
      getSparseIndexName: () => 'test-index-sparse',
    } as never);
    const server = createMockServer();
    registerKeywordSearchTool(server as never);
    const raw = await server.getHandler('keyword_search')!({
      query_text: 'q',
      namespace: 'ns',
      top_k: 5,
    });
    expect(assertToolErrorCode(raw, 'PINECONE_ERROR').code).toBe('PINECONE_ERROR');
  });
});
