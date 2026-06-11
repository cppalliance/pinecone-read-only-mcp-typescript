import type { z } from 'zod';
import { error as logError, redactSensitiveFields } from '../../logger.js';
import type { ToolError } from './tool-error.js';
import { toolErrorSchema, validationToolError } from './tool-error.js';

export type TextPayload = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/** Build an MCP tool success payload with JSON-stringified content. */
export function jsonResponse(payload: unknown): TextPayload {
  const safe = redactSensitiveFields(payload);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(safe, null, 2),
      },
    ],
  };
}

/** Build an MCP tool success payload validated against a Zod schema before returning. */
export function validatedJsonResponse<T>(schema: z.ZodType<T>, payload: T): TextPayload {
  try {
    const validated = schema.parse(payload);
    return jsonResponse(validated);
  } catch (err) {
    logError('Response schema validation failed', err);
    return jsonErrorResponse(
      validationToolError('Internal response shape validation failed', 'response')
    );
  }
}

/** Build an MCP tool error payload with JSON-stringified {@link ToolError} and isError: true. */
export function jsonErrorResponse(err: ToolError): TextPayload {
  const validated = toolErrorSchema.parse(err);
  const safe = redactSensitiveFields(validated) as ToolError;
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify(safe, null, 2),
      },
    ],
  };
}
