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

**Throws** if `apiKey` or `indexName` is missing after trim (single-key mode). In multi-source mode, `PINECONE_API_KEY` is ignored when `PINECONE_SOURCES` or a config file is set; credentials come from each source entry.

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
PINECONE_SOURCES=public:${PINECONE_PUBLIC_API_KEY}:rag-hybrid;private:${PINECONE_PRIVATE_API_KEY}:rag-private
```

API keys may contain colons; the parser treats the last `:` segment as `indexName` and everything between `name:` and `:indexName` as the key.

### JSON config file

Set `PINECONE_CONFIG_FILE` (or `--config-file`) to a path such as [examples/multi-source/pinecone-sources.json.example](../examples/multi-source/pinecone-sources.json.example):

```json
{
  "defaultSource": "public",
  "sources": {
    "public": { "apiKey": "${PINECONE_PUBLIC_API_KEY}", "indexName": "rag-hybrid" },
    "private": { "apiKey": "${PINECONE_PRIVATE_API_KEY}", "indexName": "rag-private" }
  }
}
```

Values support `${ENV_VAR}` indirection (resolved at startup). Per-source `sparseIndexName` and `rerankModel` are optional; Alliance defaults apply when omitted.

### MCP tools and routing

| Tool | `source` parameter |
| ---- | ------------------ |
| `list_sources` | Registered only when more than one source is configured |
| `list_namespaces`, `namespace_router` | Omit to aggregate all sources; results include `source` when tagged |
| `query`, `count`, `query_documents`, `keyword_search`, `generate_urls`, `suggest_query_params`, `guided_query` | Omit when the namespace uniquely identifies one source; required when the same namespace exists on multiple sources |

Discovery responses may include `source_errors` when one project fails but others succeed. Suggest-flow state uses compound keys `source:namespace` in multi-source mode.

Single-key deployments (`PINECONE_API_KEY` + `PINECONE_INDEX_NAME` only) are unchanged — no `source` field on responses and no `list_sources` tool.

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
