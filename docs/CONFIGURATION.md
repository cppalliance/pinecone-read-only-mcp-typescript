# Configuration

Configuration is built from **CLI flags** (when using the binary), **environment variables**, and **defaults**. Library callers use `resolveConfig(overrides)` (core) or `resolveAllianceConfig(overrides)` (Alliance CLI / `setupAllianceServer`) with optional `ConfigOverrides`.

## Precedence

**CLI / `ConfigOverrides` > environment variables > built-in defaults.**

`resolveConfig` in `src/core/config.ts` applies this order for each field.

---

## `ServerConfig` (resolved shape)

| Field | Source | Default / notes |
| ----- | ------ | --------------- |
| `apiKey` | `apiKey` / `PINECONE_API_KEY` | **Required** (non-empty after trim) |
| `indexName` | `indexName` / `PINECONE_INDEX_NAME` | **Required** (non-empty after trim) |
| `sparseIndexName` | `sparseIndexName` / `PINECONE_SPARSE_INDEX_NAME` | `{indexName}-sparse` |
| `rerankModel` | `rerankModel` / `PINECONE_RERANK_MODEL` | **Core:** omitted when unset (rerank disabled). **Alliance CLI:** `bge-reranker-v2-m3` when unset |
| `defaultTopK` | `defaultTopK` / `PINECONE_TOP_K` | `10` (positive int) |
| `logLevel` | `logLevel` / `PINECONE_READ_ONLY_MCP_LOG_LEVEL` | `INFO` (`DEBUG`–`ERROR`) |
| `logFormat` | `logFormat` / `PINECONE_READ_ONLY_MCP_LOG_FORMAT` | `text` or `json` |
| `cacheTtlMs` | `cacheTtlSeconds` / `PINECONE_CACHE_TTL_SECONDS` | `1800` seconds → ms |
| `requestTimeoutMs` | `requestTimeoutMs` / `PINECONE_REQUEST_TIMEOUT_MS` | `15000` |
| `disableSuggestFlow` | `disableSuggestFlow` / `PINECONE_DISABLE_SUGGEST_FLOW` | **Core `resolveConfig`:** `true` (gate off). **Alliance `resolveAllianceConfig` / CLI:** `false` (gate on). Bool parsing: true/1/yes/on |
| `checkIndexes` | `checkIndexes` / `PINECONE_CHECK_INDEXES` | `false` |
| `sources` | `sources` / `PINECONE_SOURCES` or JSON config file | Omitted in single-key mode; see [Multi-source mode](#multi-source-mode) |
| `defaultSource` | JSON config `defaultSource` only | First source when using inline `PINECONE_SOURCES` |

**Throws** if `apiKey` or `indexName` is missing after trim (single-key mode) — this happens at server startup, not as an MCP tool error. In multi-source mode, `PINECONE_API_KEY` is ignored when `PINECONE_SOURCES` or a config file is set; credentials come from each source entry.

For the full Alliance tool surface (including `suggest_query_params`, `guided_query`, and built-in URL generators), import from `@will-cppa/pinecone-read-only-mcp/alliance` and use the three-step instance-first recipe at [Library embedding](#library-embedding) below.

### Core vs Alliance resolvers

| Resolver | When to use | Index when unset | Rerank when unset | Suggest gate when unset |
| -------- | ------------- | ---------------- | ----------------- | ----------------------- |
| `resolveConfig` | Package root, `setupCoreServer`, quickstart | **Throws** | Omitted (no rerank) | Off (`disableSuggestFlow: true`) |
| `resolveAllianceConfig` | Published CLI, `setupAllianceServer` | `rag-hybrid` | `bge-reranker-v2-m3` | On (`disableSuggestFlow: false`) |

**Warning:** Switching between `resolveConfig` / `setupCoreServer` (package root) and `resolveAllianceConfig` / `setupAllianceServer` changes suggest-flow gate behavior. Core defaults bypass the gate; Alliance defaults enforce it. Use `guided_query` (registered in both setups) for single-call retrieval without manual `suggest_query_params`, or align `disableSuggestFlow` explicitly when migrating between entry points.

C++ Alliance deployers can copy [examples/alliance/.env.example](../examples/alliance/.env.example). Constants: `ALLIANCE_DEFAULT_INDEX_NAME` / `ALLIANCE_DEFAULT_RERANK_MODEL` from `@will-cppa/pinecone-read-only-mcp/alliance`.

---

## Multi-source mode

Use **one MCP server entry** with multiple Pinecone API keys / projects when `PINECONE_SOURCES`, `--sources`, or a JSON config file (`PINECONE_CONFIG_FILE` / `--config-file`) is set.

### Inline format (`PINECONE_SOURCES` / `--sources`)

Semicolon-separated entries: `name:apiKey:indexName`

```bash
PINECONE_SOURCES=api_key_1:${PINECONE_API_KEY_1}:index_name_1;api_key_2:${PINECONE_API_KEY_2}:index_name_2
```

API keys may contain colons; the parser treats the last `:` segment as `indexName` and everything between `name:` and `:indexName` as the key.

### JSON config file

Set `PINECONE_CONFIG_FILE` (or `--config-file`) to a path such as [examples/multi-source/pinecone-sources.json.example](../examples/multi-source/pinecone-sources.json.example):

```json
{
  "defaultSource": "api_key_1",
  "sources": {
    "api_key_1": { "apiKey": "${PINECONE_API_KEY_1}", "indexName": "index_name_1" },
    "api_key_2": { "apiKey": "${PINECONE_API_KEY_2}", "indexName": "index_name_2" }
  }
}
```

Values support `${ENV_VAR}` indirection (resolved at startup). Per-source `sparseIndexName` and `rerankModel` are optional; Alliance defaults apply when omitted.

Optional **config-file-only** fields (not supported in inline `PINECONE_SOURCES`):

| Field | Scope | Purpose |
| ----- | ----- | ------- |
| `description` | Per source | Short corpus/content hint surfaced via `list_sources` (helps LLM routing across sources or MCP entries) |
| `namespaces` | Per source | Map of namespace name → `{ description?, metadata_schema? }`; per-namespace `description` is surfaced via `list_namespaces` on matching live rows |

`metadata_schema` is a flat `fieldName → type` map (same vocabulary as `list_namespaces` → `metadata_fields`, e.g. `"title": "string"`). When declared for a live namespace, the server **skips live sampling** for that namespace and trusts the declared schema until the config file changes. Namespaces declared in config but absent from Pinecone produce a non-fatal `config_warnings` entry in `list_namespaces` (never a startup failure).

**Never** commit real corpus descriptions, namespace names, or internal field names to the open-source repo — use generic placeholders in examples only. Real values belong in staff-machine private config files per [Deployment profiles](#deployment-profiles). See [SECURITY.md](./SECURITY.md).

### MCP tools and routing

| Tool | `source` parameter |
| ---- | ------------------ |
| `list_sources` | Registered only when more than one source is configured |
| `list_namespaces`, `namespace_router` | Omit to aggregate all sources; results include `source` when tagged |
| `query`, `count`, `query_documents`, `keyword_search`, `generate_urls`, `suggest_query_params`, `guided_query` | Omit when the namespace uniquely identifies one source; required when the same namespace exists on multiple sources |

Discovery responses may include `source_errors` when one project fails but others succeed. Suggest-flow state uses compound keys `source:namespace` in multi-source mode.

Single-key deployments (`PINECONE_API_KEY` + `PINECONE_INDEX_NAME` only) are unchanged — no `source` field on responses and no `list_sources` tool.

### Deployment profiles

Multi-source mode supports two operational profiles. **Never** ship a merged internal config through the same channel used for external partners.

| Profile | Who | Config | Risk if mis-shared |
| ------- | --- | ------ | ------------------ |
| **External (public-only)** | External companies, public MCP distribution | `PINECONE_API_KEY` + `PINECONE_INDEX_NAME`, or `PINECONE_SOURCES` with **one** entry | Low — single public key only |
| **Internal (merged)** | Staff machines with access to private data | `PINECONE_SOURCES` or JSON config with **two+** entries | **High** — private API key and private namespace names exposed |

**External MCP config (unchanged):**

```json
{
  "mcpServers": {
    "pinecone-search": {
      "command": "npx",
      "args": ["-y", "@will-cppa/pinecone-read-only-mcp"],
      "env": {
        "PINECONE_API_KEY": "your-public-key",
        "PINECONE_INDEX_NAME": "rag-hybrid"
      }
    }
  }
}
```

**Internal MCP config (merged sources):**

```json
{
  "mcpServers": {
    "pinecone-search": {
      "command": "npx",
      "args": ["-y", "@will-cppa/pinecone-read-only-mcp"],
      "env": {
        "PINECONE_SOURCES": "api_key_1:${PINECONE_API_KEY_1}:index_name_1;api_key_2:${PINECONE_API_KEY_2}:index_name_2",
        "PINECONE_API_KEY_1": "pcsk_...",
        "PINECONE_API_KEY_2": "pcsk_..."
      }
    }
  }
}
```

Prefer `PINECONE_CONFIG_FILE` with `${ENV_VAR}` indirection over inline API keys in `PINECONE_SOURCES`. For internal deployments, add optional `description` and `namespaces` declarations in the JSON config file on staff machines only — never in public examples or committed constants. See [SECURITY.md](./SECURITY.md).

### Architecture decision

**Chosen:** Option A — multi-source server with optional `source` parameter on tools (`SourceRegistry` + `PINECONE_SOURCES` / JSON config).

**Rejected:**

- **Option B (Cursor routing rules only):** Does not fix the UX problem when users forget which MCP entry to use; no code changes.
- **Option C (thin proxy MCP):** Extra package and latency; duplicates routing logic already in `ServerContext`.

**Rationale:** Pinecone SDK v8 supports multiple `Pinecone({ apiKey })` instances per process; MCP has no barrier to aggregating backends. Security is enforced by **deployment profiles** (public-only vs merged config), not per-query MCP authorization. All multi-source results include `source` for LLM provenance.

**Execution semantics:** Discovery tools aggregate all sources when `source` is omitted. Execution tools (`query`, `count`, etc.) call `resolveSource`: infer source when the namespace exists on exactly one project; return `VALIDATION` when ambiguous. They do **not** fan out one query to all sources. `guided_query` without `namespace` routes via the aggregated namespace list and sets `selected_source` in `decision_trace`.

**Audit logging:** When a tool resolves a specific source, stderr logs `toolname [source=name]` at INFO (execution tools and discovery tools that pass an explicit `source` filter). Aggregated discovery without `source` does not log per-source lines.

See also [TOOLS.md § Multi-source mode](./TOOLS.md#multi-source-mode).

---

## CLI flags (`parseCli` / `src/cli.ts`)

| Flag | Maps to |
| ---- | ------- |
| `--api-key` | `apiKey` |
| `--index-name` | `indexName` |
| `--sparse-index-name` | `sparseIndexName` |
| `--rerank-model` | `rerankModel` |
| `--top-k` | `defaultTopK` |
| `--log-level` | `logLevel` |
| `--log-format` | `logFormat` |
| `--cache-ttl-seconds` | `cacheTtlSeconds` |
| `--request-timeout-ms` | `requestTimeoutMs` |
| `--disable-suggest-flow` | `disableSuggestFlow: true` |
| `--check-indexes` | `checkIndexes: true` |
| `--sources` | `sources` (inline multi-source string) |
| `--config-file` | `configFile` / `PINECONE_CONFIG_FILE` |
| `--help` / `-h` | Print help and exit |
| `--version` / `-v` | Print version and exit |

---

## Library embedding

1. Build `ServerConfig` with `resolveConfig({ apiKey: '...', indexName: '...', ... })` or `resolveAllianceConfig(...)` for the full tool surface.
2. `const ctx = createServer(config)` then `ctx.setClient(new PineconeClient({ ... }))` (mirrors `src/index.ts`).
3. `await setupAllianceServer({ context: ctx })` (or `setupCoreServer({ context: ctx })` for generic tools only) then connect an MCP transport.

Pass `config` at setup only when the context is not yet configured; after `createServer` + `setClient`, pass `{ context: ctx }` only.

See [README deployment model](../README.md#deployment-model), [examples/quickstart/README.md](../examples/quickstart/README.md) (generic), and [examples/alliance/library-embedding-demo.ts](../examples/alliance/library-embedding-demo.ts) (Alliance surface).

---

## Logging

- **Levels:** `DEBUG`, `INFO`, `WARN`, `ERROR`.
- **Formats:** `text` (human lines to stderr) or `json` (one JSON object per line).

Secrets are redacted (see [SECURITY.md](./SECURITY.md)).
