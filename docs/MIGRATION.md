# Migration guide

Deprecation timelines and maintainer obligations are defined in [deprecation-policy.md](./deprecation-policy.md).

This guide is for **library and MCP client authors** upgrading from earlier **0.1.x** lines. The **[0.2.0]** section of [`CHANGELOG.md`](../CHANGELOG.md) is the authoritative list of changes; this document shows **how** to migrate.

Under [semver 0.y.z](https://semver.org/spec/v2.0.0.html#spec-item-4), **0.1.x → 0.2.0 is a breaking minor** — pin `@0.2.0` only after reading this guide.

## Unreleased: Stable vs experimental response fields

**Rationale:** Tool success payloads mixed stable contract fields with experimental diagnostics (`degraded`, `decision_trace`, etc.) at the top level. Experimental fields are now nested under `experimental` so consumers know which fields are safe across minor version bumps.

**Who is affected:** MCP clients and integrators parsing `query`, `query_documents`, or `guided_query` success JSON.

**Before (`query`):**

```json
{
  "status": "success",
  "results": [],
  "degraded": true,
  "degradation_reason": "rerank_failed: timeout",
  "hybrid_leg_failed": "dense"
}
```

**After (`query`):**

```json
{
  "status": "success",
  "results": [],
  "experimental": {
    "degraded": true,
    "degradation_reason": "rerank_failed: timeout",
    "hybrid_leg_failed": "dense"
  }
}
```

**Before (`guided_query`):**

```json
{
  "status": "success",
  "decision_trace": { "selected_namespace": "mailing" },
  "result": { "status": "success", "results": [], "degraded": false }
}
```

**After (`guided_query`):**

```json
{
  "status": "success",
  "experimental": {
    "decision_trace": { "selected_namespace": "mailing", "rerank_status": "success" }
  },
  "result": {
    "status": "success",
    "results": []
  }
}
```

When no experimental fields apply, the `experimental` key is **omitted** (not an empty object).

**Client-side validation:** Import Zod schemas from the package root, e.g. `import { queryResponseSchema } from '@will-cppa/pinecone-read-only-mcp'`.

**Promotion:** Moving a field from `experimental` to stable requires CHANGELOG, TOOLS.md, and schema updates per [deprecation-policy.md § Stable vs experimental](./deprecation-policy.md#stable-vs-experimental-mcp-response-fields).

## Unreleased: Legacy module-facade deprecations

**Rationale:** Module-level singleton facades (`setPineconeClient`, `registerUrlGenerator`, `getDefaultServerContext`, etc.) delegate to a process-global `ServerContext`. They complicate multi-tenant embedding and hide initialization order. They are marked `@deprecated` in JSDoc; earliest removal is **two minor releases after** the deprecation minor (see [deprecation-policy.md § Deprecation window](./deprecation-policy.md#deprecation-window)).

**Who is affected:** Library embedders importing facade functions from `@will-cppa/pinecone-read-only-mcp` or `/alliance`.

**Recommended pattern:** `createServer(config)` → `ctx.setClient(...)` → `setupCoreServer({ context: ctx })` or `setupAllianceServer({ context: ctx })`.

### Client

**Before (deprecated):**

```ts
import { PineconeClient, setPineconeClient } from '@will-cppa/pinecone-read-only-mcp';

setPineconeClient(new PineconeClient({ /* ... */ }));
```

**After:**

```ts
import { createServer, PineconeClient, resolveConfig } from '@will-cppa/pinecone-read-only-mcp';

const config = resolveConfig({ apiKey: '...', indexName: 'my-index' });
const ctx = createServer(config);
ctx.setClient(new PineconeClient({ /* ... */ }));
```

### Config

**Before (deprecated):** `getServerConfig()` / `setServerConfig(config)` / `resetServerConfig()`.

**After:** `ctx.getConfig()` / `ctx.setConfig(config)` / `ctx.teardown()`.

### URL registry

**Before (deprecated):**

```ts
import { registerUrlGenerator } from '@will-cppa/pinecone-read-only-mcp';

registerUrlGenerator('my-ns', myGenerator);
```

**After:**

```ts
ctx.registerUrlGenerator('my-ns', myGenerator);
```

Same for `unregisterUrlGenerator`, `generateUrlForNamespace`, `hasUrlGenerator`, and `resetUrlGenerationRegistry` → `ctx.unregisterUrlGenerator`, `ctx.generateUrlForNamespace`, `ctx.hasUrlGenerator`, `ctx.resetUrlGenerators`.

### Suggest-flow gate

**Before (deprecated):** `markSuggested`, `requireSuggested`, `resetSuggestionFlow`.

**After:** `ctx.markSuggested`, `ctx.requireSuggested`, `ctx.resetSuggestionFlow`.

### Namespaces cache

**Before (deprecated):** `getNamespacesWithCache()`, `invalidateNamespacesCache()`.

**After:** `ctx.getNamespacesWithCache()`, `ctx.invalidateNamespacesCache()`.

### Process-default context

**Before (deprecated):**

```ts
import { getDefaultServerContext, setupCoreServer } from '@will-cppa/pinecone-read-only-mcp';

await setupCoreServer(config); // uses process default
const ctx = getDefaultServerContext();
```

**After:**

```ts
const ctx = createServer(config);
ctx.setClient(client);
await setupCoreServer({ context: ctx });
```

### Teardown

**Before:** `teardownServer()` resets the process-default context.

**After:** `await ctx.teardown()` or `await using server = await setupAllianceServer({ context: ctx })` for automatic cleanup. `teardownServer()` remains available during the deprecation window for legacy single-server flows; prefer per-context lifecycle for new code.

### CLI and tests

- **CLI:** unchanged — the binary uses internal setup paths.
- **Test fakes:** pass a dedicated `ServerContext` via `createIsolatedContext` or `createServer` + `{ context: ctx }` at setup instead of mutating process globals.

See [deprecation-policy.md § Active deprecations](./deprecation-policy.md#active-deprecations-legacy-module-facades) for the full inventory.

## Unreleased: trimmed library exports

**Who is affected:** Library embedders that imported `buildQueryExperimental` or `buildGuidedQueryExperimental` from `@will-cppa/pinecone-read-only-mcp` or `/alliance`.

**Before:**

```ts
import { buildQueryExperimental } from '@will-cppa/pinecone-read-only-mcp';
```

**After:** These helpers are internal to the server. Options:

1. Invoke the relevant MCP tool handler and parse the success payload with `queryResponseSchema` / `guidedQueryResponseSchema`.
2. Build the `experimental` object yourself to match `QueryExperimental` if you control the response shape.

`PineconeClient.query()` return types (`HybridQueryResult`, etc.) and all Zod response schemas remain on the public surface.

## Unreleased: `ServerContext` instance APIs (initial)

**Rationale:** Process-global singletons (Pinecone client slot, config, URL registry, suggest-flow gate, namespaces cache) complicate testing and multi-tenant embedding. The initial milestone introduces an opt-in **`ServerContext`**; legacy module facades are deprecated (see [Legacy module-facade deprecations](#unreleased-legacy-module-facade-deprecations)).

**Deprecated (migrate before removal):**

```ts
import { PineconeClient, setPineconeClient } from '@will-cppa/pinecone-read-only-mcp';
import {
  resolveAllianceConfig,
  setupAllianceServer,
} from '@will-cppa/pinecone-read-only-mcp/alliance';

const config = resolveAllianceConfig({ apiKey: process.env.PINECONE_API_KEY! });
setPineconeClient(
  new PineconeClient({
    /* ... */
  })
);
const server = await setupAllianceServer(config);
```

Module-level helpers (`getPineconeClient`, `registerUrlGenerator`, `requireSuggested`, etc.) still work during the deprecation window; they delegate to a process-default context.

**Recommended (instance-first):** For one-shot client injection at construction, see [ServerContext composition API](#unreleased-servercontext-composition-api) (`createServer(config, { client })` or `createIsolatedContext`).

```ts
import { createServer, PineconeClient } from '@will-cppa/pinecone-read-only-mcp';
import {
  resolveAllianceConfig,
  setupAllianceServer,
} from '@will-cppa/pinecone-read-only-mcp/alliance';

const config = resolveAllianceConfig({ apiKey: process.env.PINECONE_API_KEY! });
const client = new PineconeClient({
  apiKey: config.apiKey,
  indexName: config.indexName,
  sparseIndexName: config.sparseIndexName,
  rerankModel: config.rerankModel,
  defaultTopK: config.defaultTopK,
  requestTimeoutMs: config.requestTimeoutMs,
});
const ctx = createServer(config, { client }); // equivalent to createServer + setClient
const server = await setupAllianceServer({ context: ctx });
```

Alternatively, inject the client after `createServer`:

```ts
const ctx = createServer(config);
ctx.setClient(
  new PineconeClient({
    apiKey: config.apiKey,
    indexName: config.indexName,
    sparseIndexName: config.sparseIndexName,
    rerankModel: config.rerankModel,
    defaultTopK: config.defaultTopK,
    requestTimeoutMs: config.requestTimeoutMs,
  })
);
const server = await setupAllianceServer({ context: ctx });
```

Pass `config` at setup only when the context is not yet configured; after `createServer` + client injection, pass `{ context: ctx }` only.

**Core-only setup** (seven tools, no Alliance builtins):

```ts
import {
  createServer,
  PineconeClient,
  resolveConfig,
  setupCoreServer,
} from '@will-cppa/pinecone-read-only-mcp';

const config = resolveConfig({ apiKey: '...', indexName: 'my-index' });
const client = new PineconeClient({
  /* ... */
});
const ctx = createServer(config, { client });
const server = await setupCoreServer({ context: ctx });
```

**Multi-instance:** run multiple `ServerContext` instances in one process by passing a distinct `context` to each setup call. Use `await using` on the returned `ServerHandle` or `ctx.teardown()` per session. Legacy `teardownServer()` resets only the process-default context.

For custom tool wiring, pass `ctx` to migrated registrars:

```ts
import { registerQueryTool, registerCountTool, registerListNamespacesTool } from '…'; // internal today
registerQueryTool(server, ctx);
```

**Later:** Legacy module getters will be removed at the earliest removal minor per [deprecation-policy.md](./deprecation-policy.md).

See also [deprecation-policy.md § Future instance APIs](./deprecation-policy.md#future-instance-apis-servercontext).

---

## Unreleased: ServerContext composition API

**Rationale:** Embedders can inject client, URL generators, namespace cache seed, and suggest-flow seed at construction without process-global facades.

**Who is affected:** Library embedders calling `new ServerContext(config, client)` directly or building multi-tenant servers.

**Before:**

```ts
new ServerContext(config, pineconeClient);
```

**After:**

```ts
import {
  createIsolatedContext,
  createServer,
  resolveConfig,
  setupCoreServer,
  ServerContext,
} from '@will-cppa/pinecone-read-only-mcp';

ServerContext.fromClient(config, pineconeClient);
// or
new ServerContext(config, { client: pineconeClient });

// Multi-tenant (no process default):
const config = resolveConfig({ apiKey: '...', indexName: 'my-index' });
const ctx = createIsolatedContext(config, {
  client: myClient,
  urlGenerators: [['my-ns', myGenerator]],
});
await setupCoreServer({ context: ctx });
```

Suggest-flow gate settings (`disableSuggestFlow`, `cacheTtlMs`) remain on `ServerConfig`, not on composition.

See also [ServerContext instance APIs (initial)](#unreleased-servercontext-instance-apis-initial) for legacy vs explicit-context setup.

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

### Suggest-flow gate (`disableSuggestFlow`) — intentional divergence

| Entry point | Default | Rationale |
| ----------- | ------- | --------- |
| `resolveConfig` / `setupCoreServer` | Gate **off** (`disableSuggestFlow: true`) | Generic embedders can call `query` / `count` / `query_documents` directly; `guided_query` is the recommended ceremony-free path |
| `resolveAllianceConfig` / CLI | Gate **on** (`disableSuggestFlow: false`) | Production MCP safety: manual `query` requires `suggest_query_params` first |

**Decision (unchanged):** Exposing `guided_query` in core does **not** change the core gate default. Core keeps the gate off so direct tool access remains available; Alliance keeps the gate on for CLI/MCP deployments.

**When migrating entry points:** If you move from Alliance to core (or vice versa), query gate behavior changes unless you set `disableSuggestFlow` explicitly. Use `guided_query` to avoid the multi-step suggest flow in either setup.

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

| `code`           | `recoverable`     | Notes                                                           |
| ---------------- | ----------------- | --------------------------------------------------------------- |
| `FLOW_GATE`      | `true`            | Suggestion: call `suggest_query_params` for the namespace first |
| `VALIDATION`     | `true`            | **`field` required** — input or `metadata_filter` dot-path      |
| `PINECONE_ERROR` | `true` or `false` | Upstream / network / Pinecone failures                          |
| `TIMEOUT`        | `true`            | Outbound deadline exceeded                                      |

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

| Old (legacy)     | New                      |
| ---------------- | ------------------------ |
| `query_fast`     | `fast`                   |
| `query_detailed` | `detailed`               |
| `count`          | `count` (unchanged)      |
| _(n/a)_          | `full` (explicit preset) |

**Migration steps:**

1. Update `switch (recommended_tool)` / routing tables to the new literals.
2. When forwarding to `query`, map to `preset` (next section).

---

### 4. Unified `query` tool (replaces `query_fast` / `query_detailed`)

**Rationale:** One hybrid tool with a `preset` knob instead of duplicate registrations.

| Legacy tool call                | New `query` call                                                |
| ------------------------------- | --------------------------------------------------------------- |
| `query_fast({ ...params })`     | `query({ ...params, preset: 'fast' })`                          |
| `query_detailed({ ...params })` | `query({ ...params, preset: 'detailed' })`                      |
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
