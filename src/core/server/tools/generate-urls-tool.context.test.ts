import { describe, expect, it } from 'vitest';
import { registerGenerateUrlsTool } from './generate-urls-tool.js';
import { generateUrlsResponseSchema } from '../response-schemas.js';
import {
  createMockServer,
  createTestServerContext,
  expectMatchesResponseSchema,
  parseToolJson,
} from './test-helpers.js';

describe('generate_urls tool handler (ServerContext instance path)', () => {
  it('uses URL generator registered on injected context', async () => {
    const ctx = createTestServerContext();
    ctx.registerUrlGenerator('mailing', () => ({
      url: 'https://example.com/doc/P1234',
      method: 'generated.custom',
    }));

    const server = createMockServer();
    registerGenerateUrlsTool(server as never, ctx);
    const raw = await server.getHandler('generate_urls')!({
      namespace: 'mailing',
      records: [{ document_number: 'P1234' }],
    });
    const body = parseToolJson(raw);
    expectMatchesResponseSchema(generateUrlsResponseSchema, body);
    expect(body).toMatchObject({
      status: 'success',
      namespace: 'mailing',
      count: 1,
    });
    const results = body['results'] as Array<{ url: string; method: string }>;
    expect(results[0]).toMatchObject({
      url: 'https://example.com/doc/P1234',
      method: 'generated.custom',
    });
  });
});
