# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Tagged releases are published to npm from GitHub Actions when a **GitHub Release** is published (see `.github/workflows/publish.yml`).

## [Unreleased]

### Added

- **Per-source and per-namespace private config:** optional `description` (source-level) and `namespaces` map (`description` + declared `metadata_schema`) in JSON config files (`PINECONE_CONFIG_FILE`), or loaded automatically from the `_mcp_config` Pinecone namespace when not declared locally. Declared schemas skip live sampling; stale declared namespaces surface as `config_warnings` in `list_namespaces`. See [CONFIGURATION.md § Multi-source mode](docs/CONFIGURATION.md#multi-source-mode).
- **Remote `_mcp_config` schema manifest:** automatic per-source loading of description and namespace declarations from Pinecone at startup (opt out via `PINECONE_DISABLE_REMOTE_SCHEMA` / `--disable-remote-schema`); non-fatal on failure.
- **`list_namespaces`:** optional per-namespace `schema_source` (`declared` | `sampled`), optional per-namespace `description` (from private config), and top-level `config_warnings` when private config declarations do not match live Pinecone data.
- **Tests:** MCP verification harness ([src/__tests__/mcp-rc-readiness.test.ts](src/__tests__/mcp-rc-readiness.test.ts)) that drives the real server over an in-memory transport with the SDK client (initialize and protocol negotiation, the full registered tool surface, and a round-trip tool call), so a future SDK or MCP protocol bump is verified in one place. Protocol assertions key off the SDK's `LATEST_PROTOCOL_VERSION`, so pinning the RC SDK re-runs the check with no test edits. (#202)

### Changed

- **Breaking (`list_sources`):** response shape `sources: string[]` → `sources: { name, description? }[]`. Migration: [MIGRATION.md § Unreleased list_sources](docs/MIGRATION.md#unreleased-list_sources-response-shape).
- **Breaking (library API):** `PineconeClient.listNamespacesWithMetadata()` now returns `{ namespaces, warnings }` instead of a bare array. Migration: [MIGRATION.md § Unreleased PineconeClient.listNamespacesWithMetadata](docs/MIGRATION.md#unreleased-pineconeclientlistnamespaceswithmetadata-return-shape).
- **Dependencies:** Bumped the declared `@modelcontextprotocol/sdk` floor from `^1.25.3` to `^1.29.0` to match the resolved version and ready the server for the upcoming MCP RC protocol revision. `McpServer` construction and tool registration are re-verified by the harness above through `server.connect()` over the SDK in-memory transport; the production `StdioServerTransport` wiring in `src/index.ts` is unchanged and was reviewed, not exercised, by the harness. (#202)
- **Instructions:** Trimmed operator/install/deploy content (env-var setup, misconfiguration note, Alliance CLI index/rerank defaults, stderr logging config) from `CORE_SERVER_INSTRUCTIONS` and `ALLIANCE_INSTRUCTIONS_APPENDIX` — reduces per-session token cost; no behavior change. Replaced colliding Alliance appendix steps 4–5 with unnumbered "Manual Alliance flow" bullets (includes `PINECONE_DISABLE_SUGGEST_FLOW=true` escape clause). Full detail remains in [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

### Removed

- **Breaking (library):** Trimmed internal-only re-exports from the package root and `/alliance` entry to shrink the public surface and blast radius: `trimOptional`, `createUnconfiguredAllianceContext` (core), and the concrete URL generators `generatorMailing`, `generatorSlackCpplang` (alliance). These were internal helpers, not part of the documented API; register built-ins via `registerBuiltinUrlGenerators` and build contexts via `createServer` / `createIsolatedContext`. A snapshot test now guards the runtime export surface so internal symbols cannot leak back in. See [MIGRATION.md](docs/MIGRATION.md#internal-only-re-exports-removed-203). (#203)

### Fixed

- **Hybrid query degradation:** When exactly one search leg fails and the surviving leg returns zero hits, `query` / `query_documents` / `guided_query` now set `experimental.hybrid_leg_failed` and `experimental.degraded: true` with `degradation_reason` `dense_leg_failed` or `sparse_leg_failed`, so empty results from a leg failure are distinguishable from a legitimately empty namespace. (#228)

## [0.4.0] - 2026-06-24

### Added

- **Multi-source mode:** configure multiple Pinecone API keys / indexes in one MCP server via `PINECONE_SOURCES`, `--sources`, or a JSON config file (`PINECONE_CONFIG_FILE` / `--config-file`). New `list_sources` tool (when more than one source is configured). Optional `source` parameter on discovery and query tools; `list_namespaces` aggregates across sources and tags each namespace with `source`. See [CONFIGURATION.md](docs/CONFIGURATION.md#multi-source-mode), [TOOLS.md](docs/TOOLS.md#multi-source-mode), and deployment profiles in [CONFIGURATION.md](docs/CONFIGURATION.md#deployment-profiles). Migration: [MIGRATION.md § 0.4.0 multi-source](docs/MIGRATION.md#040-multi-source-pinecone-projects).

### Changed

- **Breaking (types):** `resolveConfig()` returns `CoreServerConfig`; `resolveAllianceConfig()` returns `AllianceServerConfig`. `setupCoreServer` / `setupAllianceServer` accept only their respective branded config and context types (`CoreServerContext` / `AllianceServerContext`). `ServerConfig` remains an alias for `ServerConfigBase` on read paths (`ctx.getConfig()`). See [MIGRATION.md § 0.4.0 branded ServerConfig](docs/MIGRATION.md#040-branded-serverconfig-types).
- **Library (internal):** Query and `keyword_search` response Zod schemas consolidated to a single canonical schema per type; permissive variants are derived via `.partial()` (no MCP payload shape change). See comment in `src/core/server/response-schemas.ts`.

## [0.3.0] - 2026-06-23

### Added

- `guided_query` tool registered by `setupCoreServer` / package-root import (core-layer handler; no Alliance URL generators or index defaults required).
- `ServerContextComposition` interface plus `NamespaceCacheSeed` and `SuggestionFlowSeedEntry` types for dependency injection into `ServerContext`.
- `createIsolatedContext(config, composition?)` factory for multi-tenant embedders (no process-global side effects).
- Zod schemas for all nine MCP tool success responses (`queryResponseSchema`, `guidedQueryResponseSchema`, etc.) exported from the package root for client-side validation. Success payloads are runtime-validated before return.
- Stable vs experimental response field taxonomy documented in [docs/TOOLS.md](docs/TOOLS.md) and [docs/deprecation-policy.md](docs/deprecation-policy.md#stable-vs-experimental-mcp-response-fields).
- Formal deprecation policy ([docs/deprecation-policy.md](docs/deprecation-policy.md)) and breaking-change release notes template ([docs/templates/breaking-change-release-notes.md](docs/templates/breaking-change-release-notes.md)).

### Changed

- **Breaking (pre-1.0, core):** `ServerContext` constructor second positional argument is now `composition?: ServerContextComposition` (was `client?: PineconeClient`). Migration: use `ServerContext.fromClient(config, client)` or `new ServerContext(config, { client })`.
- `createServer(config, composition?)` now accepts an optional composition object.
- **Breaking (MCP):** Experimental tool response fields are nested under `experimental` on success payloads. Affected tools: `query`, `query_documents`, `guided_query`. Fields moved: `degraded`, `degradation_reason`, `hybrid_leg_failed`, `rerank_skipped_reason` (query-shaped tools); `decision_trace` (`guided_query`). Stable fields (`status`, `results`, `namespace`, etc.) are unchanged. See [MIGRATION.md](docs/MIGRATION.md#unreleased-stable-vs-experimental-response-fields).
- **Breaking (core):** `resolveConfig` requires a Pinecone index name and no longer applies Alliance index/rerank defaults. Removed exported `DEFAULT_INDEX_NAME` and `DEFAULT_RERANK_MODEL` from the package root. Rerank is opt-in when `PINECONE_RERANK_MODEL` / `rerankModel` is unset.
- **Breaking (core):** `setupCoreServer` MCP `instructions` use `CORE_SERVER_INSTRUCTIONS` (includes `guided_query`; no `suggest_query_params`). `resolveConfig` defaults `disableSuggestFlow` to `true` so `query` / `count` / `query_documents` work without Alliance tools. Alliance CLI / `resolveAllianceConfig` unchanged: gate on by default, `ALLIANCE_SERVER_INSTRUCTIONS`.
- **Alliance CLI / `resolveAllianceConfig`:** When index or rerank env/CLI values are omitted, defaults remain `rag-hybrid` and `bge-reranker-v2-m3` (API-key-only MCP configs unchanged). See [examples/alliance/.env.example](examples/alliance/.env.example).
- **Breaking (library):** Trimmed public re-exports — `buildQueryExperimental` and `buildGuidedQueryExperimental` removed from package root and `/alliance` entry. See [MIGRATION.md](docs/MIGRATION.md#unreleased-trimmed-library-exports).

### Deprecated

- Module-level singleton facades — use `ServerContext` instance methods via `createServer(config)` and `{ context: ctx }` at setup instead. Deprecated in **0.3.0**; earliest removal **0.5.0** per [deprecation-policy.md](docs/deprecation-policy.md#deprecation-window). Affected symbols: `getPineconeClient`, `setPineconeClient`, `clearPineconeClient`, `getServerConfig`, `setServerConfig`, `resetServerConfig`, `registerUrlGenerator`, `unregisterUrlGenerator`, `generateUrlForNamespace`, `hasUrlGenerator`, `resetUrlGenerationRegistry`, `markSuggested`, `requireSuggested`, `resetSuggestionFlow`, `getNamespacesWithCache`, `invalidateNamespacesCache`, `getDefaultServerContext`. Opt-in runtime warnings when `PINECONE_DEPRECATION_WARNINGS=1` or log level is `DEBUG`. See [MIGRATION.md § Legacy module-facade deprecations](docs/MIGRATION.md#030-legacy-module-facade-deprecations) and [deprecation-policy.md](docs/deprecation-policy.md#active-deprecations-legacy-module-facades).

### Removed

- **Breaking (library):** `buildQueryExperimental` and `buildGuidedQueryExperimental` are no longer re-exported from `@will-cppa/pinecone-read-only-mcp` or `@will-cppa/pinecone-read-only-mcp/alliance`. They were internal helpers used to assemble the `experimental` block on `query` / `query_documents` / `guided_query` success payloads. The assembled fields and Zod schemas (`queryResponseSchema`, `QueryExperimental`, etc.) are unchanged — see [Unreleased stable vs experimental](docs/MIGRATION.md#unreleased-stable-vs-experimental-response-fields).
- **No change:** `HybridQueryResult`, `HybridLegFailed`, and `KeywordIndexNamespacesResult` remain exported as the declared return types of public `PineconeClient` methods.

### Fixed

- Legacy module facades no longer silently diverge from an explicit `ServerContext` passed to `setupCoreServer` / `setupAllianceServer`. Mixing legacy facades with `{ context: ctx }` setup now throws with migration guidance instead of dual-state behavior.

## [0.2.0] - 2026-05-29

- Package root export is the generic **core** layer (`setupCoreServer`); full CLI parity uses `@will-cppa/pinecone-read-only-mcp/alliance` (`setupAllianceServer`, built-in URL generators). `resolveConfig` uses env when set, else defaults: index **`rag-hybrid`**, rerank **`bge-reranker-v2-m3`** (constants `DEFAULT_INDEX_NAME` / `DEFAULT_RERANK_MODEL` in `src/core/config.ts`).
- When reranking was requested but `PineconeClient` has no rerank model (manual library use): `query` / `query_documents` include `rerank_skipped_reason: no_model`; `guided_query` sets `decision_trace.rerank_status: skipped_no_model`.

### Added

- `UrlGeneratorFn` type alias (same as `UrlGenerator`) and `RegisterBuiltinUrlGeneratorsOptions` with `reinstallBuiltins` on `registerBuiltinUrlGenerators()` to restore default `mailing` / `slack-Cpplang` generators after overrides; README “Custom URL generators” section and tests for custom registration and built-in override.
- Zod `toolErrorSchema` and exported types `ToolError` / `ToolErrorCode` for parsing MCP tool failures; all tools now return this JSON shape in the text content when `isError` is true.
- `validateMetadataFilterDetailed()` returns `{ message, field }` for invalid filters; `validateMetadataFilter()` remains a string-only wrapper for backward compatibility.
- `.coderabbit.yaml` sets the pre-merge **docstring coverage** threshold to **79%** (default **80%**) so marginal documentation-only gaps do not block merges; adjust upward as coverage improves.
- `registerBuiltinUrlGenerators()` for built-in URL generators; `setupServer()` invokes it so CLI/library parity stays default.
- Discriminated result type for `listNamespacesFromKeywordIndex()` (`KeywordIndexNamespacesResult`).
- Unit tests for `withRetry` / `withTimeout` in `src/server/retry.test.ts`.
- `SERVER_VERSION` is now read from `package.json` at runtime so MCP `serverInfo` always matches the published package version.
- `--version` CLI flag prints the package version and exits.
- `list_namespaces` response now includes `expires_at_iso` so clients see the cache expiry as an ISO-8601 timestamp without converting `cache_ttl_seconds`.
- `examples/README.md` describing the library embedding sample.
- GitHub Actions **CI** matrix across **ubuntu-latest**, **windows-latest**, and **macos-latest**, each with **Node.js** **20.x** and **22.x**: typecheck, lint, Prettier, build, `test:coverage`, **CycloneDX** SBOM artifact upload (per job), **Codecov** upload (**Ubuntu** + Node **20.x** only), plus a separate **quality** job (`npm audit`, `npm pack --dry-run`, **markdown-link-check** on README/CHANGELOG/docs).
- Vitest **global** coverage thresholds in `vitest.config.ts` (lines 73%, statements 72%, branches 58%, functions 76% — measured baseline minus slack); `npm run test:coverage` exits non-zero when any bucket regresses.
- `@vitest/coverage-v8` devDependency for coverage reports (`lcov`, `json-summary`, HTML).
- `docs/` reference set (TOOLS, CONFIGURATION, SECURITY, CONTRIBUTING, CI_CD, FAQ, MIGRATION, RELEASING) and worked examples `examples/suggest-flow-demo.ts`, `examples/guided-query-demo.ts`, `examples/library-embedding-demo.ts`.
- `teardownServer()` export to reset process-global MCP state (suggest-flow gate, namespaces cache, URL generator registry, active config, shared `PineconeClient`) so `setupServer()` can run again in the same Node process (tests, re-embedding).
- Namespace trimming for the suggest-flow gate and gated tools (`normalizeNamespace`); use the same trimmed `namespace` for `suggest_query_params` and downstream `query` / `count` / `query_documents`.
- Successful `query` / `query_documents` / `guided_query` payloads may include `degraded`, `degradation_reason`, and `hybrid_leg_failed` when rerank or a hybrid leg fails but the tool still returns hits; `guided_query` `decision_trace` adds `rerank_status`.

### Changed

- **Breaking (MCP):** Tool error bodies no longer use `{ status: 'error', message }`. Failures are typed `ToolError` objects: `code` (`FLOW_GATE` | `VALIDATION` | `PINECONE_ERROR` | `TIMEOUT`), `message`, `recoverable`, optional `suggestion`, and optional `field` (required for `VALIDATION`). The outer MCP result still sets `isError: true`.
- **Breaking (types):** `QueryResponse` and exported `KeywordSearchResponse` no longer include `status: 'error'` / error-only fields; errors use `ToolError` only.
- **Breaking (MCP):** `suggest_query_params` and in-process suggestion flow now emit `recommended_tool` as `count` | `fast` | `detailed` | `full` (aligned with the unified `query` tool `preset`), not legacy `query_fast` / `query_detailed` strings.
- **Breaking (MCP):** Single hybrid `query` tool with `preset` (`fast` | `detailed` | `full`); removed separate `query_fast` / `query_detailed` tool registrations.
- `resolveConfig()` throws if the Pinecone API key is missing (after trim); library callers must supply `apiKey` via overrides or set `PINECONE_API_KEY`.
- `withTimeout` aborts an internal `AbortSignal` on deadline (cooperative cancellation).
- `PineconeClient`: constructor reads index name, rerank model, and default top-k only from `PineconeClientConfig` (not `process.env`); shared hit-field extraction, safer merge dedup without empty `_id` collisions, metadata sampling skips zero-vector probe when dimension is unknown, `listNamespacesFromKeywordIndex` surfaces errors via `{ ok: false }`.
- `setupServer()` throws if called twice in one process without `teardownServer()` first; README library-embedding section documents the teardown pattern.
- Metadata filter manual validation accepts primitive arrays for `$in`/`$nin` including numbers (matches Zod).
- README: deployment model for process-global gate/cache/registry; adjusted feature wording vs pre-1.0 semver.
- `.npmignore` no longer excludes `dist/` (still shipped via `package.json` `files`).
- `.env.example` log-level options corrected to the four levels actually supported (`DEBUG`, `INFO`, `WARN`, `ERROR`); the stale `WARNING`/`CRITICAL` values are gone.
- README Slack URL example now matches the generator output (`https://app.slack.com/client/{team_id}/{channel_id}/p{messageId}`).
- README "Comparison with Python Version" no longer claims an identical API; the new TypeScript-only tools (`guided_query`, `query_documents`, `keyword_search`, `namespace_router`, `suggest_query_params`, `count`, `generate_urls`) are listed explicitly.
- CI **quality** job: `npm run docs:link-check` runs `markdown-link-check` in a single `npx` invocation over `README.md`, `CHANGELOG.md`, and all `docs/**/*.md` (via `scripts/docs-link-check.mjs`) instead of one `npx` per file under `docs/`.
- **Breaking (runtime / tooling):** `engines.node` is now **>=20.12.0**. Vitest **4** (bundled **rolldown**) imports `util.styleText` from `node:util` (added in Node **20.12**), and **`@vitest/coverage-v8`** uses `node:inspector/promises` (Node **≥19**). CI tests only **20.x** and **22.x**.
- Dependabot groups related **vitest**, **typescript-eslint**, and **eslint/prettier** updates.

### Removed

- Dead `test:mcp` npm script (referenced a `test-mcp-server.js` file that has never existed).

## [0.1.6] - 2026-04-24

Historical 0.1.x releases (0.1.0 → 0.1.6) shipped the full tool surface
(`list_namespaces`, `namespace_router`, `suggest_query_params`, `count`,
`query`, `query_fast`, `query_detailed`, `keyword_search`, `query_documents`,
`guided_query`, `generate_urls`), the structured `src/logger.ts`, the
`Dockerfile`, and the modularised `src/server/` layout. See git history for
details. Newer shipped changes are recorded in this changelog by version.

## [0.1.1] - 2026-01-27

### Changed

- Enhanced TypeScript strict mode with additional compiler checks:
  - Added `noUncheckedIndexedAccess` for safer array/object access
  - Added `noImplicitOverride` to require explicit override keywords
  - Added `noPropertyAccessFromIndexSignature` to enforce bracket notation for index signatures
- Updated all code to use bracket notation for environment variables and dynamic property access
- Simplified build script to use standard `tsc` command

### Fixed

- Fixed build script that was suppressing TypeScript compilation errors with `|| exit 0`
- Fixed all type safety issues to comply with stricter TypeScript checks

## [0.1.0] - 2026-01-26

### Added

- Initial release of TypeScript version
- Feature parity with Python version
- Production-ready implementation with:
  - Lazy initialization
  - Connection pooling
  - Error handling
  - Input validation
  - Configurable logging
- CLI interface with multiple options
- Environment variable support
- Full documentation and examples

[Unreleased]: https://github.com/cppalliance/pinecone-read-only-mcp-typescript/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/cppalliance/pinecone-read-only-mcp-typescript/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/cppalliance/pinecone-read-only-mcp-typescript/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/cppalliance/pinecone-read-only-mcp-typescript/compare/v0.1.6...v0.2.0
[0.1.6]: https://github.com/cppalliance/pinecone-read-only-mcp-typescript/compare/v0.1.1...v0.1.6
[0.1.1]: https://github.com/cppalliance/pinecone-read-only-mcp-typescript/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/cppalliance/pinecone-read-only-mcp-typescript/releases/tag/v0.1.0
