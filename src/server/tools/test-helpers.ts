import type { SearchResult } from '../../types.js';

/** Handler invoked by MCP tool registration (params shape varies by tool). */
export type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;

/**
 * Minimal stand-in for {@link McpServer} that records `registerTool` handlers by name.
 */
export function createMockServer(): {
  registerTool: (name: string, _schema: unknown, handler: ToolHandler) => void;
  getHandler: (name: string) => ToolHandler | undefined;
  handlers: Map<string, ToolHandler>;
} {
  const handlers = new Map<string, ToolHandler>();
  return {
    registerTool(name, _schema, handler) {
      handlers.set(name, handler);
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
