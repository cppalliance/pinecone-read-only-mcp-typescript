/**
 * Shared helpers for multi-source tool handlers.
 */

import { z } from 'zod';
import { getPineconeClient } from './client-context.js';
import type { PineconeClient } from '../pinecone-client.js';
import type { ServerContext } from './server-context.js';
import { logToolInvocation, validationToolError } from './tool-error.js';

export const sourceParamSchema = z
  .string()
  .optional()
  .describe(
    'Pinecone source name (from list_sources). Omit on discovery tools to search all sources. ' +
      'On query tools, omit only when namespace uniquely identifies one source.'
  );

export type ResolveSourceFailureCode =
  | 'UNKNOWN_SOURCE'
  | 'AMBIGUOUS_NAMESPACE'
  | 'NAMESPACE_NOT_FOUND';

export async function resolveSourceForTool(
  ctx: ServerContext | undefined,
  source: string | undefined,
  namespace: string | undefined
): Promise<
  | { ok: true; source: string; ctx: ServerContext }
  | { ok: false; code: ResolveSourceFailureCode; message: string }
> {
  if (!ctx) {
    return {
      ok: false,
      code: 'UNKNOWN_SOURCE',
      message: 'ServerContext is required for multi-source resolution.',
    };
  }
  const resolved = await ctx.resolveSource(source, namespace);
  if (!resolved.ok) {
    return resolved;
  }
  return { ok: true, source: resolved.source, ctx };
}

export function sourceValidationError(
  code: ResolveSourceFailureCode,
  message: string,
  field: 'source' | 'namespace' = 'source'
) {
  const suggestion =
    code === 'AMBIGUOUS_NAMESPACE'
      ? 'Call list_namespaces and pass source explicitly when the namespace exists on multiple projects.'
      : code === 'UNKNOWN_SOURCE'
        ? 'Call list_sources to see configured source names.'
        : 'Use list_namespaces to discover valid namespace and source pairs.';
  return validationToolError(message, field, { suggestion });
}

/** Pinecone client for a resolved source, or the context/default client in single-source mode. */
export function getClientForResolvedSource(
  ctx: ServerContext | undefined,
  source: string | undefined,
  toolName?: string
): PineconeClient {
  if (toolName && source && ctx?.isMultiSource()) {
    logToolInvocation(toolName, source);
  }
  if (ctx) {
    if (ctx.isMultiSource() && source) {
      return ctx.getClientForSource(source);
    }
    return ctx.getClient();
  }
  return getPineconeClient();
}

/** Include `source` on responses only in multi-source mode. */
export function optionalSourceField(
  ctx: ServerContext | undefined,
  source: string | undefined
): { source?: string } {
  if (source && ctx?.isMultiSource()) {
    return { source };
  }
  return {};
}
