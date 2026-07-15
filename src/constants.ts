/**
 * Constants for Pinecone Read-Only MCP
 */

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

const SERVER_FEATURES_AND_NOTES = `A semantic search server that provides hybrid search capabilities over Pinecone vector indexes with automatic namespace discovery.

Features:
- Hybrid Search: Combines dense and sparse embeddings for superior recall
- Semantic Reranking: Applied when a rerank model is configured; skipped when none is configured
- Dynamic Namespace Discovery: Automatically discovers available namespaces
- Metadata Filtering: Supports optional metadata filters for refined searches
- Namespace Router: Suggests likely namespace(s) from natural-language intent
- Count: Use the count tool for "how many X?" questions; it uses semantic search only and minimal fields (no content) for performance, returning unique document count.
- URL Generation: Use generate_urls to synthesize URLs for namespaces that have a registered generator when metadata lacks url.
- Document reassembly: Use query_documents to get whole documents (chunks grouped and merged by document_number/doc_id/url) for content analysis or summarization. query_documents reranks when a rerank model is configured.
- Keyword search: Use keyword_search to query the sparse index for lexical/keyword-only retrieval without reranking.
- Multi-Source: When PINECONE_SOURCES or a config file is set, multiple Pinecone projects are available in one server. Use list_sources and pass source on tools; list_namespaces tags each namespace with its source.

Notes:
- Result rows include both \`document_id\` (canonical) and \`paper_number\` (deprecated alias kept for one minor cycle; will be removed in the next major release). Prefer \`document_id\` in new code.`;

/** MCP instructions for {@link setupCoreServer} (nine core tools including guided_query and suggest_query_params). */
export const CORE_SERVER_INSTRUCTIONS = `Quickstart for AI clients: for most user questions, call \`guided_query\` with the user's question — it does namespace routing, suggestion, and execution in one shot and returns \`experimental.decision_trace\` you can show the user. Alternatively call \`list_namespaces\` to discover namespaces, optionally \`namespace_router\` to rank candidates from user intent, then \`query\` (preset fast/detailed/full), \`count\`, \`query_documents\`, \`keyword_search\`, or \`generate_urls\` as needed.

${SERVER_FEATURES_AND_NOTES}

Usage:
1. Prefer guided_query for single-call retrieval (no prerequisite tools).
2. Use list_namespaces (cached) to discover available namespaces in the index. The response includes \`expires_at_iso\` so you know when to refresh.
3. Optionally use namespace_router to choose candidate namespace(s) from user intent.
4. Use count for count questions, \`query\` with the appropriate preset for chunk-level retrieval, query_documents for full-document content, keyword_search for lexical retrieval, or generate_urls when records need synthesized URLs.

Multi-source (when configured): call list_sources, then list_namespaces (all sources unless source is set). Pass source when a namespace may exist on multiple projects. Treat source on results as provenance.`;

/** Alliance-only supplement appended to core instructions for {@link setupAllianceServer}. */
export const ALLIANCE_INSTRUCTIONS_APPENDIX = `

Manual Alliance flow (after list_namespaces):
- Call suggest_query_params before query (preset fast/detailed/full per suggestion), count, or query_documents — mandatory gate unless PINECONE_DISABLE_SUGGEST_FLOW=true
- Use the recommended preset/tool from the suggestion response`;

/** MCP instructions for {@link setupAllianceServer} (core tools plus Alliance tools). */
export const ALLIANCE_SERVER_INSTRUCTIONS =
  CORE_SERVER_INSTRUCTIONS + ALLIANCE_INSTRUCTIONS_APPENDIX;

/**
 * @deprecated Use {@link ALLIANCE_SERVER_INSTRUCTIONS} or {@link CORE_SERVER_INSTRUCTIONS}.
 */
export const SERVER_INSTRUCTIONS = ALLIANCE_SERVER_INSTRUCTIONS;
