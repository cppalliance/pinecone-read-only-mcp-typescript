import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPineconeClient } from './client-context.js';
import { getNamespacesWithCache } from './namespaces-cache.js';
import { registerGuidedQueryTool } from './tools/guided-query-tool.js';
import { setLogLevel } from '../../logger.js';
import { redactApiKey, redactSensitiveFields } from '../../logger.js';
import { classifyToolCatchError, pineconeToolError } from './tool-error.js';
import { jsonErrorResponse, jsonResponse } from './tool-response.js';
import { registerQueryTool } from './tools/query-tool.js';
import * as suggestionFlow from './suggestion-flow.js';
import {
  assertToolErrorCode,
  createMockServer,
  makeHybridQueryResult,
  makeNamespaceCacheEntry,
  makeSearchResult,
  parseToolJson,
} from './tools/test-helpers.js';

vi.mock('./client-context.js', () => ({
  getPineconeClient: vi.fn(),
}));

vi.mock('./namespaces-cache.js', () => ({
  getNamespacesWithCache: vi.fn(),
}));

vi.mock('./suggestion-flow.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./suggestion-flow.js')>();
  return {
    ...actual,
    markSuggested: vi.fn(),
  };
});

const PCSK_KEY = 'pcsk_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const UUID_KEY = '12345678-1234-1234-1234-123456789abc';

const flowOk = {
  ok: true as const,
  flow: {
    updatedAt: Date.now(),
    recommended_tool: 'detailed' as const,
    suggested_fields: ['chunk_text'],
    user_query: 'q',
  },
};

const mockedGetClient = vi.mocked(getPineconeClient);
const mockedGetNamespaces = vi.mocked(getNamespacesWithCache);

describe('redactApiKey', () => {
  it('redacts pcsk_ Pinecone API keys', () => {
    expect(redactApiKey(`auth failed: ${PCSK_KEY}`)).not.toContain(PCSK_KEY);
    expect(redactApiKey(`auth failed: ${PCSK_KEY}`)).toContain('***');
  });

  it('redacts UUID-shaped tokens', () => {
    expect(redactApiKey(`key ${UUID_KEY}`)).not.toContain(UUID_KEY);
  });

  it('redacts api_key assignment patterns', () => {
    expect(redactApiKey('api_key=secret-value-here')).toMatch(/api_key=\*\*\*/i);
  });

  it('redacts Authorization Bearer tokens', () => {
    expect(redactApiKey('Authorization: Bearer my-secret-token')).toMatch(/Bearer \*\*\*/);
  });
});

describe('redactSensitiveFields', () => {
  it('redacts only allowlisted keys and preserves other strings', () => {
    const input = {
      message: `failed ${PCSK_KEY}`,
      results: [{ metadata: { document_id: UUID_KEY } }],
    };
    const out = redactSensitiveFields(input) as typeof input;
    expect(out.message).not.toContain(PCSK_KEY);
    expect(out.results[0].metadata.document_id).toBe(UUID_KEY);
  });
});

