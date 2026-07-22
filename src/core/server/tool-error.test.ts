import { describe, expect, it } from 'vitest';
import {
  classifyToolCatchError,
  DEFAULT_TIMEOUT_SUGGESTION,
  flowGateToolError,
  lifecycleToolError,
  timeoutToolError,
  toolErrorSchema,
  validationToolError,
} from './tool-error.js';

describe('ToolError schema and builders', () => {
  it('FLOW_GATE: includes required suggestion template', () => {
    const err = flowGateToolError('wg21', 'Flow requires suggest_query_params first.');
    const parsed = toolErrorSchema.parse(err);
    expect(parsed.code).toBe('FLOW_GATE');
    expect(parsed.recoverable).toBe(true);
    expect(parsed.suggestion).toBe("Call suggest_query_params for namespace 'wg21' first");
    expect(parsed.message).toContain('Flow requires');
  });

  it('VALIDATION: requires field and parses', () => {
    const err = validationToolError('Unknown filter operator', 'author.$badop');
    const parsed = toolErrorSchema.parse(err);
    expect(parsed.code).toBe('VALIDATION');
    expect(parsed.field).toBe('author.$badop');
    expect(parsed.recoverable).toBe(true);
  });

  it('VALIDATION: schema rejects payload missing field', () => {
    const bad = { code: 'VALIDATION' as const, message: 'x', recoverable: true as const };
    const result = toolErrorSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('PINECONE_ERROR: classifyToolCatchError maps generic Error', () => {
    const err = classifyToolCatchError(new Error('SDK boom'), 'fallback');
    expect(err.code).toBe('PINECONE_ERROR');
    expect(err.recoverable).toBe(false);
    expect(toolErrorSchema.parse(err).code).toBe('PINECONE_ERROR');
  });

  it('LIFECYCLE: not recoverable and parses', () => {
    const err = lifecycleToolError('ServerContext has been disposed');
    const parsed = toolErrorSchema.parse(err);
    expect(parsed.code).toBe('LIFECYCLE');
    expect(parsed.recoverable).toBe(false);
    expect(parsed.message).toContain('disposed');
  });

  it('TIMEOUT: classifyToolCatchError matches withTimeout message prefix', () => {
    const err = classifyToolCatchError(
      new Error('Timeout after 100ms while waiting for query'),
      'fallback'
    );
    expect(err.code).toBe('TIMEOUT');
    expect(err.recoverable).toBe(true);
    expect(err.suggestion).toMatch(/retry|timeout/i);
    toolErrorSchema.parse(err);
  });

  it('TIMEOUT: default suggestion is unredacted literal', () => {
    const err = timeoutToolError('Timeout after 100ms');
    expect(err.suggestion).toBe(DEFAULT_TIMEOUT_SUGGESTION);
    toolErrorSchema.parse(err);
  });
});
