/**
 * Alliance config resolver: applies C++ Alliance deployment defaults, then delegates to core {@link resolveConfig}.
 */

import {
  asBool,
  brandAllianceConfig,
  resolveConfig,
  trimOptional,
  type AllianceServerConfig,
  type ConfigOverrides,
} from '../core/config.js';
import type { ParseSourcesOptions } from '../core/server/source-config.js';

/** C++ Alliance default dense index when env/CLI omit `PINECONE_INDEX_NAME`. */
export const ALLIANCE_DEFAULT_INDEX_NAME = 'rag-hybrid';

/** C++ Alliance default rerank model when env/CLI omit `PINECONE_RERANK_MODEL`. */
export const ALLIANCE_DEFAULT_RERANK_MODEL = 'bge-reranker-v2-m3';

/** @deprecated Use {@link ALLIANCE_DEFAULT_RERANK_MODEL}. */
export const DEFAULT_ALLIANCE_RERANK_MODEL = ALLIANCE_DEFAULT_RERANK_MODEL;

/**
 * Build {@link AllianceServerConfig} for Alliance CLI and `setupAllianceServer`.
 * Fills index and rerank from Alliance defaults when unset, then calls core `resolveConfig`.
 *
 * **Suggest-flow gate default:** After core resolution, `disableSuggestFlow` is overridden to
 * `false` (gate on) unless `PINECONE_DISABLE_SUGGEST_FLOW` or `disableSuggestFlow` in overrides
 * says otherwise. This differs from package-root {@link resolveConfig} (`true` / gate off).
 * Switching between core and Alliance entry points changes query gate behavior — use
 * `guided_query` (available in both) for ceremony-free retrieval, or call
 * `suggest_query_params` before gated tools when the gate is on.
 *
 * Output is the `config` half of the embedder pattern `{ config, composition }`.
 * Pair with {@link createIsolatedContext} or {@link createServer} and an optional
 * {@link ServerContextComposition} for per-instance injectables.
 */
export function resolveAllianceConfig(
  overrides: ConfigOverrides = {},
  env: NodeJS.ProcessEnv = process.env
): AllianceServerConfig {
  const indexName =
    trimOptional(overrides.indexName) ??
    trimOptional(env['PINECONE_INDEX_NAME']) ??
    ALLIANCE_DEFAULT_INDEX_NAME;
  const rerankModel =
    trimOptional(overrides.rerankModel) ??
    trimOptional(env['PINECONE_RERANK_MODEL']) ??
    ALLIANCE_DEFAULT_RERANK_MODEL;
  const allianceParseOptions: ParseSourcesOptions = {
    allianceDefaults: {
      indexName: ALLIANCE_DEFAULT_INDEX_NAME,
      rerankModel: ALLIANCE_DEFAULT_RERANK_MODEL,
    },
  };
  const cfg = resolveConfig(
    { ...overrides, indexName, rerankModel },
    env,
    allianceParseOptions
  );
  const disableSuggestFlow =
    overrides.disableSuggestFlow ?? asBool(env['PINECONE_DISABLE_SUGGEST_FLOW'], false);
  return brandAllianceConfig({ ...cfg, disableSuggestFlow });
}

export type { AllianceServerConfig } from '../core/config.js';
