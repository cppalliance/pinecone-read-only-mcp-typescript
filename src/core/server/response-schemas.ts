/**
 * Zod schemas for MCP tool success responses.
 * Types are derived via `z.infer` — single source of truth for response contracts.
 *
 * Single canonical schema per response type. Handler-boundary schemas define required
 * stable fields. Permissive exports are derived via `.partial()` for `guided_query` union
 * reuse and backward-compatible client validation.
 */

import { z } from 'zod';

/** Pinecone metadata value types: string, number, boolean, or list of strings. */
export const pineconeMetadataValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

export const hybridLegFailedSchema = z.enum(['dense', 'sparse']).nullable();

export const rerankSkippedReasonSchema = z.literal('no_model');

/** One row in query / keyword_search / guided_query query results. */
export const queryResultRowSchema = z.object({
  document_id: z.string().nullable(),
  paper_number: z.string().nullable(),
  title: z.string(),
  author: z.string(),
  url: z.string(),
  content: z.string(),
  score: z.number(),
  reranked: z.boolean(),
  metadata: z.record(z.string(), pineconeMetadataValueSchema).optional(),
});

export type QueryResultRowShape = z.infer<typeof queryResultRowSchema>;

/** Experimental degradation / diagnostic fields for query-shaped responses. */
export const queryExperimentalSchema = z.object({
  degraded: z.boolean().optional(),
  degradation_reason: z.string().optional(),
  hybrid_leg_failed: hybridLegFailedSchema.optional(),
  rerank_skipped_reason: rerankSkippedReasonSchema.optional(),
});

export type QueryExperimental = z.infer<typeof queryExperimentalSchema>;

const rankedNamespaceSchema = z.object({
  namespace: z.string(),
  score: z.number(),
  record_count: z.number(),
  reasons: z.array(z.string()),
});

export const guidedQueryDecisionTraceSchema = z.object({
  cache_hit: z.boolean(),
  input_namespace: z.string().nullable(),
  routed_namespace: z.string().nullable(),
  selected_namespace: z.string(),
  ranked_namespaces: z.array(rankedNamespaceSchema),
  suggested_fields: z.array(z.string()),
  suggested_tool: z.enum(['count', 'fast', 'detailed', 'full']),
  selected_tool: z.enum(['count', 'fast', 'detailed', 'full']),
  explanation: z.string(),
  enrich_urls: z.boolean(),
  rerank_status: z.enum(['success', 'skipped', 'skipped_no_model', 'failed']),
});

export type GuidedQueryDecisionTrace = z.infer<typeof guidedQueryDecisionTraceSchema>;

/** Top-level experimental block for guided_query (decision trace only). */
export const guidedQueryExperimentalSchema = z.object({
  decision_trace: guidedQueryDecisionTraceSchema,
});

/** Handler-boundary schema for `query` / `query_fast` / `query_detailed` success payloads. */
export const querySuccessResponseSchema = z.object({
  status: z.literal('success'),
  mode: z.enum(['query', 'query_fast', 'query_detailed']),
  query: z.string(),
  namespace: z.string(),
  metadata_filter: z.record(z.string(), z.unknown()).optional(),
  result_count: z.number(),
  fields: z.array(z.string()).optional(),
  results: z.array(queryResultRowSchema),
  experimental: queryExperimentalSchema.optional(),
});

export type QuerySuccessResponse = z.infer<typeof querySuccessResponseSchema>;

/** Permissive query shape for `guided_query` union reuse and client-side validation. */
export const queryResponseSchema = querySuccessResponseSchema.partial({
  mode: true,
  query: true,
  namespace: true,
  result_count: true,
  results: true,
});

export type QueryResponse = z.infer<typeof queryResponseSchema>;

export const listNamespacesResponseSchema = z.object({
  status: z.literal('success'),
  cache_hit: z.boolean(),
  cache_ttl_seconds: z.number(),
  expires_at_iso: z.string(),
  count: z.number(),
  namespaces: z.array(
    z.object({
      name: z.string(),
      record_count: z.number(),
      metadata_fields: z.record(z.string(), z.string()),
    })
  ),
});

export type ListNamespacesSuccessResponse = z.infer<typeof listNamespacesResponseSchema>;

export const namespaceRouterResponseSchema = z.object({
  status: z.literal('success'),
  cache_hit: z.boolean(),
  user_query: z.string(),
  suggestions: z.array(rankedNamespaceSchema),
  recommended_namespace: z.string().nullable(),
});

export type NamespaceRouterResponse = z.infer<typeof namespaceRouterResponseSchema>;

export const suggestQueryParamsResponseSchema = z.object({
  status: z.literal('success'),
  cache_hit: z.boolean(),
  suggested_fields: z.array(z.string()),
  use_count_tool: z.boolean(),
  recommended_tool: z.enum(['count', 'fast', 'detailed', 'full']),
  explanation: z.string(),
  namespace_found: z.boolean(),
});

