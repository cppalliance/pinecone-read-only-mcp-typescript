import { describe, expect, it } from 'vitest';
import {
  countResponseSchema,
  generateUrlsResponseSchema,
  guidedQueryResponseSchema,
  keywordSearchResponseSchema,
  keywordSearchSuccessResponseSchema,
  listNamespacesResponseSchema,
  namespaceRouterResponseSchema,
  queryDocumentsResponseSchema,
  queryResponseSchema,
  queryResultRowSchema,
  querySuccessResponseSchema,
  suggestQueryParamsResponseSchema,
} from './response-schemas.js';

describe('response-schemas', () => {
  it('accepts minimal valid query response', () => {
    expect(
      queryResponseSchema.parse({
        status: 'success',
        mode: 'query_fast',
        query: 'q',
        namespace: 'wg21',
        result_count: 1,
        results: [
          {
            document_id: 'D1',
            paper_number: 'D1',
            title: 'T',
            author: 'A',
            url: '',
            content: 'c',
            score: 0.9,
            reranked: false,
          },
        ],
      })
    ).toBeDefined();
  });

  it('accepts permissive query response with experimental degradation fields only', () => {
    expect(
      queryResponseSchema.parse({
        status: 'success',
        experimental: {
          degraded: true,
          degradation_reason: 'rerank_failed: timeout',
          hybrid_leg_failed: 'dense',
          rerank_skipped_reason: 'no_model',
        },
      })
    ).toBeDefined();
  });

  it('accepts strict query success response with experimental degradation fields', () => {
    expect(
      querySuccessResponseSchema.parse({
        status: 'success',
        mode: 'query_fast',
        query: 'q',
        namespace: 'wg21',
        result_count: 0,
        results: [],
        experimental: {
          degraded: true,
          degradation_reason: 'rerank_failed: timeout',
          hybrid_leg_failed: 'dense',
          rerank_skipped_reason: 'no_model',
        },
      })
    ).toBeDefined();
  });

  it('rejects strict query success response missing stable fields', () => {
    expect(() =>
      querySuccessResponseSchema.parse({
        status: 'success',
        experimental: { degraded: true },
      })
    ).toThrow();
  });

  it('rejects strict keyword search success response missing stable fields', () => {
    expect(() => keywordSearchSuccessResponseSchema.parse({ status: 'success' })).toThrow();
  });

  it('rejects query response missing status', () => {
    expect(() => queryResponseSchema.parse({ results: [] })).toThrow();
  });

  it('accepts guided_query count branch', () => {
    expect(
      guidedQueryResponseSchema.parse({
        status: 'success',
        experimental: {
          decision_trace: {
            cache_hit: false,
            input_namespace: null,
            routed_namespace: 'papers',
            selected_namespace: 'papers',
            ranked_namespaces: [],
            suggested_fields: [],
            suggested_tool: 'count',
            selected_tool: 'count',
            explanation: 'count',
            enrich_urls: true,
            rerank_status: 'skipped',
          },
        },
        result: {
          tool: 'count',
          namespace: 'papers',
          query: 'how many',
          count: 3,
          truncated: false,
        },
      })
    ).toBeDefined();
  });

  it('accepts guided_query query branch with nested experimental on result', () => {
    expect(
      guidedQueryResponseSchema.parse({
        status: 'success',
        experimental: {
          decision_trace: {
            cache_hit: true,
            input_namespace: 'papers',
            routed_namespace: 'papers',
            selected_namespace: 'papers',
            ranked_namespaces: [],
            suggested_fields: ['title'],
            suggested_tool: 'fast',
            selected_tool: 'fast',
            explanation: 'fast',
            enrich_urls: false,
            rerank_status: 'success',
          },
        },
        result: {
          status: 'success',
          mode: 'query_fast',
          query: 'q',
          namespace: 'papers',
          result_count: 0,
          results: [],
          experimental: { hybrid_leg_failed: 'sparse' },
        },
      })
    ).toBeDefined();
  });

  it('validates all nine tool schemas with minimal fixtures', () => {
    expect(
      listNamespacesResponseSchema.parse({
        status: 'success',
        cache_hit: false,
        cache_ttl_seconds: 1800,
        expires_at_iso: '2026-01-01T00:00:00.000Z',
        count: 1,
        namespaces: [{ name: 'wg21', record_count: 1, metadata_fields: { title: 'string' } }],
      })
    ).toBeDefined();

    expect(
      namespaceRouterResponseSchema.parse({
        status: 'success',
        cache_hit: true,
        user_query: 'allocator',
        suggestions: [{ namespace: 'wg21', score: 3, record_count: 1, reasons: ['token'] }],
        recommended_namespace: 'wg21',
      })
    ).toBeDefined();

    expect(
      suggestQueryParamsResponseSchema.parse({
        status: 'success',
        cache_hit: false,
        suggested_fields: ['title'],
        recommended_tool: 'fast',
        use_count_tool: false,
        explanation: 'fast',
        namespace_found: true,
      })
    ).toBeDefined();

    expect(
      countResponseSchema.parse({
        status: 'success',
        count: 5,
        truncated: false,
        namespace: 'wg21',
      })
    ).toBeDefined();

    expect(
      keywordSearchResponseSchema.parse({
        status: 'success',
        query: 'kw',
        namespace: 'wg21',
        result_count: 0,
        results: [],
      })
    ).toBeDefined();

    expect(
      queryDocumentsResponseSchema.parse({
        status: 'success',
        query: 'q',
        namespace: 'wg21',
        result_count: 1,
        documents: [
          {
            document_id: 'D1',
            merged_content: 'text',
            metadata: { title: 'T' },
            chunk_count: 2,
            best_score: 0.8,
          },
        ],
      })
    ).toBeDefined();

    expect(
      generateUrlsResponseSchema.parse({
        status: 'success',
        namespace: 'mailing',
        count: 1,
        results: [
          {
            index: 0,
            url: 'https://example.com',
            method: 'generated.custom',
            reason: null,
            metadata: {},
          },
        ],
      })
    ).toBeDefined();
  });

  it('queryResultRowSchema requires paper_number alias', () => {
    expect(() =>
      queryResultRowSchema.parse({
        document_id: 'D1',
        title: 'T',
        author: 'A',
        url: '',
        content: '',
        score: 1,
        reranked: false,
      })
    ).toThrow();
  });
});
