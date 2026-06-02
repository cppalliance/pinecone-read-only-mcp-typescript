# MCP tools reference

Unless noted, failures return MCP `isError: true` with JSON matching `ToolError` (see [MIGRATION.md](./MIGRATION.md) and [README error table](../README.md#error-responses)).

## Core vs Alliance tool surface

| Setup | Tools | MCP instructions |
| ----- | ----- | ------------------ |
| `setupCoreServer` (package root) | **7:** `list_namespaces`, `namespace_router`, `count`, `query`, `keyword_search`, `query_documents`, `generate_urls` | `CORE_SERVER_INSTRUCTIONS` — no `guided_query` or `suggest_query_params` |
| `setupAllianceServer` / published CLI | **9:** core tools plus `suggest_query_params`, `guided_query` | `ALLIANCE_SERVER_INSTRUCTIONS` — includes guided/suggest quickstart |

## Suggest-flow gate

When **`disableSuggestFlow`** is **`false`** (Alliance default via `resolveAllianceConfig` / CLI), tools **`query`**, **`count`**, and **`query_documents`** require a prior successful **`suggest_query_params`** call for the **same namespace string** within the cache TTL (see `PINECONE_CACHE_TTL_SECONDS`). The gate is in-process memory (`requireSuggested`).

When **`disableSuggestFlow`** is **`true`** (core default via `resolveConfig`), the gate is bypassed — suitable for `setupCoreServer` embedders that do not register `suggest_query_params`.

**Namespace consistency:** use the **exact same** `namespace` value (including trimming — avoid leading/trailing spaces in one call and not the other) for `suggest_query_params` and downstream gated tools. Mismatches yield `FLOW_GATE` with a suggestion to call `suggest_query_params` first.

**Core:** gate off by default; set `PINECONE_DISABLE_SUGGEST_FLOW=false` or `disableSuggestFlow: false` to enable the gate. **Alliance:** gate on by default; set `PINECONE_DISABLE_SUGGEST_FLOW=true` or CLI `--disable-suggest-flow` to bypass (not recommended for production).

---

## 1. `list_namespaces`

**Purpose:** Discover namespaces, metadata field names, and record counts. Results are cached (~30 minutes; see response `expires_at_iso`).

| | |
| --- | --- |
| **Input** | _(empty object)_ |
| **Success** | `{ status: 'success', cache_hit, cache_ttl_seconds, expires_at_iso, count, namespaces: [{ name, record_count, metadata_fields }] }` |
| **Errors** | `PINECONE_ERROR`, `TIMEOUT`, etc. |

**Example (conceptual MCP params):**

```json
{}
```

---

## 2. `namespace_router`

**Purpose:** Rank candidate namespaces from natural-language intent (optional step before `suggest_query_params`).

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `user_query` | string | yes | User question / intent |
| `top_n` | int | no (default 3) | Max suggestions, 1–5 |

**Success:** `{ status: 'success', cache_hit, user_query, suggestions, recommended_namespace }`.

**Example:**

```json
{ "user_query": "Where is the allocator documented?", "top_n": 3 }
```

---

## 3. `suggest_query_params`

**Purpose:** Mandatory gate before `query` / `count` / `query_documents`. Returns field hints and `recommended_tool`.

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `namespace` | string | yes | Target namespace (must exist in cached `list_namespaces`) |
| `user_query` | string | yes | Natural-language task |

**Success:** `{ status: 'success', cache_hit, ...suggestQueryParams fields including suggested_fields, recommended_tool, use_count_tool, explanation, namespace_found }`.

**Example:**

```json
{
  "namespace": "mailing",
  "user_query": "Summarize discussions about coroutines from last month"
}
```

---

## 4. `count`

**Purpose:** Semantic count of **unique documents** (dedupe by `document_number` / `url` / `doc_id`). Requires suggest-flow.

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `namespace` | string | yes | Namespace |
| `query_text` | string | yes | Query text (use broad text like `"document"` for metadata-only counts) |
| `metadata_filter` | object | no | Pinecone metadata filter |

**Success:** `{ status: 'success', count, truncated, namespace, metadata_filter? }`.

---

## 5. `query`

**Purpose:** Hybrid dense+sparse retrieval with optional reranking. Requires suggest-flow.

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `query_text` | string | yes | Search text |
| `namespace` | string | yes | Namespace |
| `top_k` | int | no (default 10) | 1–100 |
| `preset` | `"fast"` \| `"detailed"` \| `"full"` | no (default `"full"`) | `fast`: no rerank + light fields; `detailed` / `full`: reranking (see Zod in source) |
| `use_reranking` | boolean | no | When preset allows reranking |
| `metadata_filter` | object | no | Metadata filter |
| `fields` | string[] | no | Pinecone fields to return |

**Success (`QueryResponse`):** `{ status: 'success', mode?: 'query' \| 'query_fast' \| 'query_detailed', query, namespace, metadata_filter?, result_count, results[], fields?, degraded?, degradation_reason?, hybrid_leg_failed? }`.

Each row: `document_id`, `paper_number` (deprecated alias), `title`, `author`, `url`, `content`, `score`, `reranked`, optional `metadata`.

**Example:**

```json
{
  "query_text": "exception safety guarantees",
  "namespace": "mailing",
  "preset": "detailed",
  "top_k": 8
}
```

### Rerank and hybrid degradation

When reranking is requested but the rerank API fails, the server still returns **`status: 'success'`** with rows where `reranked: false`, plus envelope fields:

| Field | When set | Meaning |
| ----- | -------- | ------- |
| `degraded` | `true` | Rerank was attempted and failed (or another degradation path fired) |
| `degradation_reason` | string | Human-readable detail for MCP/LLM clients (e.g. `rerank_failed: timeout after 5000ms`) |
| `hybrid_leg_failed` | `'dense'` \| `'sparse'` \| omitted / `null` | Exactly one hybrid search leg failed while the other returned hits |

Treat **`degraded: true`** as lower confidence even when `status` is `success`. Combine with per-row `reranked`, `preset`, and `use_reranking`. Structured stderr logs may include additional detail.

`query_documents` propagates the same flags on its nested query payload when applicable.

---

## 6. `keyword_search`

**Purpose:** Lexical / sparse-index search only (no hybrid merge, no rerank). **Does not** require `suggest_query_params`.

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `query_text` | string | yes | Keyword-style query |
| `namespace` | string | yes | Namespace |
| `top_k` | int | no | 1–100 |
| `metadata_filter` | object | no | Filter |
| `fields` | string[] | no | Returned fields |

**Success:** Similar row shape to `query` (`KeywordSearchResponse`).

---

## 7. `query_documents`

**Purpose:** Fetch chunks, rerank, **reassemble** whole documents (merge chunk text). Requires suggest-flow.

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `query_text` | string | yes | Query |
| `namespace` | string | yes | Namespace |
| `top_k` | int | no | Documents to return (see constants, default 5, max 20) |
| `metadata_filter` | object | no | Filter |
| `max_chunks_per_document` | int | no | Cap merged chunks per doc (default 200, max 500) |

**Success:** `{ status: 'success', query, namespace, metadata_filter?, result_count, documents: [{ document_id, merged_content, metadata, chunk_count, best_score }] }`.

---

## 8. `guided_query`

**Purpose:** Single-call orchestration: namespace routing + internal `suggest_query_params` + `count` or `query`. **Does not** require the client to call `suggest_query_params` first (it calls `markSuggested` internally).

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `user_query` | string | yes | User intent |
| `namespace` | string | no | Pin to explicit namespace |
| `metadata_filter` | object | no | Filter |
| `top_k` | int | no | For query paths |
| `preferred_tool` | `auto` \| `count` \| `fast` \| `detailed` \| `full` | no | Override automated tool choice |
| `enrich_urls` | boolean | no (default true) | Run URL generator when metadata lacks `url` |

**Success:** `{ status: 'success', decision_trace, result }` where `result` is either a count payload or a `QueryResponse`-shaped query payload.

**`decision_trace` fields (non-exhaustive):** `cache_hit`, `input_namespace`, `routed_namespace`, `selected_namespace`, `ranked_namespaces`, `suggested_fields`, `suggested_tool`, `selected_tool`, `explanation`, `enrich_urls`, `rerank_status` (`success` \| `skipped` \| `failed`).

When the inner query path runs, `result` includes the same `degraded`, `degradation_reason`, and `hybrid_leg_failed` fields as `query` (see [Rerank and hybrid degradation](#rerank-and-hybrid-degradation)).

**Example:**

```json
{
  "user_query": "How many messages mention modules TS?",
  "preferred_tool": "auto"
}
```

---

## 9. `generate_urls`

**Purpose:** Synthesize URLs from metadata via per-namespace generators.

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `namespace` | string | yes | Namespace |
| `records` | object[] | yes | Up to 500 records (metadata object or `{ metadata: {...} }`) |

**Success:** `{ status: 'success', namespace, count, results: [{ index, url, method, reason, metadata }] }`.

---

## Tool ordering cheat sheet

```text
Typical manual flow:
  list_namespaces → (optional) namespace_router → suggest_query_params → query | count | query_documents

Keyword-only:
  list_namespaces → keyword_search   # no suggest gate

Single-shot:
  guided_query
```

Canonical Zod schemas live beside each handler under `src/server/tools/*.ts`.
