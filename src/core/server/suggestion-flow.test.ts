import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markSuggested, requireSuggested, resetSuggestionFlow } from './suggestion-flow.js';
import { createServer, teardownDefaultServerContext } from './server-context.js';
import { resolveTestConfig } from './tools/test-helpers.js';

describe('suggestion-flow facade (default ServerContext)', () => {
  beforeEach(() => {
    teardownDefaultServerContext();
    createServer(resolveTestConfig({ disableSuggestFlow: false, cacheTtlSeconds: 1 }));
  });

  afterEach(() => {
    teardownDefaultServerContext();
    vi.useRealTimers();
  });

  it('markSuggested then requireSuggested succeeds', () => {
    markSuggested('wg21', {
      recommended_tool: 'fast',
      suggested_fields: ['title'],
      user_query: 'contracts',
    });
    const check = requireSuggested('wg21');
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.flow.user_query).toBe('contracts');
      expect(check.flow.recommended_tool).toBe('fast');
    }
  });

  it('requireSuggested fails when namespace was never suggested', () => {
    const check = requireSuggested('wg21');
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.message).toMatch(/suggest_query_params first/);
    }
  });

  it('requireSuggested fails after TTL expiry', () => {
    vi.useFakeTimers();
    markSuggested('wg21', {
      recommended_tool: 'detailed',
      suggested_fields: ['chunk_text'],
      user_query: 'q',
    });
    vi.advanceTimersByTime(2000);
    const check = requireSuggested('wg21');
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.message).toMatch(/expired/);
    }
  });

  it('requireSuggested bypasses gate when disableSuggestFlow is true', () => {
    teardownDefaultServerContext();
    createServer(resolveTestConfig({ disableSuggestFlow: true, cacheTtlSeconds: 1 }));
    const check = requireSuggested('wg21');
    expect(check.ok).toBe(true);
  });

  it('resetSuggestionFlow clears prior suggestion state', () => {
    markSuggested('wg21', {
      recommended_tool: 'count',
      suggested_fields: [],
      user_query: 'how many',
    });
    expect(requireSuggested('wg21').ok).toBe(true);
    resetSuggestionFlow();
    expect(requireSuggested('wg21').ok).toBe(false);
  });
});
