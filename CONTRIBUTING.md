# Contributing

Thank you for contributing to `@will-cppa/pinecone-read-only-mcp`. This guide covers local setup, architecture, and pull-request expectations.

## Prerequisites

- **Node.js ≥ 20.12** (see `engines` in `package.json` — Vitest 4 / coverage require it).
- **npm** (lockfile is `package-lock.json`).
- **Pinecone API key** (optional for unit tests; required for live integration-style runs and examples that call Pinecone).

## Dev setup

```bash
git clone https://github.com/cppalliance/pinecone-read-only-mcp-typescript.git
cd pinecone-read-only-mcp-typescript
npm ci
npm run build
npm test
```

For the full local gate before pushing:

```bash
npm run ci
```

| Script | Purpose |
| ------ | ------- |
| `npm run build` | Clean `dist/` and `tsc` compile |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint on `src/` |
| `npm run lint:fix` | ESLint with `--fix` |
| `npm run format` | Prettier write (`src/**/*.ts`, config JSON) |
| `npm run format:check` | Prettier check |
| `npm test` | Vitest once |
| `npm run test:coverage` | Vitest + coverage thresholds (`vitest.config.ts`) |
| `npm run ci` | Full local gate (typecheck, lint, format, build, coverage) |
| `npm run docs:link-check` | Validate markdown links in README, CHANGELOG, and `docs/` |

## Architecture overview

The codebase is split into two layers. **`src/core/`** is the generic MCP–Pinecone bridge: `PineconeClient`, `resolveConfig`, `setupCoreServer`, and eight MCP tools including `guided_query`. Import from `@will-cppa/pinecone-read-only-mcp` (package root). **`src/alliance/`** is the C++ Alliance app layer: `suggest_query_params`, Boost/Slack URL builtins, and `setupAllianceServer` / `resolveAllianceConfig`. Import from `@will-cppa/pinecone-read-only-mcp/alliance` for the full 14-tool surface (CLI parity).

Each deployment uses a **`ServerContext`** instance that owns config, the Pinecone client, namespaces cache, URL generator registry, and the suggest-flow gate. Prefer the instance-first pattern: `createServer(config)` → `ctx.setClient(...)` → `setupCoreServer({ context: ctx })` or `setupAllianceServer({ context: ctx })`. Module-level singleton facades (`setPineconeClient`, `getDefaultServerContext`, etc.) are deprecated since 0.3.0.

The **suggest-flow gate** requires `suggest_query_params` before `query`, `count`, or `query_documents` for a namespace (unless disabled). Alliance defaults keep the gate **on**; core `resolveConfig` defaults `disableSuggestFlow` to **true** so generic embedders can query without Alliance tools. Tool handlers validate inputs with Zod and return structured **`ToolError`** JSON on failure — one of the project's quality standards for MCP consumers.

Deep reference: [docs/CONFIGURATION.md](docs/CONFIGURATION.md), [docs/TOOLS.md](docs/TOOLS.md), [README.md](README.md#architecture).

## PR conventions

- **Branch naming:** `feature/…`, `docs/…`, `bugfix/…`, or `design/…` (short, descriptive slug).
- Run **`npm run ci`** before pushing; CI must pass on the PR.
- Keep changes focused; update **`CHANGELOG.md` `[Unreleased]`** for user-visible behavior.
- Use the [pull request template](.github/PULL_REQUEST_TEMPLATE.md).
- Documentation changes: run `npm run docs:link-check` if you touch many relative links.
- PRs to `main` should receive review from a [CODEOWNERS](.github/CODEOWNERS) maintainer once branch protection is enabled.

### Deprecations and breaking changes

Follow [docs/deprecation-policy.md](docs/deprecation-policy.md). Deprecate with CHANGELOG + MIGRATION entries; use labeled `**Breaking (MCP):**` bullets for breaking releases while `0.y.z`.

### Response field stability

When changing MCP tool success shapes, put new fields under **`experimental`** unless promoted; update Zod schemas in `src/core/server/response-schemas.ts` and [docs/TOOLS.md](docs/TOOLS.md). See [docs/deprecation-policy.md § Stable vs experimental](docs/deprecation-policy.md#stable-vs-experimental-mcp-response-fields).

## Code style

- **TypeScript strict** (`strict`, `noUncheckedIndexedAccess`, etc.) — match surrounding code.
- **ESLint** and **Prettier** — `npm run lint`, `npm run format:check` (configs at repo root).
- **Zod** at MCP tool boundaries; explicit types on exported APIs.
- **No `process.env` reads** in feature code outside `resolveConfig` / CLI — thread `ServerConfig`.
- Tool errors: `jsonErrorResponse` with `ToolError` from `tool-error.ts`.
- Tests beside sources as `*.test.ts`; use Vitest.

Additional guides live under [`docs/`](docs/README.md) (TOOLS, CONFIGURATION, MIGRATION, CI_CD).
