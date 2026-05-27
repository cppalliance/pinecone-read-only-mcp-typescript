# Configuration

Configuration is built from **CLI flags** (when using the binary), **environment variables**, and **defaults**. Library callers use `resolveConfig(overrides)` with optional `ConfigOverrides`.

## Precedence

**CLI / `ConfigOverrides` > environment variables > built-in defaults.**

`resolveConfig` in `src/core/config.ts` applies this order for each field.

---

## `ServerConfig` (resolved shape)

| Field | Source | Default / notes |
| ----- | ------ | --------------- |
| `apiKey` | `apiKey` / `PINECONE_API_KEY` | **Required** (non-empty after trim) |
| `indexName` | `indexName` / `PINECONE_INDEX_NAME` | `rag-hybrid` when env and overrides omit it |
| `sparseIndexName` | `sparseIndexName` / `PINECONE_SPARSE_INDEX_NAME` | `{indexName}-sparse` |
| `rerankModel` | `rerankModel` / `PINECONE_RERANK_MODEL` | `bge-reranker-v2-m3` when env and overrides omit it |
| `defaultTopK` | `defaultTopK` / `PINECONE_TOP_K` | `10` (positive int) |
| `logLevel` | `logLevel` / `PINECONE_READ_ONLY_MCP_LOG_LEVEL` | `INFO` (`DEBUG`–`ERROR`) |
| `logFormat` | `logFormat` / `PINECONE_READ_ONLY_MCP_LOG_FORMAT` | `text` or `json` |
| `cacheTtlMs` | `cacheTtlSeconds` / `PINECONE_CACHE_TTL_SECONDS` | `1800` seconds → ms |
| `requestTimeoutMs` | `requestTimeoutMs` / `PINECONE_REQUEST_TIMEOUT_MS` | `15000` |
| `disableSuggestFlow` | `disableSuggestFlow` / `PINECONE_DISABLE_SUGGEST_FLOW` | `false` (bool parsing: true/1/yes/on) |
| `checkIndexes` | `checkIndexes` / `PINECONE_CHECK_INDEXES` | `false` |

**Throws** if `apiKey` is missing after trim.

For the full Alliance tool surface (including `suggest_query_params`, `guided_query`, and built-in URL generators), import from `@will-cppa/pinecone-read-only-mcp/alliance` and call `setupAllianceServer(config)`.

### Rerank model

`resolveConfig` uses `PINECONE_INDEX_NAME` / `PINECONE_RERANK_MODEL` when set; otherwise **`rag-hybrid`** and **`bge-reranker-v2-m3`**. MCP configs that only set `PINECONE_API_KEY` keep the same defaults as before.

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
| `--help` / `-h` | Print help and exit |
| `--version` / `-v` | Print version and exit |

---

## Library embedding

1. Build `ServerConfig` with `resolveConfig({ apiKey: '...', indexName: '...', ... })` or pass explicit overrides.
2. Construct `PineconeClient` and `setPineconeClient(client)` before `setupAllianceServer(config)` (mirrors `src/index.ts`).
3. `await setupAllianceServer(config)` (or `setupCoreServer` for generic tools only) then connect an MCP transport.

See [README deployment model](../README.md#deployment-model), [examples/quickstart/README.md](../examples/quickstart/README.md) (generic), and [examples/alliance/library-embedding-demo.ts](../examples/alliance/library-embedding-demo.ts) (Alliance surface).

---

## Logging

- **Levels:** `DEBUG`, `INFO`, `WARN`, `ERROR`.
- **Formats:** `text` (human lines to stderr) or `json` (one JSON object per line).

Secrets are redacted (see [SECURITY.md](./SECURITY.md)).
