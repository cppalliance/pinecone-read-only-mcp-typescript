# Migration guide

Deprecation timelines and maintainer obligations are defined in [deprecation-policy.md](./deprecation-policy.md).

This guide is for **library and MCP client authors** upgrading from earlier **0.1.x** lines. The **[0.2.0]** section of [`CHANGELOG.md`](../CHANGELOG.md) is the authoritative list of changes; this document shows **how** to migrate.

Under [semver 0.y.z](https://semver.org/spec/v2.0.0.html#spec-item-4), **0.1.x → 0.2.0 is a breaking minor** — pin `@0.2.0` only after reading this guide.

## Unreleased: `ServerContext` instance APIs (phase 1)

**Rationale:** Process-global singletons (Pinecone client slot, config, URL registry, suggest-flow gate, namespaces cache) complicate testing and multi-tenant embedding. Phase 1 introduces an opt-in **`ServerContext`** without removing legacy getters.

**Now (0.2.x — unchanged for existing embedders):**

```ts
import { PineconeClient, setPineconeClient } from '@will-cppa/pinecone-read-only-mcp';
import { resolveAllianceConfig, setupAllianceServer } from '@will-cppa/pinecone-read-only-mcp/alliance';

const config = resolveAllianceConfig({ apiKey: process.env.PINECONE_API_KEY! });
setPineconeClient(new PineconeClient({ /* ... */ }));
const server = await setupAllianceServer(config);
```

Module-level helpers (`getPineconeClient`, `registerUrlGenerator`, `requireSuggested`, etc.) continue to work; they delegate to a process-default context.

**New (opt-in instance path):**

```ts
import { createServer, ServerContext } from '@will-cppa/pinecone-read-only-mcp';
import { resolveAllianceConfig, setupAllianceServer } from '@will-cppa/pinecone-read-only-mcp/alliance';

const config = resolveAllianceConfig({ apiKey: process.env.PINECONE_API_KEY! });
const ctx = createServer(config); // installs process-default + returns instance
ctx.setClient(new PineconeClient({ /* same fields as config */ }));
const server = await setupAllianceServer(config); // passes ctx into migrated tools
```

For custom tool wiring, pass `ctx` to migrated registrars:

```ts
import { registerQueryTool, registerCountTool, registerListNamespacesTool } from '…'; // internal today
registerQueryTool(server, ctx);
```

**Later (future minors/major):** Legacy module getters will be marked `### Deprecated` per [deprecation-policy.md](./deprecation-policy.md). Multi-tenant HTTP embedders should use one `ServerContext` per session rather than sharing process-global state.

See also [deprecation-policy.md § Future instance APIs](./deprecation-policy.md#future-instance-apis-servercontext).

---

## Unreleased: core vs Alliance config defaults

**Rationale:** Generic npm consumers must not silently connect to Alliance infrastructure or inherit Alliance rerank settings when using `resolveConfig` from the package root.

**Migration (core / `setupCoreServer`):**

1. Add `PINECONE_INDEX_NAME` to MCP `env` blocks, `.env`, or Docker `-e`, or pass `indexName` in `ConfigOverrides`.
2. Set `PINECONE_RERANK_MODEL` only when you want reranking; omit it to skip rerank (previously defaulted to `bge-reranker-v2-m3` in core).
3. Code that imported `DEFAULT_INDEX_NAME` or `DEFAULT_RERANK_MODEL` from the package root should use your own constants or [examples/alliance/preset.ts](../examples/alliance/preset.ts) for Alliance values.

Core `resolveConfig` throws `Missing Pinecone index name: …` when the index is unset (same pattern as the API key error).

**Alliance CLI / `setupAllianceServer` (unchanged for typical MCP configs):**

- The binary uses `resolveAllianceConfig`; API-key-only configs still default to `rag-hybrid` and `bge-reranker-v2-m3`.
- Explicit env overrides still win. Copy [examples/alliance/.env.example](../examples/alliance/.env.example) to document Alliance conventions.

---

## Migrating to v0.2.0

### Namespace trimming and suggest-flow

**Rationale:** The in-process suggest-flow gate keys state by `namespace` string. If `suggest_query_params` is called with `" docs "` and `query` with `"docs"`, the gate may not match.

**Migration:**

1. Normalize namespaces once (e.g. `namespace.trim()`).
2. Pass the **same** string to `suggest_query_params`, `query`, `count`, and `query_documents`.

```ts
const ns = userInput.trim();
// call suggest_query_params({ namespace: ns, ... })
// then query({ namespace: ns, ... })
```

---

### 1. `ToolError` replaces `{ status: 'error', message }`

**Rationale:** Typed, machine-readable errors for MCP clients and `switch` on `code`.

**Before (conceptual):**

```json
{
  "status": "error",
  "message": "Query text cannot be empty"
}
```

**After (`ToolError`, `isError: true` body):**

```json
{
  "code": "VALIDATION",
  "message": "Query text cannot be empty",
  "recoverable": true,
  "field": "query_text"
}
```

**`code` values (discriminated union):**

| `code` | `recoverable` | Notes |
| ------ | --------------- | ----- |
| `FLOW_GATE` | `true` | Suggestion: call `suggest_query_params` for the namespace first |
| `VALIDATION` | `true` | **`field` required** — input or `metadata_filter` dot-path |
| `PINECONE_ERROR` | `true` or `false` | Upstream / network / Pinecone failures |
| `TIMEOUT` | `true` | Outbound deadline exceeded |

**Migration steps:**

1. Parse JSON with `toolErrorSchema` / `ToolError` from `@will-cppa/pinecone-read-only-mcp` if using Zod.
2. Replace checks for `status === 'error'` with `isError === true` and `code` branching.
3. Map `VALIDATION` UX to `field` for inline form errors.

---

### 2. `QueryResponse` / `KeywordSearchResponse` — error fields removed

**Rationale:** Success and error paths are separated: success DTOs never carry `status: 'error'` embedded fields.

**Before:** Some clients read `status: 'error'` **inside** a success-shaped response.

**After:** On failure, the MCP layer sets `isError: true` and returns `ToolError` JSON only. Successful `query` responses are always `QueryResponse` with `status: 'success'` and optional `results`, etc.

**Migration steps:**

1. Treat HTTP/MCP errors only via `isError` + `ToolError`.
2. Remove dead branches that looked for `QueryResponse.status === 'error'`.

---

### 3. `recommended_tool` string values

**Rationale:** Align routing hints with the unified `query` tool vocabulary.

| Old (legacy) | New |
| ------------ | --- |
| `query_fast` | `fast` |
| `query_detailed` | `detailed` |
| `count` | `count` (unchanged) |
| _(n/a)_ | `full` (explicit preset) |

**Migration steps:**

1. Update `switch (recommended_tool)` / routing tables to the new literals.
2. When forwarding to `query`, map to `preset` (next section).

---

### 4. Unified `query` tool (replaces `query_fast` / `query_detailed`)

**Rationale:** One hybrid tool with a `preset` knob instead of duplicate registrations.

| Legacy tool call | New `query` call |
| ---------------- | ---------------- |
| `query_fast({ ...params })` | `query({ ...params, preset: 'fast' })` |
| `query_detailed({ ...params })` | `query({ ...params, preset: 'detailed' })` |
| Custom / explicit rerank+fields | `query({ ...params, preset: 'full', use_reranking?, fields? })` |

**Example:**

```ts
// was: tool "query_fast" with { query_text, namespace, top_k, metadata_filter }
await callTool('query', {
  query_text,
  namespace,
  top_k,
  metadata_filter,
  preset: 'fast',
});
```

---

### 5. Node.js >= 20.12.0

**Rationale:** `engines.node` is now **>=20.12.0**. Vitest **4** (bundled **rolldown**) imports `util.styleText` from `node:util` (added in Node **20.12**), and **`@vitest/coverage-v8`** uses `node:inspector/promises`. CI tests **20.x** and **22.x** only.

**Migration steps:**

1. Upgrade local Node to **20.12+** (or **22.x**).
2. Update CI images / `actions/setup-node` to **20.12+** if you pin an older 20.x patch.
3. Re-run your MCP client or library tests after upgrading.

---

## Summary checklist

- [ ] Normalize and reuse namespace strings across suggest + gated tools.
- [ ] Adopt `ToolError` parsing for all tool failures.
- [ ] Remove reliance on in-body `status: 'error'` for query responses.
- [ ] Update `recommended_tool` handling to `count` \| `fast` \| `detailed` \| `full`.
- [ ] Map legacy fast/detailed tool calls to `query` + `preset`.
- [ ] Run on Node.js **>=20.12.0**.