export type SuggestQueryParamsResponse = z.infer<typeof suggestQueryParamsResponseSchema>;

export const countResponseSchema = z.object({
  status: z.literal('success'),
  count: z.number(),
  truncated: z.boolean(),
  namespace: z.string(),
  metadata_filter: z.record(z.string(), z.unknown()).optional(),
});

export type CountResponse = z.infer<typeof countResponseSchema>;

/** Handler-boundary schema for `keyword_search` success payloads. */
export const keywordSearchSuccessResponseSchema = z.object({
  status: z.literal('success'),
  query: z.string(),
  namespace: z.string(),
  index: z.string(),
  metadata_filter: z.record(z.string(), z.unknown()).optional(),
  result_count: z.number(),
  results: z.array(queryResultRowSchema),
  fields: z.array(z.string()).optional(),
});

export type KeywordSearchSuccessResponse = z.infer<typeof keywordSearchSuccessResponseSchema>;

/** Permissive keyword_search shape for client-side validation. */
export const keywordSearchResponseSchema = keywordSearchSuccessResponseSchema.partial({
  query: true,
  namespace: true,
  index: true,
  result_count: true,
  results: true,
});

/** @deprecated Import from `response-schemas` / package root; alias kept for one minor cycle. */
export type KeywordSearchResponse = z.infer<typeof keywordSearchResponseSchema>;

const queryDocumentRowSchema = z.object({
  document_id: z.string(),
  merged_content: z.string(),
  metadata: z.record(z.string(), pineconeMetadataValueSchema),
  chunk_count: z.number(),
  best_score: z.number(),
});

export const queryDocumentsResponseSchema = z.object({
  status: z.literal('success'),
  query: z.string(),
  namespace: z.string(),
  metadata_filter: z.record(z.string(), z.unknown()).optional(),
  result_count: z.number(),
  documents: z.array(queryDocumentRowSchema),
  experimental: queryExperimentalSchema.optional(),
});

export type QueryDocumentsResponse = z.infer<typeof queryDocumentsResponseSchema>;

export const guidedCountResultSchema = z.object({
  tool: z.literal('count'),
  namespace: z.string(),
  query: z.string(),
  metadata_filter: z.record(z.string(), z.unknown()).optional(),
  count: z.number(),
  truncated: z.boolean(),
});

export const guidedQueryResultSchema = z.union([guidedCountResultSchema, queryResponseSchema]);

export const guidedQueryResponseSchema = z.object({
  status: z.literal('success'),
  result: guidedQueryResultSchema,
  experimental: guidedQueryExperimentalSchema.optional(),
});

export type GuidedQueryResponse = z.infer<typeof guidedQueryResponseSchema>;

const urlMethodSchema = z.enum([
  'metadata.url',
  'metadata.source',
  'generated.mailing',
  'generated.slack',
  'generated.custom',
  'unavailable',
]);

export const generateUrlsResponseSchema = z.object({
  status: z.literal('success'),
  namespace: z.string(),
  count: z.number(),
  results: z.array(
    z.object({
      index: z.number(),
      url: z.string().nullable(),
      method: urlMethodSchema,
      reason: z.string().nullable(),
      metadata: z.record(z.string(), z.unknown()),
    })
  ),
});

export type GenerateUrlsResponse = z.infer<typeof generateUrlsResponseSchema>;

/**
 * Assemble optional `experimental` block for query-shaped tool responses.
 * Omits the key entirely when no experimental fields are present.
 */
export function buildQueryExperimental(outcome: {
  degraded: boolean;
  degradation_reason?: string;
  hybrid_leg_failed: 'dense' | 'sparse' | null;
  rerank_skipped_reason?: 'no_model';
}): { experimental?: QueryExperimental } {
  const experimental: QueryExperimental = {};

  if (outcome.degraded === true) {
    experimental.degraded = true;
  }
  if (outcome.degradation_reason !== undefined) {
    experimental.degradation_reason = outcome.degradation_reason;
  }
  if (outcome.hybrid_leg_failed === 'dense' || outcome.hybrid_leg_failed === 'sparse') {
    experimental.hybrid_leg_failed = outcome.hybrid_leg_failed;
  }
  if (outcome.rerank_skipped_reason !== undefined) {
    experimental.rerank_skipped_reason = outcome.rerank_skipped_reason;
  }

  if (Object.keys(experimental).length === 0) {
    return {};
  }

  return { experimental };
}

/** Assemble `experimental.decision_trace` for guided_query responses. */
export function buildGuidedQueryExperimental(decision_trace: GuidedQueryDecisionTrace): {
  experimental: z.infer<typeof guidedQueryExperimentalSchema>;
} {
  return { experimental: { decision_trace } };
}
