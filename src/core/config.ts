/**
 * Shared runtime config types and resolver.
 *
 * Branded types ({@link CoreServerConfig}, {@link AllianceServerConfig}) distinguish
 * configs produced by {@link resolveConfig} vs {@link resolveAllianceConfig} at compile time.
 * {@link ServerConfigBase} is the shared structural type for read paths (e.g. `ctx.getConfig()`).
 * Modules MUST NOT read `process.env` directly anymore — they receive their slice of the config.
 */

import { DEFAULT_TOP_K, FLOW_CACHE_TTL_MS } from '../constants.js';

/** Allowed log levels, in ascending severity. */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/** Allowed log output formats. */
export type LogFormat = 'text' | 'json';

declare const coreServerConfigBrand: unique symbol;
declare const allianceServerConfigBrand: unique symbol;

/**
 * Unified runtime configuration for the MCP server (structural fields only).
 *
 * Built once by `parseCli()` (or constructed directly by library consumers)
 * and threaded through setup. `apiKey` and `indexName` are required.
 */
export interface ServerConfigBase {
  /** Pinecone API key. Required. */
  apiKey: string;
  /** Dense (hybrid) index name (`PINECONE_INDEX_NAME` or CLI `--index-name`). Required. */
  indexName: string;
  /** Sparse index name. Defaults to `${indexName}-sparse`. */
  sparseIndexName: string;
  /**
   * Reranker model identifier when set via env or overrides.
   * Omitted when unset — {@link PineconeClient} skips reranking unless a model is provided.
   */
  rerankModel?: string;
  /** Default top-k when callers omit it on `query`. */
  defaultTopK: number;
  /** Minimum log level emitted to stderr. */
  logLevel: LogLevel;
  /** Log line format: human-readable text or one JSON object per line. */
  logFormat: LogFormat;
  /** Cache TTL (ms) for the namespaces cache and suggestion-flow gate. */
  cacheTtlMs: number;
  /** Per-call timeout (ms) applied to outbound Pinecone requests. */
  requestTimeoutMs: number;
  /**
   * When true, the suggest_query_params flow gate is bypassed for `query`, `count`, and
   * `query_documents`. Core {@link resolveConfig} defaults this to `true` so generic embedders
   * can call retrieval tools directly; use `guided_query` for ceremony-free orchestration or
   * set `PINECONE_DISABLE_SUGGEST_FLOW=false` to require `suggest_query_params` first.
   */
  disableSuggestFlow: boolean;
  /** When true, on-startup probe verifies dense + sparse indexes exist. */
  checkIndexes: boolean;
}

/** Backward-compatible alias for {@link ServerConfigBase} (read paths, docs). */
export type ServerConfig = ServerConfigBase;

/** Config produced by {@link resolveConfig} (core defaults: gate off, explicit index required). */
export type CoreServerConfig = ServerConfigBase & { readonly [coreServerConfigBrand]: 'core' };

/** Config produced by {@link resolveAllianceConfig} (Alliance defaults: gate on, `rag-hybrid` index). */
export type AllianceServerConfig = ServerConfigBase & {
  readonly [allianceServerConfigBrand]: 'alliance';
};

/** Branded union accepted by {@link createServer} and {@link createIsolatedContext}. */
export type AnyServerConfig = CoreServerConfig | AllianceServerConfig;

/** Runtime lineage marker (compile-time brands are erased). */
export const SERVER_CONFIG_LINEAGE = Symbol.for('@will-cppa/pinecone-read-only-mcp.config-lineage');

export type ServerConfigLineage = 'core' | 'alliance';

type ServerConfigLineageHost = ServerConfigBase & {
  [SERVER_CONFIG_LINEAGE]?: ServerConfigLineage;
};

/** Read config lineage set by {@link brandCoreConfig} / {@link brandAllianceConfig}. */
export function getServerConfigLineage(config: ServerConfigBase): ServerConfigLineage | undefined {
  return (config as ServerConfigLineageHost)[SERVER_CONFIG_LINEAGE];
}

/** Attach the core brand after {@link resolveConfig} resolution. */
export function brandCoreConfig(config: ServerConfigBase): CoreServerConfig {
  (config as ServerConfigLineageHost)[SERVER_CONFIG_LINEAGE] = 'core';
  return config as CoreServerConfig;
}

/** Attach the Alliance brand after {@link resolveAllianceConfig} resolution. */
export function brandAllianceConfig(config: ServerConfigBase): AllianceServerConfig {
  (config as ServerConfigLineageHost)[SERVER_CONFIG_LINEAGE] = 'alliance';
  return config as AllianceServerConfig;
}

