# Deprecation policy

This document defines how **`@will-cppa/pinecone-read-only-mcp`** deprecates and removes public APIs. It applies to:

- npm package exports (`@will-cppa/pinecone-read-only-mcp` core and `/alliance`)
- MCP tool input/output schemas and registered tool names
- TypeScript types and functions published from `package.json` `exports`

For step-by-step upgrades, see [MIGRATION.md](./MIGRATION.md). For publish mechanics, see [RELEASING.md](./RELEASING.md).

## Semantic versioning while `0.y.z`

This package currently ships as **`0.y.z`**. Under [Semantic Versioning §4](https://semver.org/spec/v2.0.0.html#spec-item-4), **minor releases may include breaking changes** until the first `1.0.0` release. Consumers should **pin an exact version** (for example `@will-cppa/pinecone-read-only-mcp@0.2.0`) in `package.json`, MCP server config, and Docker tags.

After **`1.0.0`**, this project intends to follow standard semver: breaking changes land only in **major** releases, and the deprecation window below becomes **binding** for removals that were previously announced as deprecated.

## Deprecation window

When we deprecate a public surface (field, type, tool name, export, or behavior):

| Phase | When | Requirement |
| ----- | ---- | ------------- |
| **Deprecated** | Minor release `0.N.0` (or patch if only docs/warnings) | Listed under `### Deprecated` in [CHANGELOG.md](../CHANGELOG.md) with a **removal target** (minimum next minor + one more minor, i.e. at least **two minor releases** later). |
| **Supported** | Entire window | Replacement API available; [MIGRATION.md](./MIGRATION.md) documents before/after. |
| **Removed** | No earlier than `0.(N+2).0` | Listed under `### Removed`; migration section retained in MIGRATION.md for one further release when practical. |

**Example:** deprecated in `0.2.x` → earliest removal in `0.4.0`.

Renames may ship the **replacement immediately** alongside the deprecated alias (for example `document_id` with `paper_number` still present). Consumers should migrate to the replacement during the window.

### Grandfathered deprecations

APIs deprecated **before** this policy was published follow the removal target recorded in CHANGELOG and source comments at deprecation time. The `paper_number` field on query result rows (use `document_id` instead) was deprecated in **0.2.0** with removal planned no earlier than the **next major** release after `1.0.0`; it will not be removed in a `0.y` minor without an explicit CHANGELOG entry and MIGRATION update.

### Active deprecations — legacy module facades

Module-level singleton facades delegate to `getDefaultServerContext()`. Migrate to **`ServerContext`** instance methods via `createServer(config)` and pass `{ context: ctx }` to `setupCoreServer` / `setupAllianceServer`. Deprecated in the **next published minor** after merge; earliest removal **two minor releases later** (per [Deprecation window](#deprecation-window) above). See [MIGRATION.md § Legacy module-facade deprecations](./MIGRATION.md#unreleased-legacy-module-facade-deprecations).

| Facade | Layer | Replacement | Deprecated in | Earliest removal |
| ------ | ----- | ----------- | ------------- | ---------------- |
| `getPineconeClient` / `setPineconeClient` / `clearPineconeClient` | core | `ctx.getClient()` / `ctx.setClient()` / `ctx.clearClient()` | next minor (TBD at release) | two minors after deprecation minor |
| `getServerConfig` / `setServerConfig` / `resetServerConfig` | core | `ctx.getConfig()` / `ctx.setConfig()` / `ctx.teardown()` | next minor (TBD at release) | two minors after deprecation minor |
| `registerUrlGenerator` / `unregisterUrlGenerator` / `generateUrlForNamespace` / `hasUrlGenerator` / `resetUrlGenerationRegistry` | core | `ctx.registerUrlGenerator()` etc. / `ctx.resetUrlGenerators()` | next minor (TBD at release) | two minors after deprecation minor |
| `markSuggested` / `requireSuggested` / `resetSuggestionFlow` | core | `ctx.markSuggested()` / `ctx.requireSuggested()` / `ctx.resetSuggestionFlow()` | next minor (TBD at release) | two minors after deprecation minor |
| `getNamespacesWithCache` / `invalidateNamespacesCache` | core | `ctx.getNamespacesWithCache()` / `ctx.invalidateNamespacesCache()` | next minor (TBD at release) | two minors after deprecation minor |
| `getDefaultServerContext` | core | Return value of `createServer` or explicit `context` at setup | next minor (TBD at release) | two minors after deprecation minor |

`teardownServer()` remains supported during the deprecation window; prefer `ctx.teardown()` or `await using` on the setup handle. Documented in MIGRATION.md; not marked `@deprecated` until a later release.

## How we deprecate (maintainer checklist)

For each deprecated public surface:

1. **CHANGELOG** — Add under `[Unreleased]` → `### Deprecated` with removal target version and link to MIGRATION.
2. **MIGRATION.md** — Add a section with rationale, before/after examples, and anchor-friendly heading.
3. **Types** — Add JSDoc `@deprecated` on exported TypeScript symbols where applicable.
4. **Runtime (optional)** — For MCP-visible response fields, emit at most **one `WARN` log per process** per deprecation (see existing `paper_number` pattern in `format-query-result.ts`).
5. **Alliance vs core** — State which layer (`core` or `alliance`) owns the surface when only one changes.

Do **not** remove a deprecated surface without completing items 1–2 and without waiting for the deprecation window (unless semver allows an immediate breaking minor while `0.y.z` — see below).

## Migration support commitment

For every deprecated public API we commit to:

- **Documented migration** in [MIGRATION.md](./MIGRATION.md) for at least the full deprecation window.
- **No silent removal** — removal appears in CHANGELOG `### Removed` and references the MIGRATION anchor.
- **Clear ownership** — note when a change affects only Alliance presets, only core, or both.

Breaking changes that ship **without** a prior deprecation period (allowed while `0.y.z` for minors, or for security fixes) still require a MIGRATION section and, when user-visible, [breaking-change release notes](./templates/breaking-change-release-notes.md).

## Breaking changes without prior deprecation

While **`0.y.z`**, a minor release **may** ship breaking changes without a prior deprecation cycle (as in **0.2.0**). Such releases must still include:

- CHANGELOG entries using **`Breaking (MCP):`**, **`Breaking (types):`**, **`Breaking (runtime / tooling):`**, or similar categories (see [CHANGELOG format](#changelog-format-for-breaking-changes)).
- [MIGRATION.md](./MIGRATION.md) upgrade steps.
- GitHub Release notes from the [breaking-change template](./templates/breaking-change-release-notes.md) when the release is published.

Security fixes may break behavior when required; document impact in CHANGELOG and MIGRATION.

## Stable vs experimental MCP response fields

MCP tool **success** responses separate fields into two tiers:

| Tier | Meaning | Location in JSON |
| ---- | ------- | ---------------- |
| **Stable** | Safe to depend on across minor version bumps after `1.0.0` | Top-level keys (`status`, `results`, `namespace`, `count`, etc.) |
| **Experimental** | May change or be removed before `1.0.0` | Nested under `experimental` when present |

Current experimental fields (see [TOOLS.md](./TOOLS.md) per tool):

- `degraded`, `degradation_reason`, `hybrid_leg_failed`, `rerank_skipped_reason` — query-shaped tools (`query`, `query_documents`, and `guided_query.result` when applicable)
- `decision_trace` — `guided_query` only

The `experimental` key is **omitted** when no experimental fields are set.

### Promoting experimental → stable

To promote a field from experimental to stable:

1. **CHANGELOG** — `### Changed` entry describing the promotion and target release.
2. **TOOLS.md** — Move the field from the Experimental to Stable table for the affected tool(s).
3. **Schema** — Move the field out of `experimental` in `response-schemas.ts` and update handler builders.
4. **MIGRATION.md** — Document before/after for integrators.

New response fields added before `1.0.0` default to `experimental` unless explicitly promoted through this process.

## Future instance APIs (`ServerContext`)

Legacy module-level facades are deprecated per the [active deprecations table](#active-deprecations-legacy-module-facades) above. `ServerContext` + `createServer` / setup APIs are the supported public contract going forward.

See [MIGRATION.md § Legacy module-facade deprecations](./MIGRATION.md#unreleased-legacy-module-facade-deprecations) for before/after embedder snippets.

## CHANGELOG format for breaking changes

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). Each version block should use the sections that apply: `### Added`, `### Changed`, `### Deprecated`, `### Removed`, `### Fixed`.

### Breaking entries

Group breaking items under `### Changed` (or a dedicated breaking subsection) using category labels:

```markdown
### Changed

- **Breaking (MCP):** …
- **Breaking (types):** …
- **Breaking (runtime / tooling):** …
```

Each breaking bullet should state:

- **What changed** — concrete behavior or schema difference.
- **Who is affected** — MCP clients, library embedders, operators, etc.
- **Migration** — link to [MIGRATION.md](./MIGRATION.md#anchor) (or “see MIGRATION.md § …”).

### Deprecated entries

```markdown
### Deprecated

- `old_name` on … — use `new_name` instead; removal targeted in **0.4.0** (deprecated **0.2.0**). See [MIGRATION.md](./MIGRATION.md#anchor).
```

Contributors: see [CONTRIBUTING.md](./CONTRIBUTING.md) for PR expectations.

## Release hygiene

- **`package.json` `version`** is the single source of truth for the published npm version.
- **`SERVER_VERSION`** (MCP `serverInfo.version`) is read from `package.json` at runtime and must stay aligned (see [RELEASING.md](./RELEASING.md)).
- Breaking GitHub Releases should use [docs/templates/breaking-change-release-notes.md](./templates/breaking-change-release-notes.md).

## Related documentation

| Document | Role |
| -------- | ---- |
| [MIGRATION.md](./MIGRATION.md) | Per-version upgrade how-to |
| [CHANGELOG.md](../CHANGELOG.md) | Authoritative change list |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | PR and CHANGELOG expectations |
| [RELEASING.md](./RELEASING.md) | npm publish via GitHub Releases |
| [templates/breaking-change-release-notes.md](./templates/breaking-change-release-notes.md) | GitHub Release body template |
