/**
 * Alliance entry re-exports core config. Rerank default lives in {@link resolveConfig}
 * (`PINECONE_RERANK_MODEL` when set, else `bge-reranker-v2-m3`).
 */

import {
  DEFAULT_RERANK_MODEL,
  resolveConfig,
  type ConfigOverrides,
  type ServerConfig,
} from '../core/config.js';

/** @deprecated Use {@link DEFAULT_RERANK_MODEL} from core config. */
export const DEFAULT_ALLIANCE_RERANK_MODEL = DEFAULT_RERANK_MODEL;

/** @deprecated No-op; {@link resolveConfig} already applies the rerank default. */
export function applyAllianceRerankDefault(config: ServerConfig): ServerConfig {
  return config;
}

/** Alias for {@link resolveConfig} (Alliance CLI and `setupAllianceServer`). */
export function resolveAllianceConfig(
  overrides: ConfigOverrides = {},
  env: NodeJS.ProcessEnv = process.env
): ServerConfig {
  return resolveConfig(overrides, env);
}
