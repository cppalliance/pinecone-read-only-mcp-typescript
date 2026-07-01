# MCP tools reference

Unless noted, failures return MCP `isError: true` with JSON matching `ToolError` (see [MIGRATION.md](./MIGRATION.md) and [README error table](../README.md#error-responses)).

## Response field stability

Success payloads separate **stable** fields (safe across minor bumps after `1.0.0`) from **experimental** fields (may change before `1.0.0`). Experimental fields are nested under `experimental` when present; the key is omitted when empty.

| Tool | Stable | Experimental |
| ---- | ------ | ------------ |
| `list_sources` | `status`, `sources`, `default` | _(none)_ |
| `list_namespaces` | `status`, `cache_hit`, `cache_ttl_seconds`, `expires_at_iso`, `count`, `namespaces`, optional `source_errors` | _(none)_ |
| `namespace_router` | `status`, `cache_hit`, `user_query`, `suggestions`, `recommended_namespace`, optional `recommended_source` | _(none)_ |
| `suggest_query_params` | `status`, `cache_hit`, `suggested_fields`, `recommended_tool`, `use_count_tool`, `explanation`, `namespace_found`, optional `source` | _(none)_ |
| `count` | `status`, `count`, `truncated`, `namespace`, `metadata_filter`, optional `source` | _(none)_ |
| `query` | `status`, `mode`, `query`, `namespace`, `metadata_filter`, `result_count`, `results`, `fields`, optional `source` on payload and rows | `experimental.degraded`, `experimental.degradation_reason`, `experimental.hybrid_leg_failed`, `experimental.rerank_skipped_reason` |
| `keyword_search` | `status`, `query`, `namespace`, `index`, `metadata_filter`, `result_count`, `results`, `fields`, optional `source` | _(none)_ |
| `query_documents` | `status`, `query`, `namespace`, `metadata_filter`, `result_count`, `documents`, optional `source` | Same experimental degradation fields as `query` |
| `guided_query` | `status`, `result` (count or query-shaped stable fields) | `experimental.decision_trace` (includes optional `selected_source`); query-path `result.experimental` degradation fields |
| `generate_urls` | `status`, `namespace`, `count`, `results`, optional `source` | _(none)_ |

Multi-source-only stable fields (`source` on namespace rows, `source_errors`, `recommended_source`, `selected_source`) are **omitted** in single-key deployments.

Promotion process: [deprecation-policy.md § Stable vs experimental](./deprecation-policy.md#stable-vs-experimental-mcp-response-fields).

## Core vs Alliance tool surface

| Setup | Tools | MCP instructions |
| ----- | ----- | ------------------ |
| `setupCoreServer` (package root) | **8** (single-key) or **9** (multi-source adds `list_sources`): `list_namespaces`, `namespace_router`, `count`, `query`, `keyword_search`, `query_documents`, `generate_urls`, `guided_query` | `CORE_SERVER_INSTRUCTIONS` — includes `guided_query`; no `suggest_query_params` |
| `setupAllianceServer` / published CLI | **9** (single-key) or **10** (multi-source): core tools plus `suggest_query_params` | `ALLIANCE_SERVER_INSTRUCTIONS` — includes suggest-flow quickstart |

## Suggest-flow gate

When **`disableSuggestFlow`** is **`false`** (Alliance default via `resolveAllianceConfig` / CLI), tools **`query`**, **`count`**, and **`query_documents`** require a prior successful **`suggest_query_params`** call for the **same namespace string** within the cache TTL (see `PINECONE_CACHE_TTL_SECONDS`). The gate is in-process memory (`requireSuggested`).

When **`disableSuggestFlow`** is **`true`** (core default via `resolveConfig`), the gate is bypassed — suitable for `setupCoreServer` embedders that do not register `suggest_query_params`.

**Namespace consistency:** use the **exact same** `namespace` value (including trimming — avoid leading/trailing spaces in one call and not the other) for `suggest_query_params` and downstream gated tools. Mismatches yield `FLOW_GATE` with a suggestion to call `suggest_query_params` first.

**Core:** gate off by default; set `PINECONE_DISABLE_SUGGEST_FLOW=false` or `disableSuggestFlow: false` to enable the gate. **Alliance:** gate on by default; set `PINECONE_DISABLE_SUGGEST_FLOW=true` or CLI `--disable-suggest-flow` to bypass (not recommended for production).

## Multi-source mode

Activated when `PINECONE_SOURCES`, `--sources`, or a JSON config file (`PINECONE_CONFIG_FILE` / `--config-file`) is set. See [CONFIGURATION.md § Multi-source mode](./CONFIGURATION.md#multi-source-mode) and [Deployment profiles](./CONFIGURATION.md#deployment-profiles).

**Shared `source` parameter** (optional on most tools):

> Pinecone source name (from `list_sources`). Omit on discovery tools to search all sources. On query tools, omit only when the namespace uniquely identifies one source.

| Category | Tools | When `source` is omitted |
| -------- | ----- | ------------------------ |
| **Discovery** | `list_sources`, `list_namespaces`, `namespace_router` | Aggregate or list across **all** configured sources; rows include `source` |
| **Orchestrator** | `guided_query` (no `namespace`) | Route using aggregated namespace lists; `experimental.decision_trace.selected_source` |
| **Execution** | `suggest_query_params`, `query`, `count`, `query_documents`, `keyword_search`, `generate_urls`, `guided_query` (with `namespace`) | `resolveSource`: infer source when namespace is unique; `VALIDATION` (`field: source`) when ambiguous |

**Typical multi-source flow:**

```text
list_sources → list_namespaces → (optional) namespace_router → suggest_query_params → query | count | query_documents
```

Or single-shot: `guided_query` (routes across sources when `namespace` is omitted).

**Suggest-flow in multi-source mode:** gate state uses compound keys `source:namespace`. Pass the same `source` + `namespace` pair for `suggest_query_params` and gated tools when the namespace exists on multiple sources.

---

## `list_sources` (multi-source only)

Registered only when more than one Pinecone source is configured.

| | |
| --- | --- |
| **Input** | _(empty object)_ |
| **Success** | `{ status: 'success', sources: string[], default: string }` |
| **Errors** | `LIFECYCLE` when not in multi-source mode |

**Example:**

```json
{}
```

---

## 1. `list_namespaces`

**Purpose:** Discover namespaces, metadata field names, and record counts. Results are cached (~30 minutes; see response `expires_at_iso`).

| | |
| --- | --- |
| **Input** | Optional `source` — filter to one configured project |
| **Success** | `{ status: 'success', cache_hit, cache_ttl_seconds, expires_at_iso, count, namespaces: [{ name, record_count, metadata_fields, source? }], source_errors? }` |
| **Errors** | `PINECONE_ERROR`, `TIMEOUT`, etc. |

**Example (multi-source, all projects):**

```json
{}
```

**Example (multi-source, one project):**

```json
{ "source": "public" }
```

---

## 2. `namespace_router`

**Purpose:** Rank candidate namespaces from natural-language intent (optional step before `suggest_query_params`).

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `user_query` | string | yes | User question / intent |
| `top_n` | int | no (default 3) | Max suggestions, 1–5 |
| `source` | string | no | Restrict ranking to one configured source (multi-source) |

**Success:** `{ status: 'success', cache_hit, user_query, suggestions: [{ namespace, score, record_count, reasons, source? }], recommended_namespace, recommended_source? }`.

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
| `source` | string | no | Pinecone source (multi-source; required when namespace is ambiguous) |

**Success:** `{ status: 'success', cache_hit, ...suggestQueryParams fields including suggested_fields, recommended_tool, use_count_tool, explanation, namespace_found, source? }`.

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
| `source` | string | no | Pinecone source (multi-source) |

**Success:** `{ status: 'success', count, truncated, namespace, metadata_filter?, source? }`.

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
| `source` | string | no | Pinecone source (multi-source) |

**Success (`QueryResponse`):** `{ status: 'success', mode?, query, namespace, metadata_filter?, result_count, results[], fields?, source?, experimental?: { ... } }`.

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

When reranking is requested but the rerank API fails, the server still returns **`status: 'success'`** with rows where `reranked: false`, plus **experimental** envelope fields:

| Field | When set | Meaning |
| ----- | -------- | ------- |
| `experimental.degraded` | `true` | Rerank was attempted and failed (or another degradation path fired) |
| `experimental.degradation_reason` | string | Human-readable detail for MCP/LLM clients (e.g. `rerank_failed: timeout after 5000ms`) |
| `experimental.hybrid_leg_failed` | `'dense'` \| `'sparse'` | Exactly one hybrid search leg failed while the other returned hits |

Treat **`experimental.degraded: true`** as lower confidence even when `status` is `success`. Combine with per-row `reranked`, `preset`, and `use_reranking`. Structured stderr logs may include additional detail.

`query_documents` propagates the same experimental flags when applicable.

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
| `source` | string | no | Pinecone source (multi-source) |

**Success:** Similar row shape to `query` (`KeywordSearchResponse`); optional `source` on payload and rows.

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
| `source` | string | no | Pinecone source (multi-source) |

**Success:** `{ status: 'success', query, namespace, metadata_filter?, result_count, documents[], source?, experimental?: { ... } }`.

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
| `source` | string | no | Pinecone source (multi-source; pin routing when namespace is ambiguous) |

**Success:** `{ status: 'success', experimental: { decision_trace }, result }` where `result` is either a count payload or a `QueryResponse`-shaped query payload.

**`experimental.decision_trace` fields (non-exhaustive):** `cache_hit`, `input_namespace`, `routed_namespace`, `selected_namespace`, `selected_source?`, `ranked_namespaces`, `suggested_fields`, `suggested_tool`, `selected_tool`, `explanation`, `enrich_urls`, `rerank_status` (`success` \| `skipped` \| `skipped_no_model` \| `failed`).

When the inner query path runs, `result.experimental` includes the same degradation fields as `query` (see [Rerank and hybrid degradation](#rerank-and-hybrid-degradation)).

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
| `source` | string | no | Pinecone source (multi-source) |

**Success:** `{ status: 'success', namespace, count, results: [...], source? }`.

---

## Tool ordering cheat sheet

```text
Typical manual flow:
  list_namespaces → (optional) namespace_router → suggest_query_params → query | count | query_documents

Multi-source manual flow:
  list_sources → list_namespaces → (optional) namespace_router → suggest_query_params → query | count | query_documents

Keyword-only:
  list_namespaces → keyword_search   # no suggest gate

Single-shot:
  guided_query
```

Canonical Zod input schemas live beside each handler under `src/core/server/tools/*.ts` and `src/alliance/tools/*.ts`. Success response schemas are in `src/core/server/response-schemas.ts` and exported from the package root (e.g. `queryResponseSchema`, `guidedQueryResponseSchema`).
