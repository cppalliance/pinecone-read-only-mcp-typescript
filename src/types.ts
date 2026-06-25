/**
 * Types for Pinecone Read-Only MCP
 */

/** Pinecone metadata value types: string, number, boolean, or list of strings */
export type PineconeMetadataValue = string | number | boolean | string[];

/**
 * Configuration for `new PineconeClient(config)`.
 *
 * `apiKey` and `indexName` are required via {@link resolveConfig} (env, CLI, or overrides).
 * `rerankModel` is optional — omit to disable reranking. Alliance {@link resolveAllianceConfig} supplies a default rerank model when unset.
 * Values are expected to come from a resolved {@link ServerConfigBase} (or branded
 * {@link CoreServerConfig} / {@link AllianceServerConfig}) — `PineconeClient`
 * does not read `process.env` directly.
 */
export interface PineconeClientConfig {
  apiKey: string;
  /** Dense (hybrid) index name. Required. */
  indexName: string;
  /** Sparse index name. Defaults to `${indexName}-sparse`. */
  sparseIndexName?: string;
  /** Reranker model identifier. When unset, reranking is disabled. */
  rerankModel?: string;
  /** Default top-k for `query()`. */
  defaultTopK?: number;
  /** Per-call timeout (ms) for outbound Pinecone requests. */
  requestTimeoutMs?: number;
}

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, PineconeMetadataValue>;
  reranked: boolean;
}

/** Which hybrid leg failed when the other produced hits (partial hybrid success). */
export type HybridLegFailed = 'dense' | 'sparse' | null;

/**
 * Outcome of {@link PineconeClient.query}: result rows plus degradation signals for MCP clients.
 */
/** Why semantic rerank was not applied despite `useReranking: true`. */
export type RerankSkippedReason = 'no_model';

export interface HybridQueryResult {
  results: SearchResult[];
  /** True when reranking was attempted and failed (rows may have `reranked: false`). */
  degraded: boolean;
  /** Present when {@link degraded} is true; suitable for LLM-facing tool output. */
  degradation_reason?: string;
  /** Set when exactly one of dense/sparse search failed but the other succeeded. */
  hybrid_leg_failed: HybridLegFailed;
  /**
   * Set when `useReranking` was true but no rerank model is configured on the client
   * (manual `PineconeClient` without `rerankModel`). Normal MCP/CLI use sets a model via {@link resolveConfig}.
   */
  rerank_skipped_reason?: RerankSkippedReason;
}

export interface PineconeHit {
  _id: string;
  _score: number;
  fields: Record<string, PineconeMetadataValue>;
}

export interface PineconeSearchResponse {
  result?: {
    hits?: PineconeHit[];
  };
}

export interface NamespaceStats {
  namespaces?: Record<string, unknown>;
}

export interface QueryParams {
  query: string;
  topK?: number;
  namespace: string;
  metadataFilter?: Record<string, unknown>;
  useReranking?: boolean;
  /** If set, only these fields are requested from Pinecone (e.g. ["document_number", "title", "url"]). Omit for all fields. Include "chunk_text" for content. */
  fields?: string[];
}

/** Parameters for count-only requests (high top_k, no reranking). */
export interface CountParams {
  query: string;
  namespace: string;
  metadataFilter?: Record<string, unknown>;
}

/** Parameters for keyword (sparse-only) search against the dedicated sparse index. */
export interface KeywordSearchParams {
  query: string;
  namespace: string;
  topK?: number;
  metadataFilter?: Record<string, unknown>;
  /** If set, only these fields are returned. Omit for all fields. */
  fields?: string[];
}

/** Result of a count request: unique document count (deduped by doc id/url); truncated when at least COUNT_TOP_K. */
export interface CountResult {
  count: number;
  truncated: boolean;
}

export interface ListNamespacesResponse {
  status: 'success' | 'error';
  namespaces?: string[];
  count?: number;
  message?: string;
}

/** Outcome of listing namespaces on the sparse (keyword) index. */
export type KeywordIndexNamespacesResult =
  | { ok: true; namespaces: Array<{ namespace: string; recordCount: number }> }
  | { ok: false; error: string };

export type {
  QueryResultRowShape,
  QueryResponse,
  QuerySuccessResponse,
  KeywordSearchResponse,
  KeywordSearchSuccessResponse,
} from './core/server/response-schemas.js';

/** Internal merged hit shape before rerank (dense + sparse deduped). */
export interface MergedHit {
  _id: string;
  _score: number;
  chunk_text: string;
  metadata: Record<string, PineconeMetadataValue>;
}

/**
 * Handle for a specific namespace, returned by SearchableIndex.namespace().
 * Carries the legacy query() path (vector-based metadata sampling) and the
 * backward-compatible searchRecords() fallback.
 */
export interface NamespaceHandle {
  query?(opts: { topK: number; vector: number[]; includeMetadata: boolean }): Promise<{
    matches?: Array<{ metadata?: Record<string, unknown> }>;
  }>;
  searchRecords?(params: {
    query: Record<string, unknown>;
  }): Promise<{ result?: { hits?: PineconeHit[] } }>;
}

/**
 * Minimal top-level index interface for hybrid search (dense/sparse) and namespace discovery.
 * Methods are optional because the object is obtained via an `as unknown as` cast from the
 * Pinecone SDK, whose concrete shape can vary across SDK versions.
 */
export interface SearchableIndex {
  describeIndexStats?(): Promise<{
    dimension?: number;
    namespaces?: Record<string, { recordCount?: number }>;
  }>;
  search?(opts: {
    namespace?: string;
    query: Record<string, unknown>;
    fields?: string[];
  }): Promise<{ result?: { hits?: PineconeHit[] } }>;
  /** Return a namespace-scoped handle for metadata sampling or legacy record queries. */
  namespace?(name: string): NamespaceHandle;
  /** Backward-compatible fallback when the SDK exposes searchRecords on the top-level index. */
  searchRecords?(params: {
    query: Record<string, unknown>;
  }): Promise<{ result?: { hits?: PineconeHit[] } }>;
}
