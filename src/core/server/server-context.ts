import type {
  AnyServerConfig,
  AllianceServerConfig,
  CoreServerConfig,
  ServerConfigBase,
} from '../config.js';
import { resolveConfig } from '../config.js';
import { PineconeClient } from '../pinecone-client.js';
import { warnLegacyFacade } from './legacy-facade-warn.js';
import { normalizeNamespace } from './namespace-utils.js';
import type { RecommendedTool } from './query-suggestion.js';
import type { UrlGenerationResult, UrlGeneratorFn } from './url-registry.js';
import { buildSourceRegistry, type SourceRegistry } from './source-registry.js';
import { extractDeclaredSchemas } from './source-config.js';

export type NamespaceInfo = {
  namespace: string;
  recordCount: number;
  metadata: Record<string, string>;
  source?: string;
  schema_source?: 'declared' | 'sampled';
};

export type ResolveSourceResult =
  | { ok: true; source: string }
  | {
      ok: false;
      code:
        | 'UNKNOWN_SOURCE'
        | 'AMBIGUOUS_NAMESPACE'
        | 'NAMESPACE_NOT_FOUND'
        | 'PARTIAL_SOURCE_AGGREGATION';
      message: string;
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

/** Constructor options for contexts that must not lazy-resolve core defaults. */
export type ServerContextInitOptions = {
  /**
   * When true, {@link getConfig} throws until Alliance config is seeded
   * (see {@link createUnconfiguredAllianceContext}).
   */
  unconfiguredAlliance?: boolean;
};

/** Pre-built dependencies accepted by {@link ServerContext} and factory helpers. */
export interface ServerContextComposition {
  client?: PineconeClient;
  sourceRegistry?: SourceRegistry;
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
  warnings: string[];
};

/** Return a trimmed non-empty string or null for empty/missing values. */
function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function buildPineconeClient(config: ServerConfigBase): PineconeClient {
  return new PineconeClient({
    apiKey: config.apiKey,
    indexName: config.indexName,
    sparseIndexName: config.sparseIndexName,
    rerankModel: config.rerankModel,
    defaultTopK: config.defaultTopK,
    requestTimeoutMs: config.requestTimeoutMs,
  });
}

function flowKey(source: string | undefined, namespace: string, multiSource: boolean): string {
  if (multiSource && source) {
    return `${source}:${namespace}`;
  }
  return namespace;
}

function urlRegistryKey(
  namespace: string,
  source: string | undefined,
  multiSource: boolean
): string {
  if (multiSource && source) {
    return `${source}:${namespace.trim()}`;
  }
  return namespace.trim();
}

/**
 * Encapsulates per-server state: Pinecone client, config, URL registry,
 * suggest-flow gate, and namespaces cache.
 */
export class ServerContext<
  T extends ServerConfigBase = ServerConfigBase,
> implements AsyncDisposable {
  disposed = false;
  private toolsRegistered = false;
  private client: PineconeClient | null = null;
  private clientExplicitlySet = false;
  private sourceRegistry: SourceRegistry | null = null;
  private configValue: T | null = null;
  private readonly unconfiguredAlliance: boolean;
  private readonly urlGenerators = new Map<string, UrlGeneratorFn>();
  private readonly suggestionFlow = new Map<string, FlowState>();
  private namespacesCache: CacheEntry | null = null;

  constructor(config?: T, composition?: ServerContextComposition, init?: ServerContextInitOptions) {
    this.unconfiguredAlliance = init?.unconfiguredAlliance ?? false;
    if (composition?.client && composition?.sourceRegistry) {
      throw new Error('Cannot pass both client and sourceRegistry in ServerContextComposition.');
    }
    if (config) {
      this.configValue = config;
    }
    if (composition?.sourceRegistry) {
      this.sourceRegistry = composition.sourceRegistry;
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
        warnings: [],
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
  static fromClient<T extends ServerConfigBase>(
    config: T,
    client: PineconeClient
  ): ServerContext<T> {
    return new ServerContext(config, { client });
  }

  /** Whether config was set at construction or via {@link setConfig} (does not lazy-resolve). */
  hasConfig(): boolean {
    return this.configValue !== null;
  }

  /** Return stored config without lazy env resolution; `null` when unset. */
  getConfigIfSet(): T | null {
    return this.configValue;
  }

  getConfig(): T {
    if (!this.configValue) {
      if (this.unconfiguredAlliance) {
        throw new Error(
          'Alliance ServerContext has no config. Call setConfig(), createServer(resolveAllianceConfig(...)), or setupAllianceServer before getConfig().'
        );
      }
      this.configValue = resolveConfig({}) as unknown as T;
    }
    return this.configValue;
  }

  setConfig(config: T): void {
    this.configValue = config;
    this.invalidateConfigDerivedState();
  }

  /** Drop client, namespace cache, and suggest-flow tied to a previous config. */
  private invalidateConfigDerivedState(): void {
    this.client = null;
    this.clientExplicitlySet = false;
    this.sourceRegistry = null;
    this.namespacesCache = null;
    this.suggestionFlow.clear();
  }

  private ensureSourceRegistry(): SourceRegistry {
    if (this.sourceRegistry) {
      return this.sourceRegistry;
    }
    const cfg = this.getConfig();
    if (!cfg.sources || cfg.sources.length === 0) {
      throw new Error('Multi-source registry requested but config.sources is not set.');
    }
    this.sourceRegistry = buildSourceRegistry({
      sources: cfg.sources,
      defaultSource: cfg.defaultSource ?? cfg.sources[0]!.name,
      cacheTtlMs: cfg.cacheTtlMs,
      defaultTopK: cfg.defaultTopK,
      requestTimeoutMs: cfg.requestTimeoutMs,
    });
    return this.sourceRegistry;
  }

  isMultiSource(): boolean {
    const cfg = this.configValue;
    if (cfg?.sources && cfg.sources.length > 1) {
      return true;
    }
    if (this.sourceRegistry) {
      return this.sourceRegistry.isMultiSource();
    }
    return false;
  }

  listSources(): string[] {
    if (this.sourceRegistry) {
      return this.sourceRegistry.listSources();
    }
    const cfg = this.getConfigIfSet() ?? this.getConfig();
    if (cfg.sources && cfg.sources.length > 0) {
      return cfg.sources.map((s) => s.name);
    }
    return [];
  }

  listSourceDetails(): { name: string; description?: string }[] {
    if (this.sourceRegistry) {
      return this.sourceRegistry.listSources().map((name) => {
        const def = this.sourceRegistry!.getDefinition(name);
        return { name, ...(def.description !== undefined ? { description: def.description } : {}) };
      });
    }
    const cfg = this.getConfigIfSet() ?? this.getConfig();
    return (cfg.sources ?? []).map((s) => ({
      name: s.name,
      ...(s.description !== undefined ? { description: s.description } : {}),
    }));
  }

  getDefaultSourceName(): string {
    if (this.sourceRegistry) {
      return this.sourceRegistry.getDefaultName();
    }
    const cfg = this.getConfig();
    return cfg.defaultSource ?? cfg.sources?.[0]?.name ?? 'default';
  }

  getClientForSource(source: string): PineconeClient {
    if (this.sourceRegistry) {
      return this.sourceRegistry.get(source);
    }
    if (!this.isMultiSource()) {
      return this.getClient();
    }
    return this.ensureSourceRegistry().get(source);
  }

  /** Return the Pinecone client, lazily constructing from config when unset. */
  getClient(): PineconeClient {
    if (this.sourceRegistry) {
      return this.sourceRegistry.getDefault();
    }
    if (this.getConfig().sources && this.getConfig().sources!.length > 0) {
      return this.ensureSourceRegistry().getDefault();
    }
    if (!this.client) {
      this.client = buildPineconeClient(this.getConfig());
    }
    return this.client;
  }

  async resolveSource(source?: string, namespace?: string): Promise<ResolveSourceResult> {
    if (
      !this.isMultiSource() &&
      !(this.getConfig().sources && this.getConfig().sources!.length > 0)
    ) {
      return { ok: true, source: this.getDefaultSourceName() };
    }
    const registry = this.sourceRegistry ?? this.ensureSourceRegistry();
    const trimmedSource = source?.trim();
    if (trimmedSource) {
      if (!registry.listSources().includes(trimmedSource)) {
        return {
          ok: false,
          code: 'UNKNOWN_SOURCE',
          message: `Unknown source "${trimmedSource}". Call list_sources for configured names.`,
        };
      }
      if (namespace !== undefined) {
        const nsNorm = normalizeNamespace(namespace);
        if (!nsNorm) {
          return { ok: false, code: 'NAMESPACE_NOT_FOUND', message: 'namespace cannot be empty.' };
        }
        const { data } = await registry.getNamespacesWithCache(trimmedSource);
        const found = data.some((n) => normalizeNamespace(n.namespace) === nsNorm);
        if (!found) {
          return {
            ok: false,
            code: 'NAMESPACE_NOT_FOUND',
            message: `Namespace "${namespace}" not found on source "${trimmedSource}".`,
          };
        }
      }
      return { ok: true, source: trimmedSource };
    }
    if (namespace !== undefined) {
      const nsNorm = normalizeNamespace(namespace);
      if (!nsNorm) {
        return { ok: false, code: 'NAMESPACE_NOT_FOUND', message: 'namespace cannot be empty.' };
      }
      const cacheResult = await this.getNamespacesWithCache();
      const sourceErrors = cacheResult.source_errors;
      if (sourceErrors && Object.keys(sourceErrors).length > 0) {
        return {
          ok: false,
          code: 'PARTIAL_SOURCE_AGGREGATION',
          message:
            'Namespace discovery is incomplete because one or more sources failed. Pass source explicitly or retry after resolving source_errors.',
        };
      }
      const { data } = cacheResult;
      const matches = data.filter((n) => normalizeNamespace(n.namespace) === nsNorm);
      if (matches.length === 1) {
        return { ok: true, source: matches[0]!.source ?? registry.getDefaultName() };
      }
      if (matches.length > 1) {
        return {
          ok: false,
          code: 'AMBIGUOUS_NAMESPACE',
          message: `Namespace "${namespace}" exists on multiple sources. Pass source explicitly.`,
        };
      }
      return {
        ok: false,
        code: 'NAMESPACE_NOT_FOUND',
        message: `Namespace "${namespace}" not found. Call list_namespaces first.`,
      };
    }
    return { ok: true, source: registry.getDefaultName() };
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
      throw new Error('Pinecone client not initialized. Call ServerContext.setClient() first.');
    }
    return this.client;
  }

  async checkAllIndexes(): Promise<{ ok: boolean; errors: string[] }> {
    if (this.sourceRegistry) {
      return this.sourceRegistry.checkAllIndexes();
    }
    if (this.getConfig().sources && this.getConfig().sources!.length > 0) {
      return this.ensureSourceRegistry().checkAllIndexes();
    }
    return this.getClient().checkIndexes();
  }

  resetUrlGenerators(): void {
    this.urlGenerators.clear();
  }

  registerUrlGenerator(namespace: string, generator: UrlGeneratorFn, source?: string): void {
    const normalizedNamespace = namespace.trim();
    if (normalizedNamespace.length === 0) {
      throw new TypeError('namespace must be a non-empty string');
    }
    if (typeof generator !== 'function') {
      throw new TypeError('generator must be a function');
    }
    const multi = this.isMultiSource();
    if (multi) {
      const sources =
        this.sourceRegistry?.listSources() ??
        this.configValue?.sources?.map((entry) => entry.name) ??
        [];
      if (source) {
        this.urlGenerators.set(urlRegistryKey(normalizedNamespace, source, true), generator);
      } else {
        for (const src of sources) {
          this.urlGenerators.set(urlRegistryKey(normalizedNamespace, src, true), generator);
        }
      }
      return;
    }
    this.urlGenerators.set(normalizedNamespace, generator);
  }

  unregisterUrlGenerator(namespace: string, source?: string): boolean {
    const trimmed = namespace.trim();
    if (!this.isMultiSource()) {
      return this.urlGenerators.delete(trimmed);
    }
    const sources =
      this.sourceRegistry?.listSources() ??
      this.configValue?.sources?.map((entry) => entry.name) ??
      [];
    if (source) {
      return this.urlGenerators.delete(urlRegistryKey(trimmed, source, true));
    }
    let removed = false;
    for (const src of sources) {
      if (this.urlGenerators.delete(urlRegistryKey(trimmed, src, true))) {
        removed = true;
      }
    }
    return removed || this.urlGenerators.delete(trimmed);
  }

  hasUrlGenerator(namespace: string, source?: string): boolean {
    const trimmed = namespace.trim();
    if (!this.isMultiSource()) {
      return this.urlGenerators.has(trimmed);
    }
    if (source) {
      return (
        this.urlGenerators.has(urlRegistryKey(trimmed, source, true)) ||
        this.urlGenerators.has(trimmed)
      );
    }
    const sources =
      this.sourceRegistry?.listSources() ??
      this.configValue?.sources?.map((entry) => entry.name) ??
      [];
    return (
      sources.some((src) => this.urlGenerators.has(urlRegistryKey(trimmed, src, true))) ||
      this.urlGenerators.has(trimmed)
    );
  }

  generateUrlForNamespace(
    namespace: string,
    metadata: Record<string, unknown>,
    source?: string
  ): UrlGenerationResult {
    const existingUrl = asString(metadata['url']);
    if (existingUrl) {
      return { url: existingUrl, method: 'metadata.url' };
    }

    const multi = this.isMultiSource();
    const trimmed = namespace.trim();
    const key = urlRegistryKey(trimmed, source, multi);
    let generator = this.urlGenerators.get(key);
    if (!generator && multi && source) {
      generator = this.urlGenerators.get(trimmed);
    }
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

  markSuggested(namespace: string, state: Omit<FlowState, 'updatedAt'>, source?: string): void {
    const key = normalizeNamespace(namespace);
    if (!key) {
      throw new Error('markSuggested: namespace must not be empty after trim');
    }
    this.sweepExpiredSuggestionFlow();
    const flowKeyValue = flowKey(source, key, this.isMultiSource());
    this.suggestionFlow.set(flowKeyValue, {
      ...state,
      updatedAt: Date.now(),
    });
  }

  requireSuggested(
    namespace: string,
    source?: string
  ):
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

    const flowKeyValue = flowKey(source, key, this.isMultiSource());
    const state = this.suggestionFlow.get(flowKeyValue);
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
      this.suggestionFlow.delete(flowKeyValue);
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

  async getNamespacesWithCache(source?: string): Promise<{
    data: NamespaceInfo[];
    cache_hit: boolean;
    expires_at: number;
    source_errors?: Record<string, string>;
    warnings?: string[];
  }> {
    if (
      this.isMultiSource() ||
      (this.getConfig().sources && this.getConfig().sources!.length > 0)
    ) {
      const registry = this.sourceRegistry ?? this.ensureSourceRegistry();
      if (source) {
        const result = await registry.getNamespacesWithCache(source);
        return result;
      }
      const aggregated = await registry.getAllNamespacesWithCache();
      return aggregated;
    }

    const now = Date.now();
    if (this.namespacesCache && now < this.namespacesCache.expiresAt) {
      return {
        data: this.namespacesCache.data,
        cache_hit: true,
        expires_at: this.namespacesCache.expiresAt,
        ...(this.namespacesCache.warnings.length > 0
          ? { warnings: [...this.namespacesCache.warnings] }
          : {}),
      };
    }

    const cfg = this.getConfig();
    const sourceDef = cfg.sources?.[0];
    const declaredSchemas = extractDeclaredSchemas(sourceDef?.namespaces);
    const client = this.getClient();
    const raw = await client.listNamespacesWithMetadata(declaredSchemas);
    const data: NamespaceInfo[] = raw.namespaces.map((ns) => ({
      namespace: ns.namespace,
      recordCount: ns.recordCount,
      metadata: ns.metadata,
      schema_source: ns.schema_source,
    }));
    const ttlMs = cfg.cacheTtlMs;
    const expiresAt = now + ttlMs;
    this.namespacesCache = { data, expiresAt, warnings: raw.warnings };
    return {
      data,
      cache_hit: false,
      expires_at: expiresAt,
      ...(raw.warnings.length > 0 ? { warnings: [...raw.warnings] } : {}),
    };
  }

  async getNamespacesWithCacheForSource(source: string): Promise<{
    data: NamespaceInfo[];
    cache_hit: boolean;
    expires_at: number;
  }> {
    return this.getNamespacesWithCache(source) as Promise<{
      data: NamespaceInfo[];
      cache_hit: boolean;
      expires_at: number;
    }>;
  }

  invalidateNamespacesCache(source?: string): void {
    if (this.sourceRegistry) {
      this.sourceRegistry.invalidateNamespacesCache(source);
      return;
    }
    if (this.isMultiSource()) {
      this.ensureSourceRegistry().invalidateNamespacesCache(source);
      return;
    }
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
    this.sourceRegistry = null;
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
    if (facadeSupersededBy === this) {
      facadeSupersededBy = null;
    }
  }
}

/** Context bound to a core-resolved config; accepted by {@link setupCoreServer}. */
export type CoreServerContext = ServerContext<CoreServerConfig>;

/** Context bound to an Alliance-resolved config; accepted by {@link setupAllianceServer}. */
export type AllianceServerContext = ServerContext<AllianceServerConfig>;

/**
 * Empty Alliance context that rejects core lazy-resolve in {@link ServerContext.getConfig}
 * until {@link setupAllianceServer} or {@link ServerContext.setConfig} seeds Alliance config.
 */
export function createUnconfiguredAllianceContext(): AllianceServerContext {
  return new ServerContext<AllianceServerConfig>(undefined, undefined, {
    unconfiguredAlliance: true,
  });
}

let defaultContext: ServerContext | null = null;
let facadeSupersededBy: ServerContext | null = null;
let pendingConfig: ServerConfigBase | null = null;
let pendingComposition: ServerContextComposition | null = null;

const LEGACY_FACADE_SUPERSEDED_MESSAGE =
  'Legacy module facades are unavailable after setup with an explicit context. ' +
  'Use methods on the ServerContext passed to setupCoreServer / setupAllianceServer. ' +
  'See docs/MIGRATION.md#030-legacy-module-facade-deprecations.';

/** Peek at the process-default context without materializing a new one. */
export function peekDefaultServerContext(): ServerContext | null {
  return defaultContext;
}

/**
 * Process-default context used by legacy module facades.
 *
 * @deprecated since 0.3.0 — removal no earlier than 0.5.0. Legacy module facade. Pass a
 * {@link ServerContext} from {@link createServer} explicitly to setup APIs instead. See
 * docs/MIGRATION.md#030-legacy-module-facade-deprecations.
 * @see createServer
 */
export function getDefaultServerContext(): ServerContext {
  warnLegacyFacade('getDefaultServerContext');
  return resolveDefaultServerContext();
}

/** Resolve process-default context for internal setup and legacy facade delegation (no warning). */
export function resolveDefaultServerContext(): ServerContext {
  if (facadeSupersededBy !== null) {
    throw new Error(LEGACY_FACADE_SUPERSEDED_MESSAGE);
  }
  if (!defaultContext) {
    const cfg = pendingConfig ?? undefined;
    const comp = pendingComposition ?? undefined;
    defaultContext = new ServerContext(cfg, comp);
    pendingConfig = null;
    pendingComposition = null;
  }
  return defaultContext;
}

/**
 * Mark that setup runs on an explicit non-default context so legacy module facades fail fast.
 * When {@link ctx} is the process default, legacy facades remain available.
 */
export function installExplicitServerContext(ctx: ServerContext): void {
  if (defaultContext !== null && defaultContext !== ctx) {
    defaultContext.teardown();
    defaultContext = null;
    pendingConfig = null;
    pendingComposition = null;
  }
  facadeSupersededBy = defaultContext === ctx ? null : ctx;
}

/** Replace or clear the process-default context (tests and teardown). */
export function setDefaultServerContext(ctx: ServerContext | null): void {
  defaultContext = ctx;
  facadeSupersededBy = null;
  if (ctx === null) {
    pendingConfig = null;
    pendingComposition = null;
  }
}

/** Stash config until the default context is first materialized. */
export function setPendingServerConfig(config: ServerConfigBase): void {
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
  facadeSupersededBy = null;
  pendingConfig = null;
  pendingComposition = null;
}

/** Multi-tenant: no process-global side effects. */
export function createIsolatedContext(
  config: CoreServerConfig,
  composition?: ServerContextComposition
): CoreServerContext;
export function createIsolatedContext(
  config: AllianceServerConfig,
  composition?: ServerContextComposition
): ServerContext<AllianceServerConfig>;
export function createIsolatedContext(
  config: AnyServerConfig,
  composition?: ServerContextComposition
): ServerContext {
  return new ServerContext(config, composition);
}

/** Create a configured context and install it as the process default. */
export function createServer(
  config: CoreServerConfig,
  composition?: ServerContextComposition
): CoreServerContext;
export function createServer(
  config: AllianceServerConfig,
  composition?: ServerContextComposition
): ServerContext<AllianceServerConfig>;
export function createServer(
  config: AnyServerConfig,
  composition?: ServerContextComposition
): ServerContext {
  const ctx = new ServerContext(config, composition);
  defaultContext = ctx;
  facadeSupersededBy = null;
  pendingConfig = null;
  pendingComposition = null;
  return ctx;
}
