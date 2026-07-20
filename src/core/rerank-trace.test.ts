import { describe, expect, it } from 'vitest';
import { SPARSE_LEG_FAILED_REASON } from '../constants.js';
import { guidedRerankStatus } from './rerank-trace.js';
import { makeHybridQueryResult } from './server/tools/test-helpers.js';

describe('guidedRerankStatus', () => {
  it('returns skipped when rerank was not requested', () => {
    expect(guidedRerankStatus(false, makeHybridQueryResult())).toBe('skipped');
  });

  it('returns skipped_no_model when outcome reports no rerank model', () => {
    expect(
      guidedRerankStatus(true, makeHybridQueryResult({ rerank_skipped_reason: 'no_model' }))
    ).toBe('skipped_no_model');
  });

  it('returns failed when rerank degraded without hybrid leg failure', () => {
    expect(
      guidedRerankStatus(
        true,
        makeHybridQueryResult({
          degraded: true,
          degradation_reason: 'rerank_failed: timeout',
        })
      )
    ).toBe('failed');
  });

  it('returns success when degraded from empty-survivor hybrid leg failure', () => {
    expect(
      guidedRerankStatus(
        true,
        makeHybridQueryResult({
          degraded: true,
          degradation_reason: SPARSE_LEG_FAILED_REASON,
          hybrid_leg_failed: 'sparse',
        })
      )
    ).toBe('success');
  });

  it('returns success when rerank was requested and not skipped or failed', () => {
    expect(guidedRerankStatus(true, makeHybridQueryResult())).toBe('success');
  });
});
