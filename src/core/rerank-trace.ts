import type { HybridQueryResult } from '../types.js';

export type GuidedRerankStatus = 'success' | 'skipped' | 'skipped_no_model' | 'failed';

/** Map hybrid query outcome to guided_query `decision_trace.rerank_status`. */
export function guidedRerankStatus(
  requestedRerank: boolean,
  outcome: HybridQueryResult
): GuidedRerankStatus {
  if (!requestedRerank) {
    return 'skipped';
  }
  if (outcome.rerank_skipped_reason === 'no_model') {
    return 'skipped_no_model';
  }
  if (outcome.degraded && outcome.hybrid_leg_failed === null) {
    return 'failed';
  }
  return 'success';
}