/** Default per-call timeout for Pinecone requests, in milliseconds. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

function asLogLevel(value: string | undefined, fallback: LogLevel): LogLevel {
  const allowed: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
  return allowed.includes(value as LogLevel) ? (value as LogLevel) : fallback;
}

function asLogFormat(value: string | undefined, fallback: LogFormat): LogFormat {
  return value === 'json' || value === 'text' ? value : fallback;
}

function asPositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Parse env/CLI boolean strings (`true`/`1`/`yes`/`on` and `false`/`0`/`no`/`off`). */
export function asBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  return fallback;
}

/** Trim env/CLI strings; returns `undefined` for missing or whitespace-only values. */
export function trimOptional(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

/** Partial config used by `resolveConfig` (CLI overrides for env). */
export interface ConfigOverrides {
  apiKey?: string;
  indexName?: string;
  sparseIndexName?: string;
  rerankModel?: string;
  defaultTopK?: number;
  logLevel?: string;
  logFormat?: string;
  cacheTtlSeconds?: number;
  requestTimeoutMs?: number;
  disableSuggestFlow?: boolean;
  checkIndexes?: boolean;
}

/**
 * Build a {@link CoreServerConfig} from CLI overrides, environment variables, and defaults.
 * CLI > env > default precedence is preserved.
 *
 * Output is the `config` half of the embedder pattern `{ config, composition }`.
 * Suggest-flow gate settings (`disableSuggestFlow`, `cacheTtlMs`) belong on the
 * returned config. Per-instance injectables (Pinecone client, URL generators,
 * namespace cache seed, suggest-flow seed) belong in {@link ServerContextComposition}
 * passed to {@link createIsolatedContext} (multi-tenant) or {@link createServer}
 * (singleton CLI path).
 *
 * **Suggest-flow gate default:** `disableSuggestFlow` defaults to `true` (gate off). Generic
 * embedders can call `query` / `count` / `query_documents` without `suggest_query_params`;
 * prefer `guided_query` for single-call orchestration. Set `PINECONE_DISABLE_SUGGEST_FLOW=false`
 * or `disableSuggestFlow: false` in overrides to enable the gate. Alliance
 * {@link resolveAllianceConfig} overrides this to `false` by default.
 *
 * @throws Error when no API key or index name is provided.
 */
export function resolveConfig(
  overrides: ConfigOverrides,
  env: NodeJS.ProcessEnv = process.env
): CoreServerConfig {
  const apiKey = (overrides.apiKey ?? env['PINECONE_API_KEY'] ?? '').trim();
  if (!apiKey) {
    throw new Error(
      'Missing Pinecone API key: set PINECONE_API_KEY or pass --api-key (or apiKey in ConfigOverrides for library use).'
    );
  }

  const indexName = trimOptional(overrides.indexName ?? env['PINECONE_INDEX_NAME']);
  if (!indexName) {
    throw new Error(
      'Missing Pinecone index name: set PINECONE_INDEX_NAME or pass --index-name (or indexName in ConfigOverrides for library use).'
    );
  }

  const sparseIndexName =
    trimOptional(overrides.sparseIndexName ?? env['PINECONE_SPARSE_INDEX_NAME']) ??
    `${indexName}-sparse`;

  const rerankModel = trimOptional(overrides.rerankModel ?? env['PINECONE_RERANK_MODEL']);

  const defaultTopK = overrides.defaultTopK ?? asPositiveInt(env['PINECONE_TOP_K'], DEFAULT_TOP_K);
  const logLevel = asLogLevel(
    overrides.logLevel ?? env['PINECONE_READ_ONLY_MCP_LOG_LEVEL'],
    'INFO'
  );
  const logFormat = asLogFormat(
    overrides.logFormat ?? env['PINECONE_READ_ONLY_MCP_LOG_FORMAT'],
    'text'
  );
  const cacheTtlSeconds =
    overrides.cacheTtlSeconds ??
    asPositiveInt(env['PINECONE_CACHE_TTL_SECONDS'], FLOW_CACHE_TTL_MS / 1000);
  const requestTimeoutMs =
    overrides.requestTimeoutMs ??
    asPositiveInt(env['PINECONE_REQUEST_TIMEOUT_MS'], DEFAULT_REQUEST_TIMEOUT_MS);
  const disableSuggestFlow =
    overrides.disableSuggestFlow ?? asBool(env['PINECONE_DISABLE_SUGGEST_FLOW'], true);
  const checkIndexes = overrides.checkIndexes ?? asBool(env['PINECONE_CHECK_INDEXES'], false);

  return brandCoreConfig({
    apiKey,
    indexName,
    sparseIndexName,
    ...(rerankModel !== undefined ? { rerankModel } : {}),
    defaultTopK,
    logLevel,
    logFormat,
    cacheTtlMs: cacheTtlSeconds * 1000,
    requestTimeoutMs,
    disableSuggestFlow,
    checkIndexes,
  });
}
