import type { ServerConfig } from '../config.js';
import { resolveConfig } from '../config.js';
import { PineconeClient } from '../pinecone-client.js';
import { normalizeNamespace } from './namespace-utils.js';
import type { RecommendedTool } from './query-suggestion.js';
import type { UrlGenerationResult, UrlGeneratorFn } from './url-registry.js';

export type NamespaceInfo = {
  namespace: string;
  recordCount: number;
  metadata: Record<string, string>;
};

/** Public seed shape for namespace cache injection (not the internal {@link NamespaceInfo} type). {@link ServerContext} copies `data` at construction so callers may reuse or mutate seed buffers afterward. */
export type NamespaceCacheSeed = {
  data: Array<{ namespace: string; recordCount: number; metadata: Record<string, string> }>;
  expiresAt: number;
};

/** Pre-warmed suggest-flow entry for a namespace. */
export type SuggestionFlowSeedEntry = {
  namespace: string;
  recommended_tool: RecommendedTool;
  suggested_fields: string[];
  user_query: string;
};

/** Pre-built dependencies accepted by {@link ServerContext} and factory helpers. */
export interface ServerContextComposition {
  client?: PineconeClient;
  urlGenerators?: Iterable<readonly [string, UrlGeneratorFn]>;
  namespaceCacheSeed?: NamespaceCacheSeed;
  suggestionFlowSeed?: SuggestionFlowSeedEntry[];
}

type FlowState = {
  updatedAt: number;
  recommended_tool: RecommendedTool;
  suggested_fields: string[];
  user_query: string;
};

type CacheEntry = {
  data: NamespaceInfo[];
  expiresAt: number;
};

/** Return a trimmed non-empty string or null for empty/missing values. */
function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function buildPineconeClient(config: ServerConfig): PineconeClient {
  return new PineconeClient({
    apiKey: config.apiKey,
    indexName: config.indexName,
    sparseIndexName: config.sparseIndexName,
    rerankModel: config.rerankModel,
    defaultTopK: config.defaultTopK,
    requestTimeoutMs: config.requestTimeoutMs,
  });
}

/**
 * Encapsulates per-server state: Pinecone client, config, URL registry,
 * suggest-flow gate, and namespaces cache.
 */
export class ServerContext implements AsyncDisposable {
  disposed = false;
  private toolsRegistered = false;
  private client: PineconeClient | null = null;
  private clientExplicitlySet = false;
  private configValue: ServerConfig | null = null;
  private readonly urlGenerators = new Map<string, UrlGeneratorFn>();
  private readonly suggestionFlow = new Map<string, FlowState>();
  private namespacesCache: CacheEntry | null = null;

  constructor(config?: ServerConfig, composition?: ServerContextComposition) {
    if (config) {
      this.configValue = config;
    }
    if (composition?.client) {
      this.client = composition.client;
      this.clientExplicitlySet = true;
    }
    if (composition?.urlGenerators) {
      for (const [ns, gen] of composition.urlGenerators) {
        this.registerUrlGenerator(ns, gen);
      }
    }
    if (composition?.namespaceCacheSeed) {
      const { data, expiresAt } = composition.namespaceCacheSeed;
      this.namespacesCache = {
        data: data.map((entry) => ({
          namespace: entry.namespace,
          recordCount: entry.recordCount,
          metadata: { ...entry.metadata },
        })),
        expiresAt,
      };
    }
    if (composition?.suggestionFlowSeed) {
      const now = Date.now();
      for (const entry of composition.suggestionFlowSeed) {
        const key = normalizeNamespace(entry.namespace);
        if (!key) {
          throw new Error('suggestionFlowSeed: namespace must not be empty after trim');
        }
        this.suggestionFlow.set(key, {
          recommended_tool: entry.recommended_tool,
          suggested_fields: [...entry.suggested_fields],
          user_query: entry.user_query,
          updatedAt: now,
        });
      }
    }
  }

  /** Build a context with an externally-constructed Pinecone client. */
  static fromClient(config: ServerConfig, client: PineconeClient): ServerContext {
    return new ServerContext(config, { client });
  }

  getConfig(): ServerConfig {
    if (!this.configValue) {
      this.configValue = resolveConfig({});
    }
    return this.configValue;
  }

