import type { HybridQueryResult, SearchResult } from '../../types.js';
import type { ToolError, ToolErrorCode } from '../tool-error.js';
import { toolErrorSchema } from '../tool-error.js';

/** Handler invoked by MCP tool registration (params shape varies by tool). */
export type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;

/**
 * Minimal stand-in for {@link McpServer} that records `registerTool` handlers by name.
 */
export function createMockServer(): {
  /** Matches {@link McpServer.registerTool}: `(name, config, callback)`; callback is always the last argument. */
  registerTool: (...args: unknown[]) => void;
  getHandler: (name: string) => ToolHandler | undefined;
  handlers: Map<string, ToolHandler>;
} {
  const handlers = new Map<string, ToolHandler>();
  return {
    registerTool(...args: unknown[]) {
      if (args.length < 2) return;
      const name = args[0];
      const handler = args[args.length - 1];
      if (typeof name !== 'string' || typeof handler !== 'function') return;
      handlers.set(name, handler as ToolHandler);
    },
    getHandler(name) {
      return handlers.get(name);
    },
    handlers,
  };
}

/** Parse JSON body from {@link jsonResponse} / {@link jsonErrorResponse} payload. */
export function parseToolJson(payload: unknown): Record<string, unknown> {
  const p = payload as { content: Array<{ type: string; text: string }> };
  const text = p.content[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('Expected text content in tool response');
  }
  return JSON.parse(text) as Record<string, unknown>;
}

/** Parse MCP tool error JSON from a handler return value (expects `isError: true` on the envelope). */
export function assertToolError(payload: unknown): ToolError {
  const envelope = payload as { isError?: unknown };
  if (envelope?.isError !== true) {
    throw new Error('Expected MCP tool response with isError: true');
  }
  const raw = parseToolJson(payload);
  return toolErrorSchema.parse(raw);
}

/**
 * Like {@link assertToolError}, but asserts `code` and narrows the union so
 * `field` / `suggestion` are type-safe per variant.
 */
export function assertToolErrorCode<const C extends ToolErrorCode>(
  payload: unknown,
  code: C
): Extract<ToolError, { code: C }> {
  const err = assertToolError(payload);
  if (err.code !== code) {
    throw new Error(`Expected tool error code ${code}, got ${err.code}`);
  }
  return err as Extract<ToolError, { code: C }>;
}

export function makeSearchResult(overrides?: Partial<SearchResult>): SearchResult {
  return {
    id: 'hit-1',
    content: 'chunk body',
    score: 0.95,
    metadata: { document_number: 'WG21-P1234', title: 'T', author: 'A', url: 'https://x' },
    reranked: true,
    ...overrides,
  };
}

/** Default hybrid query outcome for mocked {@link PineconeClient.query}. */
export function makeHybridQueryResult(overrides?: Partial<HybridQueryResult>): HybridQueryResult {
  return {
    results: overrides?.results ?? [makeSearchResult()],
    degraded: overrides?.degraded ?? false,
    ...(overrides?.degradation_reason !== undefined
      ? { degradation_reason: overrides.degradation_reason }
      : {}),
    hybrid_leg_failed: overrides?.hybrid_leg_failed ?? null,
  };
}

/** Shape returned by {@link getNamespacesWithCache} `data` entries. */
export function makeNamespaceCacheEntry(
  namespace: string,
  metadata: Record<string, string> = {
    document_number: 'string',
    title: 'string',
    url: 'string',
    author: 'string',
    chunk_text: 'string',
  },
  recordCount = 42
): { namespace: string; recordCount: number; metadata: Record<string, string> } {
  return { namespace, recordCount, metadata };
}
