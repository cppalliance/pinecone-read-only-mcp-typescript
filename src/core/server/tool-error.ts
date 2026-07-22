/**
 * Shared error handling for MCP tools: consistent logging, user-facing messages,
 * and typed {@link ToolError} payloads for MCP `isError` responses.
 */

import { z } from 'zod';
import { getLogLevel, redactApiKey, error as logError, info } from '../../logger.js';
import { isAppTimeoutError } from './retry.js';

/** User-facing error message: detailed in DEBUG, generic otherwise. */
export function getToolErrorMessage(error: unknown, fallbackMessage: string): string {
  const msg = error instanceof Error ? error.message : String(error);
  return getLogLevel() === 'DEBUG' ? msg : fallbackMessage;
}

/** Log tool failure to stderr via the level-based logger. */
export function logToolError(toolName: string, error: unknown, source?: string): void {
  const suffix = source ? ` [source=${source}]` : '';
  logError(`Error in ${toolName} tool${suffix}`, error);
}

/** Log resolved source at INFO when multi-source routing is active. */
export function logToolInvocation(toolName: string, source: string | undefined): void {
  if (!source) return;
  info(`${toolName} [source=${source}]`);
}

export const toolErrorCodeSchema = z.enum([
  'FLOW_GATE',
  'VALIDATION',
  'PINECONE_ERROR',
  'TIMEOUT',
  'LIFECYCLE',
]);
export type ToolErrorCode = z.infer<typeof toolErrorCodeSchema>;

const flowGateToolErrorSchema = z.object({
  code: z.literal('FLOW_GATE'),
  message: z.string(),
  recoverable: z.literal(true),
  suggestion: z.string(),
});

const validationToolErrorSchema = z.object({
  code: z.literal('VALIDATION'),
  message: z.string(),
  recoverable: z.literal(true),
  field: z.string(),
  suggestion: z.string().optional(),
});

const pineconeToolErrorSchema = z.object({
  code: z.literal('PINECONE_ERROR'),
  message: z.string(),
  recoverable: z.boolean(),
  suggestion: z.string().optional(),
});

const timeoutToolErrorSchema = z.object({
  code: z.literal('TIMEOUT'),
  message: z.string(),
  recoverable: z.literal(true),
  suggestion: z.string(),
});

const lifecycleToolErrorSchema = z.object({
  code: z.literal('LIFECYCLE'),
  message: z.string(),
  recoverable: z.literal(false),
  suggestion: z.string().optional(),
});

export const toolErrorSchema = z.discriminatedUnion('code', [
  flowGateToolErrorSchema,
  validationToolErrorSchema,
  pineconeToolErrorSchema,
  timeoutToolErrorSchema,
  lifecycleToolErrorSchema,
]);

export type ToolError = z.infer<typeof toolErrorSchema>;

/** Default TIMEOUT suggestion when the caller does not supply one. */
export const DEFAULT_TIMEOUT_SUGGESTION = 'Retry the request, or increase --request-timeout-ms.';

export function flowGateToolError(namespace: string, message: string): ToolError {
  return {
    code: 'FLOW_GATE',
    message,
    recoverable: true,
    suggestion: `Call suggest_query_params for namespace '${namespace}' first`,
  };
}

export function validationToolError(
  message: string,
  field: string,
  options?: { suggestion?: string }
): ToolError {
  return {
    code: 'VALIDATION',
    message,
    recoverable: true,
    field,
    ...(options?.suggestion ? { suggestion: options.suggestion } : {}),
  };
}

export function pineconeToolError(
  message: string,
  options?: { recoverable?: boolean; suggestion?: string }
): ToolError {
  return {
    code: 'PINECONE_ERROR',
    message: redactApiKey(message),
    recoverable: options?.recoverable ?? false,
    ...(options?.suggestion ? { suggestion: redactApiKey(options.suggestion) } : {}),
  };
}

export function timeoutToolError(message: string, options?: { suggestion?: string }): ToolError {
  return {
    code: 'TIMEOUT',
    message: redactApiKey(message),
    recoverable: true,
    suggestion:
      options?.suggestion !== undefined
        ? redactApiKey(options.suggestion)
        : DEFAULT_TIMEOUT_SUGGESTION,
  };
}

export function lifecycleToolError(message: string): ToolError {
  return {
    code: 'LIFECYCLE',
    message,
    recoverable: false,
  };
}

/**
 * Map an unexpected thrown error to {@link ToolError} for MCP responses.
 */
export function classifyToolCatchError(error: unknown, fallbackMessage: string): ToolError {
  const message = getToolErrorMessage(error, fallbackMessage);
  if (isAppTimeoutError(error)) {
    return timeoutToolError(message);
  }
  return pineconeToolError(message);
}
