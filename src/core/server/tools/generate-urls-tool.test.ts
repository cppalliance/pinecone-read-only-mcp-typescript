import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as urlRegistry from '../url-registry.js';
import { registerGenerateUrlsTool } from './generate-urls-tool.js';
import { assertToolErrorCode, createMockServer } from './test-helpers.js';

describe('generate_urls tool handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns VALIDATION when namespace is whitespace-only', async () => {
    const server = createMockServer();
    registerGenerateUrlsTool(server as never);
    const raw = await server.getHandler('generate_urls')!({
      namespace: '  ',
      records: [{ document_number: 'P1234' }],
    });
    const err = assertToolErrorCode(raw, 'VALIDATION');
    expect(err.field).toBe('namespace');
  });

  it('returns PINECONE_ERROR when generateUrlForNamespace throws', async () => {
    vi.spyOn(urlRegistry, 'generateUrlForNamespace').mockImplementation(() => {
      throw new Error('generator boom');
    });
    const server = createMockServer();
    registerGenerateUrlsTool(server as never);
    const raw = await server.getHandler('generate_urls')!({
      namespace: 'mailing',
      records: [{ document_number: 'P1234' }],
    });
    expect(assertToolErrorCode(raw, 'PINECONE_ERROR').code).toBe('PINECONE_ERROR');
  });
});
