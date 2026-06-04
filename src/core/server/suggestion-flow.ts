import { getDefaultServerContext } from './server-context.js';
import type { RecommendedTool } from './query-suggestion.js';

type FlowState = {
  updatedAt: number;
  recommended_tool: RecommendedTool;
  suggested_fields: string[];
  user_query: string;
};

/** Record that suggest_query_params was called for this namespace (enables query/count for the flow). */
export function markSuggested(namespace: string, state: Omit<FlowState, 'updatedAt'>): void {
  getDefaultServerContext().markSuggested(namespace, state);
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
  return getDefaultServerContext().requireSuggested(namespace);
}

/** Clear suggest-flow gate state (used by {@link teardownServer} and tests). */
export function resetSuggestionFlow(): void {
  getDefaultServerContext().resetSuggestionFlow();
}
