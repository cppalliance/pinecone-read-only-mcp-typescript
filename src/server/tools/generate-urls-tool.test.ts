import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as urlGeneration from '../url-generation.js';
import { registerGenerateUrlsTool } from './generate-urls-tool.js';
import { assertToolError, createMockServer } from './test-helpers.js';

describe('generate_urls tool handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns PINECONE_ERROR when generateUrlForNamespace throws', async () => {
    vi.spyOn(urlGeneration, 'generateUrlForNamespace').mockImplementation(() => {
      throw new Error('generator boom');
    });
    const server = createMockServer();
    registerGenerateUrlsTool(server as never);
    const raw = await server.getHandler('generate_urls')!({
      namespace: 'mailing',
      records: [{ document_number: 'P1234' }],
    });
    expect(assertToolError(raw).code).toBe('PINECONE_ERROR');
  });
});
