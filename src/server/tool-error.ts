/**
 * Shared error handling for MCP tools: consistent logging, user-facing messages,
 * and typed {@link ToolError} payloads for MCP `isError` responses.
 */

import { z } from 'zod';
import { getLogLevel, error as logError } from '../logger.js';

/** User-facing error message: detailed in DEBUG, generic otherwise. */
export function getToolErrorMessage(error: unknown, fallbackMessage: string): string {
  const msg = error instanceof Error ? error.message : String(error);
  return getLogLevel() === 'DEBUG' ? msg : fallbackMessage;
}

/** Log tool failure to stderr via the level-based logger. */
export function logToolError(toolName: string, error: unknown): void {
  logError(`Error in ${toolName} tool`, error);
}

export const toolErrorCodeSchema = z.enum([
  'FLOW_GATE',
  'VALIDATION',
  'PINECONE_ERROR',
  'TIMEOUT',
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
  suggestion: z.string().optional(),
});

export const toolErrorSchema = z.discriminatedUnion('code', [
  flowGateToolErrorSchema,
  validationToolErrorSchema,
  pineconeToolErrorSchema,
  timeoutToolErrorSchema,
]);

export type ToolError = z.infer<typeof toolErrorSchema>;

const DEFAULT_TIMEOUT_SUGGESTION = 'Retry the request, or increase --request-timeout-ms.';

/** Matches {@link withTimeout} rejection message prefix in `retry.ts`. */
const TIMEOUT_MESSAGE_PATTERN = /^Timeout after \d+ms while waiting for /i;

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
    message,
    recoverable: options?.recoverable ?? false,
    ...(options?.suggestion ? { suggestion: options.suggestion } : {}),
  };
}

export function timeoutToolError(
  message: string,
  options?: { suggestion?: string }
): ToolError {
  return {
    code: 'TIMEOUT',
    message,
    recoverable: true,
    suggestion: options?.suggestion ?? DEFAULT_TIMEOUT_SUGGESTION,
  };
}

function rawErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Map an unexpected thrown error to {@link ToolError} for MCP responses.
 * Uses raw `Error#message` for timeout detection (DEBUG mode replaces the user message).
 */
export function classifyToolCatchError(error: unknown, fallbackMessage: string): ToolError {
  const raw = rawErrorMessage(error);
  const message = getToolErrorMessage(error, fallbackMessage);
  if (TIMEOUT_MESSAGE_PATTERN.test(raw)) {
    return timeoutToolError(message);
  }
  return pineconeToolError(message);
}
