/**
 * Alliance-layer configuration: wraps {@link resolveConfig} with deployment defaults
 * that must not live in the generic core package.
 */

import { resolveConfig, type ConfigOverrides, type ServerConfig } from '../core/config.js';

/** Default Pinecone inference rerank model for C++ Alliance deployments (CLI / alliance entry). */
export const DEFAULT_ALLIANCE_RERANK_MODEL = 'bge-reranker-v2-m3';

/**
 * Apply the Alliance rerank default when no model was provided via env or overrides.
 * Core {@link resolveConfig} intentionally leaves `rerankModel` unset so generic adopters
 * do not silently use an Alliance-specific model name.
 */
export function applyAllianceRerankDefault(config: ServerConfig): ServerConfig {
  if (config.rerankModel !== undefined) {
    return config;
  }
  return { ...config, rerankModel: DEFAULT_ALLIANCE_RERANK_MODEL };
}

/**
 * Build {@link ServerConfig} for the full Alliance MCP surface (CLI and `setupAllianceServer`).
 * Same requirements as core (`apiKey`, `indexName`); supplies {@link DEFAULT_ALLIANCE_RERANK_MODEL}
 * when `PINECONE_RERANK_MODEL` and `rerankModel` overrides are absent.
 */
export function resolveAllianceConfig(
  overrides: ConfigOverrides = {},
  env: NodeJS.ProcessEnv = process.env
): ServerConfig {
  return applyAllianceRerankDefault(resolveConfig(overrides, env));
}
