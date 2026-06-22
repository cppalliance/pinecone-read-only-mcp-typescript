import { warnLegacyFacade } from './legacy-facade-warn.js';
import { resolveDefaultServerContext } from './server-context.js';
import type { RecommendedTool } from './query-suggestion.js';

type FlowState = {
  updatedAt: number;
  recommended_tool: RecommendedTool;
  suggested_fields: string[];
  user_query: string;
};

/**
 * Record that suggest_query_params was called for this namespace (enables query/count for the flow).
 *
 * @deprecated since 0.3.0 — removal no earlier than 0.5.0. Legacy module facade. Use
 * {@link ServerContext.markSuggested} on a {@link ServerContext} from {@link createServer}
 * instead. See docs/MIGRATION.md#030-legacy-module-facade-deprecations.
 * @see ServerContext.markSuggested
 */
export function markSuggested(namespace: string, state: Omit<FlowState, 'updatedAt'>): void {
  warnLegacyFacade('markSuggested');
  resolveDefaultServerContext().markSuggested(namespace, state);
}

/**
 * Ensure suggest_query_params was called for this namespace within TTL.
 * Returns the flow state on success, or an error message on failure.
 *
 * When `disableSuggestFlow` is set on the active config, this is a no-op
 * that always succeeds with an empty placeholder flow — operators that turn
 * the safety guard off accept the consequences.
 *
 * @deprecated since 0.3.0 — removal no earlier than 0.5.0. Legacy module facade. Use
 * {@link ServerContext.requireSuggested} on a {@link ServerContext} from {@link createServer}
 * instead. See docs/MIGRATION.md#030-legacy-module-facade-deprecations.
 * @see ServerContext.requireSuggested
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
  warnLegacyFacade('requireSuggested');
  return resolveDefaultServerContext().requireSuggested(namespace);
}

/**
 * Clear suggest-flow gate state (used by {@link teardownServer} and tests).
 *
 * @deprecated since 0.3.0 — removal no earlier than 0.5.0. Legacy module facade. Use
 * {@link ServerContext.resetSuggestionFlow} on a {@link ServerContext} from {@link createServer}
 * instead. See docs/MIGRATION.md#030-legacy-module-facade-deprecations.
 * @see ServerContext.resetSuggestionFlow
 */
export function resetSuggestionFlow(): void {
  warnLegacyFacade('resetSuggestionFlow');
  resolveDefaultServerContext().resetSuggestionFlow();
}
