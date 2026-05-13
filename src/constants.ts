/**
 * Constants for Pinecone Read-Only MCP
 */

export const DEFAULT_INDEX_NAME = 'rag-hybrid';
export const DEFAULT_RERANK_MODEL = 'bge-reranker-v2-m3';
export const DEFAULT_TOP_K = 10;
export const MAX_TOP_K = 100;
export const MIN_TOP_K = 1;
/** Namespace and suggestion caches stay valid for 30 minutes. */
export const FLOW_CACHE_TTL_MS = 30 * 60 * 1000;
/**
 * Maximum hits fetched by the count tool to deduplicate into a document count.
 * When the matching set exceeds this limit the count is capped; callers should
 * check the `truncated: true` flag in the response to detect this condition.
 */
export const COUNT_TOP_K = 10_000;
/**
 * Minimal fields fetched for count queries (no `chunk_text`) to reduce payload and cost.
 * All three fields are tried as deduplication keys in priority order:
 *   1. `document_number` — canonical document identifier used by most namespaces
 *   2. `url`            — used as a fallback document key when document_number is absent
 *   3. `doc_id`         — secondary fallback for namespaces that use a doc_id scheme
 */
export const COUNT_FIELDS = ['document_number', 'url', 'doc_id'] as const;
/** Default lightweight field set for fast queries. */
export const FAST_QUERY_FIELDS = ['document_number', 'title', 'url', 'author', 'doc_id'] as const;
/** query_documents: default and max number of documents to return (reassembled from chunks). */
export const DEFAULT_QUERY_DOCUMENTS_TOP_K = 5;
export const MAX_QUERY_DOCUMENTS_TOP_K = 20;
/** Max chunk hits to fetch when reassembling documents (then group by document). */
export const QUERY_DOCUMENTS_MAX_CHUNKS = 500;

export const SERVER_NAME = 'Pinecone Read-Only MCP';
export { SERVER_VERSION } from './server-version.js';

export const SERVER_INSTRUCTIONS = `Quickstart for AI clients: for most user questions, call \`guided_query\` with the user's question — it does namespace routing, suggestion, and execution in one shot and returns a decision_trace you can show the user. For manual flows, call \`list_namespaces\` -> \`suggest_query_params\` -> \`query\` (use preset fast/detailed/full per suggestion) or \`count\` (the suggest step is a mandatory gate). Use \`query_documents\` for full-document reading, \`keyword_search\` for exact-keyword retrieval against the sparse index, and \`generate_urls\` when records need URLs synthesized from metadata.

A semantic search server that provides hybrid search capabilities over Pinecone vector indexes with automatic namespace discovery.

Features:
- Hybrid Search: Combines dense and sparse embeddings for superior recall
- Semantic Reranking: Uses a configurable reranker model (default bge-reranker-v2-m3) for improved precision
- Dynamic Namespace Discovery: Automatically discovers available namespaces
- Metadata Filtering: Supports optional metadata filters for refined searches
- Namespace Router: Suggests likely namespace(s) from natural-language intent
- Count: Use the count tool for "how many X?" questions; it uses semantic search only and minimal fields (no content) for performance, returning unique document count.
- URL Generation: Use generate_urls to synthesize URLs for namespaces that have a registered generator when metadata lacks url.
- Document reassembly: Use query_documents to get whole documents (chunks grouped and merged by document_number/doc_id/url) for content analysis or summarization. query_documents always reranks for best document-level relevance.
- Keyword search: Use keyword_search to query the sparse index for lexical/keyword-only retrieval without reranking.

Usage:
1. Use list_namespaces (cached) to discover available namespaces in the index. The response includes \`expires_at_iso\` so you know when to refresh.
2. Optionally use namespace_router to choose candidate namespace(s) from user intent.
3. Call suggest_query_params before query/count/query_documents tools (mandatory flow gate) to get suggested_fields and recommended_tool.
4. Use count for count questions, \`query\` with the appropriate preset for chunk-level retrieval, or query_documents for full-document content.

Notes:
- Result rows include both \`document_id\` (canonical) and \`paper_number\` (deprecated alias kept for one minor cycle; will be removed in the next major release). Prefer \`document_id\` in new code.
- The server emits structured logs to stderr (text by default, set PINECONE_READ_ONLY_MCP_LOG_FORMAT=json for log aggregation).`;