  setConfig(config: ServerConfig): void {
    this.configValue = config;
    this.invalidateConfigDerivedState();
  }

  /** Drop client, namespace cache, and suggest-flow tied to a previous config. */
  private invalidateConfigDerivedState(): void {
    this.client = null;
    this.clientExplicitlySet = false;
    this.namespacesCache = null;
    this.suggestionFlow.clear();
  }

  setClient(client: PineconeClient): void {
    this.client = client;
    this.clientExplicitlySet = true;
  }

  clearClient(): void {
    this.client = null;
    this.clientExplicitlySet = false;
  }

  /** Whether a Pinecone client was explicitly set via constructor, {@link setClient}, or {@link fromClient}. */
  hasInjectedClient(): boolean {
    return this.clientExplicitlySet;
  }

  /** Return the client only when explicitly injected (legacy {@link getPineconeClient} path). */
  getClientIfSet(): PineconeClient {
    if (!this.clientExplicitlySet || !this.client) {
      throw new Error('Pinecone client not initialized. Call setPineconeClient first.');
    }
    return this.client;
  }

  /** Return the Pinecone client, lazily constructing from config when unset. */
  getClient(): PineconeClient {
    if (!this.client) {
      this.client = buildPineconeClient(this.getConfig());
    }
    return this.client;
  }

  resetUrlGenerators(): void {
    this.urlGenerators.clear();
  }

  registerUrlGenerator(namespace: string, generator: UrlGeneratorFn): void {
    const normalizedNamespace = namespace.trim();
    if (normalizedNamespace.length === 0) {
      throw new TypeError('namespace must be a non-empty string');
    }
    if (typeof generator !== 'function') {
      throw new TypeError('generator must be a function');
    }
    this.urlGenerators.set(normalizedNamespace, generator);
  }

  unregisterUrlGenerator(namespace: string): boolean {
    return this.urlGenerators.delete(namespace.trim());
  }

  hasUrlGenerator(namespace: string): boolean {
    return this.urlGenerators.has(namespace.trim());
  }

  generateUrlForNamespace(
    namespace: string,
    metadata: Record<string, unknown>
  ): UrlGenerationResult {
    const existingUrl = asString(metadata['url']);
    if (existingUrl) {
      return { url: existingUrl, method: 'metadata.url' };
    }

    const generator = this.urlGenerators.get(namespace.trim());
    if (generator) {
      return generator(metadata);
    }

    return {
      url: null,
      method: 'unavailable',
      reason: `URL generation is not supported for namespace "${namespace}"`,
    };
  }

  private sweepExpiredSuggestionFlow(): void {
    const ttlMs = this.getConfig().cacheTtlMs;
    const now = Date.now();
    for (const [ns, state] of this.suggestionFlow) {
      if (now - state.updatedAt > ttlMs) {
        this.suggestionFlow.delete(ns);
      }
    }
  }

  markSuggested(namespace: string, state: Omit<FlowState, 'updatedAt'>): void {
    const key = normalizeNamespace(namespace);
    if (!key) {
      throw new Error('markSuggested: namespace must not be empty after trim');
    }
    this.sweepExpiredSuggestionFlow();
    this.suggestionFlow.set(key, {
      ...state,
      updatedAt: Date.now(),
    });
  }

  requireSuggested(namespace: string):
    | {
        ok: true;
        flow: FlowState;
      }
    | {
        ok: false;
        message: string;
      } {
    const key = normalizeNamespace(namespace);
    if (!key) {
      return {
        ok: false,
        message: 'namespace cannot be empty after trimming whitespace.',
      };
    }

    if (this.getConfig().disableSuggestFlow) {
      return {
        ok: true,
        flow: {
          updatedAt: Date.now(),
          recommended_tool: 'fast',
          suggested_fields: [],
          user_query: '',
        },
      };
    }

    const state = this.suggestionFlow.get(key);
    if (!state) {
      return {
        ok: false,
        message:
          'Flow requires suggest_query_params first. Call suggest_query_params with namespace and user_query before query/count tools.',
      };
    }

    const cfg = this.getConfig();
    const now = Date.now();
    if (now - state.updatedAt > cfg.cacheTtlMs) {
      this.suggestionFlow.delete(key);
      return {
        ok: false,
        message:
          'Previous suggest_query_params context expired. Call suggest_query_params again before query/count tools.',
      };
    }

    return { ok: true, flow: state };
  }

