/**
 * Shared runtime config types and resolver.
 *
 * `ServerConfig` is the single source of truth flowed from `parseCli()` →
 * `setupCoreServer(config)` / `setupAllianceServer(config)` → every collaborator.
 * Modules MUST NOT read `process.env` directly anymore — they receive their slice of the config.
 */

import { DEFAULT_TOP_K, FLOW_CACHE_TTL_MS } from '../constants.js';

/** Allowed log levels, in ascending severity. */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/** Allowed log output formats. */
export type LogFormat = 'text' | 'json';

/**
 * Unified runtime configuration for the MCP server.
 *
 * Built once by `parseCli()` (or constructed directly by library consumers)
 * and threaded through setup. `apiKey` and `indexName` are required.
 */
export interface ServerConfig {
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
  /** When true, the suggest_query_params flow gate is bypassed. */
  disableSuggestFlow: boolean;
  /** When true, on-startup probe verifies dense + sparse indexes exist. */
  checkIndexes: boolean;
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
 * Build a `ServerConfig` from CLI overrides, environment variables, and defaults.
 * CLI > env > default precedence is preserved.
 *
 * @throws Error when no API key or index name is provided.
 */
export function resolveConfig(
  overrides: ConfigOverrides,
  env: NodeJS.ProcessEnv = process.env
): ServerConfig {
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

  return {
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
  };
}