describe('MCP response redaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(suggestionFlow, 'requireSuggested').mockReturnValue(flowOk);
    mockedGetClient.mockReturnValue({
      query: vi.fn().mockResolvedValue(makeHybridQueryResult()),
      count: vi.fn(),
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setLogLevel('INFO');
  });

  it('redacts tool error message and suggestion in jsonErrorResponse', () => {
    const err = pineconeToolError(`PINECONE_ERROR with ${PCSK_KEY}`, {
      suggestion: `retry with ${PCSK_KEY}`,
    });
    const text = jsonErrorResponse(err).content[0]!.text;
    expect(text).not.toContain(PCSK_KEY);
    expect(text).toContain('***');
  });

  it('redacts classifyToolCatchError output in DEBUG mode', () => {
    setLogLevel('DEBUG');
    const err = classifyToolCatchError(new Error(`SDK auth failed ${PCSK_KEY}`), 'fallback');
    const text = jsonErrorResponse(err).content[0]!.text;
    expect(text).not.toContain(PCSK_KEY);
  });

  it('redacts degradation_reason in query success responses', async () => {
    mockedGetClient.mockReturnValue({
      query: vi.fn().mockResolvedValue(
        makeHybridQueryResult({
          degraded: true,
          degradation_reason: `rerank_failed: unauthorized ${PCSK_KEY}`,
        })
      ),
      count: vi.fn(),
    } as never);

    const server = createMockServer();
    registerQueryTool(server as never);

    const body = parseToolJson(
      await server.getHandler('query')!({
        query_text: 'hello',
        namespace: 'wg21',
        top_k: 5,
        preset: 'full',
      })
    );

    const experimental = body.experimental as Record<string, unknown>;
    expect(experimental.degradation_reason).not.toContain(PCSK_KEY);
    expect(String(experimental.degradation_reason)).toContain('***');
  });

  it('preserves non-sensitive UUIDs in success payload metadata', async () => {
    mockedGetClient.mockReturnValue({
      query: vi.fn().mockResolvedValue(
        makeHybridQueryResult({
          results: [
            makeSearchResult({
              metadata: { document_id: UUID_KEY, title: 'Paper' },
            }),
          ],
        })
      ),
      count: vi.fn(),
    } as never);

    const server = createMockServer();
    registerQueryTool(server as never);

    const body = parseToolJson(
      await server.getHandler('query')!({
        query_text: 'hello',
        namespace: 'wg21',
        top_k: 5,
        preset: 'full',
      })
    );

    const rows = body.results as Array<{ metadata: { document_id: string } }>;
    expect(rows[0].metadata.document_id).toBe(UUID_KEY);
  });

  it('redacts degradation_reason in guided_query result', async () => {
    const nsEntry = makeNamespaceCacheEntry('papers');
    mockedGetNamespaces.mockResolvedValue({
      data: [nsEntry],
      cache_hit: false,
      expires_at: Date.now() + 1_800_000,
    });
    mockedGetClient.mockReturnValue({
      query: vi.fn().mockResolvedValue(
        makeHybridQueryResult({
          degraded: true,
          degradation_reason: `rerank_failed: auth ${PCSK_KEY}`,
        })
      ),
      count: vi.fn().mockResolvedValue({ count: 1, truncated: false }),
    } as never);

    const server = createMockServer();
    registerGuidedQueryTool(server as never);

    const body = parseToolJson(
      await server.getHandler('guided_query')!({
        user_query: 'What does the paper say about contracts?',
        namespace: 'papers',
        preferred_tool: 'detailed',
      })
    );

    const result = body.result as Record<string, unknown>;
    const resultExperimental = result.experimental as Record<string, unknown>;
    expect(resultExperimental.degradation_reason).not.toContain(PCSK_KEY);
    expect(String(resultExperimental.degradation_reason)).toContain('***');
  });

  it('jsonResponse redacts nested degradation_reason without masking metadata UUIDs', () => {
    const payload = jsonResponse({
      status: 'success',
      experimental: { degradation_reason: `rerank_failed: ${PCSK_KEY}` },
      results: [{ metadata: { document_id: UUID_KEY } }],
    });
    const text = payload.content[0]!.text;
    expect(text).not.toContain(PCSK_KEY);
    expect(text).toContain(UUID_KEY);
  });
});

describe('query tool VALIDATION for malformed metadata_filter (redaction suite cross-check)', () => {
  beforeEach(() => {
    vi.spyOn(suggestionFlow, 'requireSuggested').mockReturnValue(flowOk);
    mockedGetClient.mockReturnValue({
      query: vi.fn(),
      count: vi.fn(),
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns VALIDATION for empty $in', async () => {
    const server = createMockServer();
    registerQueryTool(server as never);
    const raw = await server.getHandler('query')!({
      query_text: 'hello',
      namespace: 'wg21',
      top_k: 5,
      preset: 'full',
      metadata_filter: { tags: { $in: [] } },
    });
    const err = assertToolErrorCode(raw, 'VALIDATION');
    expect(err.field).toBe('tags.$in');
  });
});
