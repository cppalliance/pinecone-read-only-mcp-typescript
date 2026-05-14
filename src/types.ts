/**
 * Types for Pinecone Read-Only MCP
 */

/** Pinecone metadata value types: string, number, boolean, or list of strings */
export type PineconeMetadataValue = string | number | boolean | string[];

/**
 * Configuration for `new PineconeClient(config)`.
 *
 * `apiKey` is required. All other fields are optional and fall back to
 * sensible defaults; library consumers usually pass these through from
 * `ServerConfig`.
 */
export interface PineconeClientConfig {
  apiKey: string;
  /** Dense (hybrid) index name. */
  indexName?: string;
  /** Sparse index name. Defaults to `${indexName}-sparse`. */
  sparseIndexName?: string;
  /** Reranker model identifier. */
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

/**
 * One row in a query response.
 *
 * `document_id` is the canonical identifier going forward. `paper_number`
 * is kept as a deprecated alias for one minor cycle so existing clients
 * keep working — it is removed in the next major release.
 */
export interface QueryResultRowShape {
  /**
   * Canonical document identifier (derived from `document_number` or
   * `filename` metadata). Use this for new code.
   */
  document_id: string | null;
  /**
   * @deprecated Use `document_id`. Kept for one minor cycle and will be
   * removed in the next major release.
   */
  paper_number: string | null;
  title: string;
  author: string;
  url: string;
  content: string;
  score: number;
  reranked: boolean;
  metadata?: Record<string, PineconeMetadataValue>;
}

/** Outcome of listing namespaces on the sparse (keyword) index. */
export type KeywordIndexNamespacesResult =
  | { ok: true; namespaces: Array<{ namespace: string; recordCount: number }> }
  | { ok: false; error: string };

export interface QueryResponse {
  status: 'success' | 'error';
  mode?: 'query' | 'query_fast' | 'query_detailed';
  query?: string;
  namespace?: string;
  metadata_filter?: Record<string, unknown>;
  result_count?: number;
  /** Present when the query requested specific fields. */
  fields?: string[];
  results?: QueryResultRowShape[];
  message?: string;
}

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
