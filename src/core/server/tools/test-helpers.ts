import type { z } from 'zod';
import { vi } from 'vitest';
import type { HybridQueryResult, SearchResult } from '../../../types.js';
import { resolveConfig } from '../../config.js';
import type { PineconeClient } from '../../pinecone-client.js';
import type { ConfigOverrides, CoreServerConfig } from '../../config.js';
import type { SourceDefinition } from '../source-config.js';
import { buildSourceRegistry } from '../source-registry.js';
import {
  ServerContext,
  teardownDefaultServerContext,
  type CoreServerContext,
  type ServerContextComposition,
} from '../server-context.js';
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
    ...(overrides?.rerank_skipped_reason !== undefined
      ? { rerank_skipped_reason: overrides.rerank_skipped_reason }
      : {}),
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

/**
 * Resolved config for tests: explicit credentials and suggest-flow **enabled**
 * so `PINECONE_DISABLE_SUGGEST_FLOW` in CI/env cannot bypass the gate.
 */
/** Stable TTL (seconds) for tests — overrides env `PINECONE_CACHE_TTL_SECONDS`. */
const TEST_CACHE_TTL_SECONDS = 3600;

export function resolveTestConfig(overrides: ConfigOverrides = {}): CoreServerConfig {
  return resolveConfig({
    apiKey: 'sk-test',
    indexName: 'test-index',
    disableSuggestFlow: false,
    cacheTtlSeconds: TEST_CACHE_TTL_SECONDS,
    ...overrides,
  });
}

/** Clear process-default context so tests exercise an isolated instance only. */
export function isolateFromDefaultContext(): void {
  teardownDefaultServerContext();
}

/** Build an isolated {@link ServerContext} for instance-path tool tests. */
export function createTestServerContext(options?: {
  config?: ConfigOverrides;
  client?: PineconeClient;
  composition?: ServerContextComposition;
}): CoreServerContext {
  const config = resolveTestConfig(options?.config);
  const composition: ServerContextComposition = {
    ...options?.composition,
    ...(options?.client ? { client: options.client } : {}),
  };
  if (
    composition.client ||
    composition.urlGenerators ||
    composition.namespaceCacheSeed ||
    composition.suggestionFlowSeed
  ) {
    return new ServerContext(config, composition);
  }
  return new ServerContext(config);
}

/** Assert tool success JSON matches the exported Zod response schema (schema-response alignment). */
export function expectMatchesResponseSchema<T>(schema: z.ZodType<T>, body: unknown): T {
  return schema.parse(body);
}

/** Default two-source definitions for multi-source tests (overlapping `shared` namespace). */
export const DEFAULT_MULTI_SOURCE_DEFINITIONS: SourceDefinition[] = [
  { name: 'public', apiKey: 'k1', indexName: 'idx-a', sparseIndexName: 'idx-a-sparse' },
  { name: 'private', apiKey: 'k2', indexName: 'idx-b', sparseIndexName: 'idx-b-sparse' },
];

/** Minimal mock {@link PineconeClient} with configurable namespace list. */
export function makeMockPineconeClient(
  namespaces: string[],
  options?: { query?: ReturnType<typeof vi.fn> }
) {
  return {
    listNamespacesWithMetadata: vi.fn().mockResolvedValue(
      namespaces.map((namespace) => ({
        namespace,
        recordCount: 1,
        metadata: { title: 'string' },
      }))
    ),
    query: options?.query ?? vi.fn(),
    count: vi.fn().mockResolvedValue({ count: 0, truncated: false }),
    keywordSearch: vi.fn().mockResolvedValue([]),
    checkIndexes: vi.fn().mockResolvedValue({ ok: true, errors: [] }),
    getSparseIndexName: () => 'sparse',
  };
}

export type MultiSourceTestContext = {
  ctx: CoreServerContext;
  clients: Map<string, ReturnType<typeof makeMockPineconeClient>>;
  sources: SourceDefinition[];
  registry: ReturnType<typeof buildSourceRegistry>;
};

/** Build an isolated multi-source {@link ServerContext} with injectable per-source mock clients. */
export function createMultiSourceTestContext(options?: {
  sources?: SourceDefinition[];
  namespacesBySource?: Record<string, string[]>;
  clients?: Map<string, ReturnType<typeof makeMockPineconeClient>>;
  defaultSource?: string;
  config?: ConfigOverrides;
}): MultiSourceTestContext {
  const sources = options?.sources ?? DEFAULT_MULTI_SOURCE_DEFINITIONS;
  const defaultSource = options?.defaultSource ?? sources[0]!.name;
  const namespacesBySource =
    options?.namespacesBySource ??
    Object.fromEntries(
      sources.map((s, i) => [s.name, i === 0 ? ['wg21', 'shared'] : ['shared', 'internal']])
    );
  const clients =
    options?.clients ??
    new Map(sources.map((s) => [s.name, makeMockPineconeClient(namespacesBySource[s.name] ?? [])]));
  const registry = buildSourceRegistry({
    sources,
    defaultSource,
    cacheTtlMs: 60_000,
    defaultTopK: 10,
    requestTimeoutMs: 15_000,
    clients: clients as unknown as Map<string, PineconeClient>,
  });
  const inlineSources = sources.map((s) => `${s.name}:${s.apiKey}:${s.indexName}`).join(';');
  const config = resolveConfig({
    sources: inlineSources,
    disableSuggestFlow: false,
    ...options?.config,
  });
  const ctx = new ServerContext(config, { sourceRegistry: registry });
  return { ctx, clients, sources, registry };
}
