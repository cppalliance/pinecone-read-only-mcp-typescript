# Configuration

Configuration comes from **CLI flags** (binary), **environment variables**, or **`ConfigOverrides`** (library). Precedence: **CLI / `ConfigOverrides` > environment variables > built-in defaults.**

This doc is organized for two audiences:

- **Running the server** (MCP host config, env vars, CLI flags) — read top to bottom.
- **Embedding the library** — jump to [Library embedding](#library-embedding).

---

## Quick start: single Pinecone project

Most setups need just an API key and index name. Add this to your MCP host config (e.g. Cursor `mcp.json`, `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "pinecone-search": {
      "command": "npx",
      "args": ["-y", "@will-cppa/pinecone-read-only-mcp"],
      "env": {
        "PINECONE_API_KEY": "your-api-key-here",
        "PINECONE_INDEX_NAME": "your-index-name"
      }
    }
  }
}
```

Or via CLI flags instead of env:

```json
{
  "mcpServers": {
    "pinecone-search": {
      "command": "npx",
      "args": ["-y", "@will-cppa/pinecone-read-only-mcp", "--api-key", "your-api-key-here", "--index-name", "your-index-name"]
    }
  }
}
```

Need more than one Pinecone project in the same MCP entry? See [Multi-source mode](#multi-source-mode).

---

## All settings (`ServerConfig`)

| Field | CLI flag | Env var | Default / notes |
| ----- | -------- | ------- | ---------------- |
| `apiKey` | `--api-key` | `PINECONE_API_KEY` | **Required** in single-key mode (non-empty after trim) |
| `indexName` | `--index-name` | `PINECONE_INDEX_NAME` | **Required** in single-key mode (non-empty after trim) |
| `sparseIndexName` | `--sparse-index-name` | `PINECONE_SPARSE_INDEX_NAME` | `{indexName}-sparse` |
| `rerankModel` | `--rerank-model` | `PINECONE_RERANK_MODEL` | **Core:** omitted when unset (rerank disabled). **Alliance CLI:** `bge-reranker-v2-m3` when unset |
| `defaultTopK` | `--top-k` | `PINECONE_TOP_K` | `10` (positive int) |
| `logLevel` | `--log-level` | `PINECONE_READ_ONLY_MCP_LOG_LEVEL` | `INFO` (`DEBUG`–`ERROR`) |
| `logFormat` | `--log-format` | `PINECONE_READ_ONLY_MCP_LOG_FORMAT` | `text` or `json` |
| `cacheTtlMs` | `--cache-ttl-seconds` | `PINECONE_CACHE_TTL_SECONDS` | `1800` seconds → ms |
| `requestTimeoutMs` | `--request-timeout-ms` | `PINECONE_REQUEST_TIMEOUT_MS` | `15000` |
| `disableSuggestFlow` | `--disable-suggest-flow` | `PINECONE_DISABLE_SUGGEST_FLOW` | **Core:** `true` (gate off). **Alliance:** `false` (gate on). Bool parsing: `true`/`1`/`yes`/`on` |
| `checkIndexes` | `--check-indexes` | `PINECONE_CHECK_INDEXES` | `false` |
| `sources` | `--sources` | `PINECONE_SOURCES` | Multi-source only; see below |
| `configFile` | `--config-file` | `PINECONE_CONFIG_FILE` | Multi-source only; see below |
| — | `--help`, `-h` | — | Print help and exit |
| — | `--version`, `-v` | — | Print version and exit |

**Throws** if `apiKey` or `indexName` is missing after trim (single-key mode) — at server startup, not as an MCP tool error. In multi-source mode, `PINECONE_API_KEY` is ignored; credentials come from each source entry.

### Core vs Alliance resolvers

Library callers use `resolveConfig(overrides)` (core) or `resolveAllianceConfig(overrides)` (Alliance CLI / `setupAllianceServer`). They differ only in defaults:

| Resolver | When to use | Index when unset | Rerank when unset | Suggest gate when unset |
| -------- | ----------- | ----------------- | ------------------ | ------------------------ |
| `resolveConfig` | Package root, `setupCoreServer`, quickstart | **Throws** | Omitted (no rerank) | Off (`disableSuggestFlow: true`) |
| `resolveAllianceConfig` | Published CLI, `setupAllianceServer` | `rag-hybrid` | `bge-reranker-v2-m3` | On (`disableSuggestFlow: false`) |

**Warning:** switching between the two changes suggest-flow gate behavior. Use `guided_query` (registered in both) for single-call retrieval without manual `suggest_query_params`, or set `disableSuggestFlow` explicitly when migrating between entry points.

C++ Alliance deployers can copy [examples/alliance/.env.example](../examples/alliance/.env.example). Constants: `ALLIANCE_DEFAULT_INDEX_NAME` / `ALLIANCE_DEFAULT_RERANK_MODEL` from `@will-cppa/pinecone-read-only-mcp/alliance`.

---

## Multi-source mode

Use **one MCP server entry** with multiple Pinecone projects by setting `PINECONE_SOURCES` / `--sources`, or `PINECONE_CONFIG_FILE` / `--config-file`.

**Pick a format:**

| I want to... | Use |
| ------------ | --- |
| List a few `name:key:index` pairs, nothing else | [Colon format](#colon-format-keys-only) |
| Add per-source `description` or per-namespace `metadata_schema` | [JSON format](#json-format-descriptions--namespaces) — inline or file, same schema |
| Keep source config in a separate file from the MCP settings | JSON via `PINECONE_CONFIG_FILE` |
| Keep everything in the MCP host's `env` block | JSON via `PINECONE_SOURCES` |

**Precedence:** `PINECONE_CONFIG_FILE` / `--config-file` wins when both are set. Within `PINECONE_SOURCES`, a value starting with `{` is parsed as JSON; otherwise it is parsed as the colon format.

### Colon format (keys only)

Semicolon-separated `name:apiKey:indexName` entries:

```bash
PINECONE_SOURCES=api_key_1:${PINECONE_API_KEY_1}:index_name_1;api_key_2:${PINECONE_API_KEY_2}:index_name_2
```

API keys may contain colons; the parser treats the last `:` segment as `indexName` and everything between `name:` and `:indexName` as the key. This format never carries `description` or `namespaces` — use JSON for those.

### JSON format (descriptions + namespaces)

One schema, loadable two ways — as the `PINECONE_SOURCES` value (inline) or as a `PINECONE_CONFIG_FILE` file:

```json
{
  "defaultSource": "api_key_1",
  "sources": {
    "api_key_1": {
      "apiKey": "${PINECONE_API_KEY_1}",
      "indexName": "index_name_1",
      "description": "Short corpus hint shown by list_sources",
      "namespaces": {
        "example_ns": {
          "description": "Namespace hint shown by list_namespaces",
          "metadata_schema": { "field_a": "string" }
        }
      }
    },
    "api_key_2": { "apiKey": "${PINECONE_API_KEY_2}", "indexName": "index_name_2" }
  }
}
```

- `defaultSource` is optional (defaults to the first key); required only to be a valid source name when present.
- `apiKey` is optional per source — when omitted, it defaults to `${sourceName}` (e.g. source `api_key_1` → env var `api_key_1`). Use this to keep keys as sibling `env` vars without repeating the source name.
- `sparseIndexName` / `rerankModel` are optional per source (same defaults as single-key mode).
- All string values support `${ENV_VAR}` indirection, resolved at startup.

**Inline in `PINECONE_SOURCES`**, you can also drop the `sources` wrapper and use the map directly (handy for MCP `env` blocks — Cursor's `mcp.json` example below uses this shape):

```json
{
  "api_key_1": { "indexName": "rag-hybrid", "description": "..." },
  "api_key_2": { "indexName": "rag-hybrid" }
}
```

Both shapes (wrapped with `sources`, or the bare map) are accepted whenever `PINECONE_SOURCES` starts with `{`.

**As a file**, set `PINECONE_CONFIG_FILE=./pinecone-sources.json` (or `--config-file`) pointing at the wrapped shape above — see [examples/multi-source/pinecone-sources.json.example](../examples/multi-source/pinecone-sources.json.example).

**Passing JSON through `env`:** env values are always strings at the OS level. The safest option is to pass an already-stringified JSON string as the `PINECONE_SOURCES` value. Some MCP hosts (including Cursor) also accept a nested JSON object in `mcp.json` and stringify it before spawning the server — if your host does this, a raw object works too; if you see a parse error, stringify it explicitly instead.

**`metadata_schema`** is a flat `fieldName → type` map (same vocabulary as `list_namespaces` → `metadata_fields`, e.g. `"title": "string"`). When declared for a live namespace, the server **skips live sampling** for that namespace and trusts the declared schema until the config changes. Namespaces declared but absent from Pinecone produce a non-fatal `config_warnings` entry in `list_namespaces` (never a startup failure).

**Never** commit real corpus descriptions, namespace names, or internal field names to the open-source repo — use generic placeholders in examples only. Real values belong in staff-machine private config (file or MCP `env`). See [SECURITY.md](./SECURITY.md).

> **Caveat — source names with hyphens:** the default-`apiKey` shortcut (`apiKey` omitted → `${sourceName}`) only works when the source name is also a valid environment-variable identifier (letters, digits, underscore; no leading digit). A name like `internal-corpus` triggers a startup error — supply `apiKey` explicitly for hyphenated source names.

> **Note — bare-map with source named `sources`:** a payload like `{"sources": {"indexName": "rag-hybrid"}}` is interpreted as a sources-map (one source named `sources`). For multi-source file layout or an explicit `defaultSource`, use the wrapped `{ "defaultSource"?, "sources": { ... } }` shape.

### MCP tools and routing

| Tool | `source` parameter |
| ---- | ------------------- |
| `list_sources` | Registered only when more than one source is configured |
| `list_namespaces`, `namespace_router` | Omit to aggregate all sources; results include `source` when tagged |
| `query`, `count`, `query_documents`, `keyword_search`, `generate_urls`, `suggest_query_params`, `guided_query` | Omit when the namespace uniquely identifies one source; required when the same namespace exists on multiple sources |

Discovery responses may include `source_errors` when one project fails but others succeed. Suggest-flow state uses compound keys `source:namespace` in multi-source mode.

Single-key deployments (`PINECONE_API_KEY` + `PINECONE_INDEX_NAME` only) are unchanged — no `source` field on responses and no `list_sources` tool.

See [TOOLS.md § Multi-source mode](./TOOLS.md#multi-source-mode) for the full per-tool routing reference and design notes.

### Deployment profiles

Multi-source mode supports two operational profiles. **Never** ship a merged internal config through the same channel used for external partners.

| Profile | Who | Config | Risk if mis-shared |
| ------- | --- | ------ | -------------------- |
| **External (public-only)** | External companies, public MCP distribution | `PINECONE_API_KEY` + `PINECONE_INDEX_NAME`, or `PINECONE_SOURCES` with **one** entry | Low — single public key only |
| **Internal (merged)** | Staff machines with access to private data | `PINECONE_SOURCES` or JSON config with **two+** entries | **High** — private API key and private namespace names exposed |

**External MCP config (single source, unchanged):** see [Quick start](#quick-start-single-pinecone-project) above.

**Internal MCP config (merged sources, JSON inline):**

```json
{
  "mcpServers": {
    "pinecone-search": {
      "command": "npx",
      "args": ["-y", "@will-cppa/pinecone-read-only-mcp"],
      "env": {
        "api_key_1": "pcsk_...",
        "api_key_2": "pcsk_...",
        "PINECONE_SOURCES": {
          "api_key_1": { "indexName": "rag-hybrid", "description": "..." },
          "api_key_2": { "indexName": "rag-hybrid" }
        }
      }
    }
  }
}
```

Colon format also works here: `"PINECONE_SOURCES": "api_key_1:${PINECONE_API_KEY_1}:index_name_1;..."`.

Prefer JSON-shaped `PINECONE_SOURCES` or `PINECONE_CONFIG_FILE` with `${ENV_VAR}` indirection over embedding raw API keys directly. For internal deployments, add optional `description` and `namespaces` in JSON on staff machines only — never in public examples or committed constants. See [SECURITY.md](./SECURITY.md).

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
