/**
 * Alliance config resolver: applies C++ Alliance deployment defaults, then delegates to core {@link resolveConfig}.
 */

import {
  asBool,
  resolveConfig,
  trimOptional,
  type ConfigOverrides,
  type ServerConfig,
} from '../core/config.js';

/** C++ Alliance default dense index when env/CLI omit `PINECONE_INDEX_NAME`. */
export const ALLIANCE_DEFAULT_INDEX_NAME = 'rag-hybrid';

/** C++ Alliance default rerank model when env/CLI omit `PINECONE_RERANK_MODEL`. */
export const ALLIANCE_DEFAULT_RERANK_MODEL = 'bge-reranker-v2-m3';

/** @deprecated Use {@link ALLIANCE_DEFAULT_RERANK_MODEL}. */
export const DEFAULT_ALLIANCE_RERANK_MODEL = ALLIANCE_DEFAULT_RERANK_MODEL;

/**
 * Build {@link ServerConfig} for Alliance CLI and `setupAllianceServer`.
 * Fills index and rerank from Alliance defaults when unset, then calls core `resolveConfig`.
 */
export function resolveAllianceConfig(
  overrides: ConfigOverrides = {},
  env: NodeJS.ProcessEnv = process.env
): ServerConfig {
  const indexName =
    trimOptional(overrides.indexName) ??
    trimOptional(env['PINECONE_INDEX_NAME']) ??
    ALLIANCE_DEFAULT_INDEX_NAME;
  const rerankModel =
    trimOptional(overrides.rerankModel) ??
    trimOptional(env['PINECONE_RERANK_MODEL']) ??
    ALLIANCE_DEFAULT_RERANK_MODEL;
  const cfg = resolveConfig({ ...overrides, indexName, rerankModel }, env);
  const disableSuggestFlow =
    overrides.disableSuggestFlow ?? asBool(env['PINECONE_DISABLE_SUGGEST_FLOW'], false);
  return { ...cfg, disableSuggestFlow };
}
