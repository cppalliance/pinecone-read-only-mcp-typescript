# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Tagged releases are published to npm from GitHub Actions when a **GitHub Release** is published (see `.github/workflows/publish.yml`).

## [Unreleased]

### Added

- `.coderabbit.yaml` sets the pre-merge **docstring coverage** threshold to **79%** (default **80%**) so marginal documentation-only gaps do not block merges; adjust upward as coverage improves.
- `registerBuiltinUrlGenerators()` for built-in URL generators; `setupServer()` invokes it so CLI/library parity stays default.
- Discriminated result type for `listNamespacesFromKeywordIndex()` (`KeywordIndexNamespacesResult`).
- Unit tests for `withRetry` / `withTimeout` in `src/server/retry.test.ts`.
- `SERVER_VERSION` is now read from `package.json` at runtime so MCP `serverInfo` always matches the published package version.
- `--version` CLI flag prints the package version and exits.
- `list_namespaces` response now includes `expires_at_iso` so clients see the cache expiry as an ISO-8601 timestamp without converting `cache_ttl_seconds`.
- `examples/README.md` describing the library embedding sample.
- GitHub Actions **CI** matrix across **ubuntu-latest**, **windows-latest**, and **macos-latest**, each with **Node.js** **20.x** and **22.x**: typecheck, lint, Prettier, build, `test:coverage`, **CycloneDX** SBOM artifact upload (per job), **Codecov** upload (**Ubuntu** + Node **20.x** only), plus a separate **quality** job (`npm audit`, `npm pack --dry-run`).
- `npm run test:coverage` with Vitest coverage thresholds (see `vitest.config.ts`).
- `@vitest/coverage-v8` devDependency for coverage reports (`lcov`, `json-summary`, HTML).

### Changed

- **Breaking (MCP):** `suggest_query_params` and in-process suggestion flow now emit `recommended_tool` as `count` | `fast` | `detailed` | `full` (aligned with the unified `query` tool `preset`), not legacy `query_fast` / `query_detailed` strings.
- **Breaking (MCP):** Single hybrid `query` tool with `preset` (`fast` | `detailed` | `full`); removed separate `query_fast` / `query_detailed` tool registrations.
- `resolveConfig()` throws if the Pinecone API key is missing (after trim); library callers must supply `apiKey` via overrides or set `PINECONE_API_KEY`.
- `withTimeout` aborts an internal `AbortSignal` on deadline (cooperative cancellation).
- `PineconeClient`: shared hit-field extraction, safer merge dedup without empty `_id` collisions, metadata sampling skips zero-vector probe when dimension is unknown, `listNamespacesFromKeywordIndex` surfaces errors via `{ ok: false }`.
- Metadata filter manual validation accepts primitive arrays for `$in`/`$nin` including numbers (matches Zod).
- README: deployment model for process-global gate/cache/registry; adjusted feature wording vs pre-1.0 semver.
- `.npmignore` no longer excludes `dist/` (still shipped via `package.json` `files`).
- `.env.example` log-level options corrected to the four levels actually supported (`DEBUG`, `INFO`, `WARN`, `ERROR`); the stale `WARNING`/`CRITICAL` values are gone.
- README Slack URL example now matches the generator output (`https://app.slack.com/client/{team_id}/{channel_id}/p{messageId}`).
- README "Comparison with Python Version" no longer claims an identical API; the new TypeScript-only tools (`guided_query`, `query_documents`, `keyword_search`, `namespace_router`, `suggest_query_params`, `count`, `generate_urls`) are listed explicitly.
- `npm run ci` now runs `test:coverage` so merges are gated on coverage thresholds.
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

[Unreleased]: https://github.com/CppDigest/pinecone-read-only-mcp-typescript/compare/v0.1.6...HEAD
[0.1.6]: https://github.com/CppDigest/pinecone-read-only-mcp-typescript/compare/v0.1.1...v0.1.6
[0.1.1]: https://github.com/CppDigest/pinecone-read-only-mcp-typescript/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/CppDigest/pinecone-read-only-mcp-typescript/releases/tag/v0.1.0
