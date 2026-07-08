import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBuiltinUrlGenerators } from '../url-builtins.js';
import { registerGuidedQueryTool } from './guided-query-tool.js';
import {
  createMockServer,
  createTestServerContext,
  isolateFromDefaultContext,
  makeHybridQueryResult,
  makeSearchResult,
  mockNamespacesWithMetadataResult,
  parseToolJson,
} from '../../core/server/tools/test-helpers.js';
import {
  getDefaultServerContext,
  teardownDefaultServerContext,
} from '../../core/server/server-context.js';

const MAILING_DOC_ID = 'boost-announce@lists.boost.org/message/O5VYCDZADVDHK5Z5LAYJBHMDOAFQL7P6';
const EXPECTED_MAILING_URL = `https://lists.boost.org/archives/list/${MAILING_DOC_ID}/`;

describe('isolated ServerContext with zero default context', () => {
  beforeEach(() => {
    isolateFromDefaultContext();
  });

  afterEach(() => {
    teardownDefaultServerContext();
  });

  it('guided_query enrich_urls uses ctx builtins, not default registry', async () => {
    const listNamespacesWithMetadata = vi.fn().mockResolvedValue(
      mockNamespacesWithMetadataResult([
        {
          namespace: 'mailing',
          recordCount: 42,
          metadata: {
            document_number: 'string',
            title: 'string',
            author: 'string',
            chunk_text: 'string',
          },
        },
      ])
    );
    const query = vi.fn().mockResolvedValue(
      makeHybridQueryResult({
        results: [
          makeSearchResult({
            metadata: {
              document_number: 'MSG-1',
              title: 'T',
              author: 'A',
              doc_id: MAILING_DOC_ID,
            },
          }),
        ],
      })
    );
    const ctx = createTestServerContext({
      client: {
        listNamespacesWithMetadata,
        query,
        count: vi.fn(),
      } as never,
    });
    registerBuiltinUrlGenerators(ctx);

    const server = createMockServer();
    registerGuidedQueryTool(server as never, ctx);
    const raw = await server.getHandler('guided_query')!({
      user_query: 'What was announced?',
      namespace: 'mailing',
      preferred_tool: 'fast',
      enrich_urls: true,
    });
    const body = parseToolJson(raw);
    const result = body['result'] as Record<string, unknown>;
    const rows = result['results'] as Array<{ url: string }>;
    expect(rows[0]?.url).toBe(EXPECTED_MAILING_URL);
    expect(getDefaultServerContext().hasUrlGenerator('mailing')).toBe(false);
  });
});