  resetSuggestionFlow(): void {
    this.suggestionFlow.clear();
  }

  async getNamespacesWithCache(): Promise<{
    data: NamespaceInfo[];
    cache_hit: boolean;
    expires_at: number;
  }> {
    const now = Date.now();
    if (this.namespacesCache && now < this.namespacesCache.expiresAt) {
      return {
        data: this.namespacesCache.data,
        cache_hit: true,
        expires_at: this.namespacesCache.expiresAt,
      };
    }

    const client = this.getClient();
    const data = await client.listNamespacesWithMetadata();
    const ttlMs = this.getConfig().cacheTtlMs;
    const expiresAt = now + ttlMs;
    this.namespacesCache = { data, expiresAt };
    return { data, cache_hit: false, expires_at: expiresAt };
  }

  invalidateNamespacesCache(): void {
    this.namespacesCache = null;
  }

  /** Whether MCP tools have been registered on this context (setup guard). */
  hasToolsRegistered(): boolean {
    return this.toolsRegistered;
  }

  /** Throw if this context cannot accept another tool registration pass. */
  assertCanRegisterTools(): void {
    if (this.disposed) {
      throw new Error('Cannot setup a disposed ServerContext. Create a new instance.');
    }
    if (this.toolsRegistered) {
      throw new Error(
        'MCP tools already registered on this ServerContext. Call teardown/dispose first.'
      );
    }
  }

  /** Mark that MCP tools have been registered on this context. */
  markToolsRegistered(): void {
    this.toolsRegistered = true;
  }

  /** Clear all encapsulated state (client handle, caches, registries). */
  teardown(): void {
    this.disposed = true;
    this.toolsRegistered = false;
    this.client = null;
    this.clientExplicitlySet = false;
    this.configValue = null;
    this.urlGenerators.clear();
    this.suggestionFlow.clear();
    this.namespacesCache = null;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.teardown();
    if (defaultContext === this) {
      defaultContext = null;
      pendingConfig = null;
      pendingComposition = null;
    }
  }
}

let defaultContext: ServerContext | null = null;
let pendingConfig: ServerConfig | null = null;
let pendingComposition: ServerContextComposition | null = null;

/** Peek at the process-default context without materializing a new one. */
export function peekDefaultServerContext(): ServerContext | null {
  return defaultContext;
}

/** Process-default context used by legacy module facades. */
export function getDefaultServerContext(): ServerContext {
  if (!defaultContext) {
    const cfg = pendingConfig ?? undefined;
    const comp = pendingComposition ?? undefined;
    defaultContext = new ServerContext(cfg, comp);
    pendingConfig = null;
    pendingComposition = null;
  }
  return defaultContext;
}

/** Replace or clear the process-default context (tests and teardown). */
export function setDefaultServerContext(ctx: ServerContext | null): void {
  defaultContext = ctx;
  if (ctx === null) {
    pendingConfig = null;
    pendingComposition = null;
  }
}

/** Stash config until the default context is first materialized. */
export function setPendingServerConfig(config: ServerConfig): void {
  pendingConfig = config;
  if (defaultContext) {
    defaultContext.setConfig(config);
  }
}

/** Tear down and clear the process-default context. */
export function teardownDefaultServerContext(): void {
  if (defaultContext) {
    defaultContext.teardown();
    defaultContext = null;
  }
  pendingConfig = null;
  pendingComposition = null;
}

/** Multi-tenant: no process-global side effects. */
export function createIsolatedContext(
  config: ServerConfig,
  composition?: ServerContextComposition
): ServerContext {
  return new ServerContext(config, composition);
}

/** Create a configured context and install it as the process default. */
export function createServer(
  config: ServerConfig,
  composition?: ServerContextComposition
): ServerContext {
  const ctx = new ServerContext(config, composition);
  defaultContext = ctx;
  pendingConfig = null;
  pendingComposition = null;
  return ctx;
}
