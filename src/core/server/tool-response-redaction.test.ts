import { afterEach, describe, expect, it } from 'vitest';
import { redactApiKey, setLogLevel } from '../../logger.js';
import { classifyToolCatchError } from './tool-error.js';
import { jsonErrorResponse, jsonResponse } from './tool-response.js';
import { assertToolError, parseToolJson } from './tools/test-helpers.js';

describe('MCP response redaction', () => {
  const apiKey = 'pcsk_response_secret_1234567890abcdef';

  afterEach(() => {
    setLogLevel('INFO');
  });

  it('redacts pcsk_ Pinecone API key strings directly', () => {
    expect(redactApiKey(`connection failed for ${apiKey}`)).toBe('connection failed for ***');
  });

  it('redacts tool error message and suggestion fields before returning MCP content', () => {
    const raw = jsonErrorResponse({
      code: 'PINECONE_ERROR',
      message: `Pinecone SDK error for ${apiKey}`,
      recoverable: false,
      suggestion: `Rotate ${apiKey}`,
    });
    const err = assertToolError(raw);

    expect(JSON.stringify(raw)).not.toContain(apiKey);
    expect(err.message).toBe('Pinecone SDK error for ***');
    expect(err.suggestion).toBe('Rotate ***');
  });

  it('redacts catch-all DEBUG error messages before returning MCP content', () => {
    setLogLevel('DEBUG');
    const raw = jsonErrorResponse(
      classifyToolCatchError(new Error(`Pinecone connection string ${apiKey}`), 'fallback')
    );
    const err = assertToolError(raw);

    expect(JSON.stringify(raw)).not.toContain(apiKey);
    expect(err.message).toBe('Pinecone connection string ***');
  });

  it('redacts nested success payload metadata before returning MCP content arrays', () => {
    const body = parseToolJson(
      jsonResponse({
        status: 'success',
        degradation_reason: `rerank_failed: ${apiKey}`,
        decision_trace: {
          note: `Authorization: Bearer ${apiKey}`,
        },
        diagnostic_metadata: {
          nested: [`api_key=${apiKey}`],
        },
      })
    );

    expect(JSON.stringify(body)).not.toContain(apiKey);
    expect(body.degradation_reason).toBe('rerank_failed: ***');
    expect(JSON.stringify(body)).toContain('***');
  });
});
