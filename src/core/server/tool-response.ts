import type { ToolError } from './tool-error.js';
import { toolErrorSchema } from './tool-error.js';
import { redactValue } from '../../logger.js';

export type TextPayload = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

/** Build an MCP tool success payload with JSON-stringified content. */
export function jsonResponse(payload: unknown): TextPayload {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(redactValue(payload), null, 2),
      },
    ],
  };
}

/** Build an MCP tool error payload with JSON-stringified {@link ToolError} and isError: true. */
export function jsonErrorResponse(err: ToolError): TextPayload {
  const validated = toolErrorSchema.parse(redactValue(err));
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify(validated, null, 2),
      },
    ],
  };
}
