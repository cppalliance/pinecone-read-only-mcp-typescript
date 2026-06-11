import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validatedJsonResponse } from './tool-response.js';

describe('tool-response', () => {
  it('returns VALIDATION error when schema rejects payload', () => {
    const schema = z.object({ status: z.literal('success'), count: z.number() });
    const result = validatedJsonResponse(schema, { status: 'success' } as never);
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0]!.text);
    expect(body.code).toBe('VALIDATION');
    expect(body.field).toBe('response');
  });
});
