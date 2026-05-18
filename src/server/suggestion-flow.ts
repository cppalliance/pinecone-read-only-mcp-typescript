import { getServerConfig } from './config-context.js';
import type { RecommendedTool } from './query-suggestion.js';
import { normalizeNamespace } from './namespace-utils.js';

type FlowState = {
  updatedAt: number;
  recommended_tool: RecommendedTool;
  suggested_fields: string[];
  user_query: string;
};

const stateByNamespace = new Map<string, FlowState>();

/**
 * Evict all entries older than the configured cache TTL.
 * Called on every write so the map stays bounded without a background timer.
 */
function sweepExpired(): void {
  const ttlMs = getServerConfig().cacheTtlMs;
  const now = Date.now();
  for (const [ns, state] of stateByNamespace) {
    if (now - state.updatedAt > ttlMs) {
      stateByNamespace.delete(ns);
    }
  }
}

/** Record that suggest_query_params was called for this namespace (enables query/count for the flow). */
export function markSuggested(namespace: string, state: Omit<FlowState, 'updatedAt'>): void {
  const key = normalizeNamespace(namespace);
  if (!key) {
    throw new Error('markSuggested: namespace must not be empty after trim');
  }
  sweepExpired();
  stateByNamespace.set(key, {
    ...state,
    updatedAt: Date.now(),
  });
}

/**
 * Ensure suggest_query_params was called for this namespace within TTL.
 * Returns the flow state on success, or an error message on failure.
 *
 * When `disableSuggestFlow` is set on the active config, this is a no-op
 * that always succeeds with an empty placeholder flow — operators that turn
 * the safety guard off accept the consequences.
 */
export function requireSuggested(namespace: string):
  | {
      ok: true;
      flow: FlowState;
    }
  | {
      ok: false;
      message: string;
    } {
  const cfg = getServerConfig();
  if (cfg.disableSuggestFlow) {
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

  const key = normalizeNamespace(namespace);
  if (!key) {
    return {
      ok: false,
      message: 'namespace cannot be empty after trimming whitespace.',
    };
  }

  const state = stateByNamespace.get(key);
  if (!state) {
    return {
      ok: false,
      message:
        'Flow requires suggest_query_params first. Call suggest_query_params with namespace and user_query before query/count tools.',
    };
  }

  const now = Date.now();
  if (now - state.updatedAt > cfg.cacheTtlMs) {
    stateByNamespace.delete(key);
    return {
      ok: false,
      message:
        'Previous suggest_query_params context expired. Call suggest_query_params again before query/count tools.',
    };
  }

  return { ok: true, flow: state };
}

/** Clear suggest-flow gate state (used by {@link teardownServer} and tests). */
export function resetSuggestionFlow(): void {
  stateByNamespace.clear();
}
