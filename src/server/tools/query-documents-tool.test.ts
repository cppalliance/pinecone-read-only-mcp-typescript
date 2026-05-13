import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_QUERY_DOCUMENTS_TOP_K, QUERY_DOCUMENTS_MAX_CHUNKS } from '../../constants.js';
import { getPineconeClient } from '../client-context.js';
import { reassembleByDocument } from '../reassemble-documents.js';
import * as suggestionFlow from '../suggestion-flow.js';
import { registerQueryDocumentsTool } from './query-documents-tool.js';
import { createMockServer, makeSearchResult, parseToolJson } from './test-helpers.js';

vi.mock('../client-context.js', () => ({
  getPineconeClient: vi.fn(),
}));

vi.mock('../reassemble-documents.js', () => ({
  reassembleByDocument: vi.fn(),
}));

const mockedGetClient = vi.mocked(getPineconeClient);
const mockedReassemble = vi.mocked(reassembleByDocument);

describe('query_documents tool handler', () => {
  const flowOk = {
    ok: true as const,
    flow: {
      updatedAt: Date.now(),
      recommended_tool: 'query_detailed' as const,
      suggested_fields: [],
      user_query: 'q',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(suggestionFlow, 'requireSuggested').mockReturnValue(flowOk);
    mockedReassemble.mockReturnValue([
      {
        document_id: 'D1',
        merged_content: 'full doc text',
        metadata: { document_number: 'D1' },
        chunk_count: 3,
        best_score: 0.99,
      },
    ]);
    mockedGetClient.mockReturnValue({
      query: vi.fn().mockResolvedValue([makeSearchResult()]),
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('happy path: queries chunks, reassembles, and returns documents', async () => {
    const server = createMockServer();
    registerQueryDocumentsTool(server as never);
    const query = mockedGetClient().query as ReturnType<typeof vi.fn>;

    const body = parseToolJson(
      await server.getHandler('query_documents')!({
        query_text: 'semantic question',
        namespace: 'wg21',
        top_k: DEFAULT_QUERY_DOCUMENTS_TOP_K,
      })
    );

    const expectedTopK = Math.min(QUERY_DOCUMENTS_MAX_CHUNKS, DEFAULT_QUERY_DOCUMENTS_TOP_K * 50);
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'semantic question',
        namespace: 'wg21',
        topK: expectedTopK,
        useReranking: true,
        fields: undefined,
      })
    );
    expect(mockedReassemble).toHaveBeenCalled();
    expect(body.status).toBe('success');
    const docs = body.documents as Array<{ merged_content: string }>;
    expect(docs[0].merged_content).toBe('full doc text');
  });

  it('returns error when query_text is empty', async () => {
    const server = createMockServer();
    registerQueryDocumentsTool(server as never);
    const query = mockedGetClient().query as ReturnType<typeof vi.fn>;

    const raw = await server.getHandler('query_documents')!({
      query_text: '',
      namespace: 'wg21',
    });

    expect((raw as { isError?: boolean }).isError).toBe(true);
    expect(query).not.toHaveBeenCalled();
    expect(parseToolJson(raw).message).toBe('query_text cannot be empty');
  });

  it('returns flow error when suggest_query_params gate fails', async () => {
    vi.spyOn(suggestionFlow, 'requireSuggested').mockReturnValue({
      ok: false,
      message:
        'Flow requires suggest_query_params first. Call suggest_query_params with namespace and user_query before query/count tools.',
    });

    const server = createMockServer();
    registerQueryDocumentsTool(server as never);
    const query = mockedGetClient().query as ReturnType<typeof vi.fn>;

    const body = parseToolJson(
      await server.getHandler('query_documents')!({
        query_text: 'ok',
        namespace: 'wg21',
      })
    );

    expect(body.status).toBe('error');
    expect(query).not.toHaveBeenCalled();
  });

  it('returns TTL expiry error from requireSuggested', async () => {
    vi.spyOn(suggestionFlow, 'requireSuggested').mockReturnValue({
      ok: false,
      message:
        'Previous suggest_query_params context expired (30 minutes). Call suggest_query_params again before query/count tools.',
    });

    const server = createMockServer();
    registerQueryDocumentsTool(server as never);

    const body = parseToolJson(
      await server.getHandler('query_documents')!({
        query_text: 'ok',
        namespace: 'wg21',
      })
    );

    expect(body.message).toContain('expired');
  });
});
