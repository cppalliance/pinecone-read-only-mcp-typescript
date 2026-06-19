# Core / Alliance package split evaluation

## Executive summary

| Question                                        | Answer                                                                                                                                                                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Can core and alliance be separate npm packages? | **Yes, technically feasible.** Production dependency is one-way (`alliance` → `core`); no circular imports.                                                                                                                      |
| Which consumers use which layer?                | **Alliance layer:** CLI, MCP client configs, Alliance examples, internal C++ Alliance deployments. **Core layer:** generic embedders, core-only setup, shared types/errors. No known external community consumers yet (pre-1.0). |
| Recommended package structure                   | **npm workspace monorepo** in this repository (not separate git repos) if/when the split proceeds.                                                                                                                               |
| **Decision**                                    | **Split later** — after legacy facade deprecation completes and one deprecation window has elapsed. Keep the unified package until then; tighten barrel exports in the interim (see [§6.1](#61-interim-measures-while-unified)). |
| **`guided_query` placement**                    | **Core** (`src/core/server/tools/guided-query-tool.ts`). Alliance re-exports for backward compatibility only; no third orchestration package.                                                                                   |
| **Coherence cost (eval §5.3)**                  | Same `query` tool has different gate behavior per entry point (`disableSuggestFlow` defaults differ). Documented; not resolved by package split alone.                                                                           |

The source boundary (`src/core/` vs `src/alliance/`) is already clean enough to become a package boundary. The remaining blockers are public API surface (legacy module facades still exported from core), build/workspace tooling (not yet present), and low external adoption incentive while the project is still pre-1.0.

---

## 1. Problem statement

The eval describes generic MCP infrastructure and Alliance-specific URL generators, server instructions, and tools shipping in a single npm package `@will-cppa/pinecone-read-only-mcp`. The closed extension surface finding (T23) notes that adding namespace-specific URL patterns, new MCP tools, or custom response transformations requires source modification — a barrier to adoption by non-Alliance consumers.

Evaluating a package split determines whether the **core MCP bridge** (generic, stable) and the **Alliance app layer** (domain-specific, iterating) should decouple their release cadences so that Alliance-only changes stop forcing shared version bumps across the non-test source tree.

This document evaluates whether to make that boundary an **npm package** boundary.

---

## 2. Current architecture snapshot

### 2.1 Single package, dual export conditions

Today one package publishes two entry points via `package.json` `exports`:

| Export         | Build output             | Surface                                                                                                                                          |
| -------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `"."`          | `dist/core/index.js`     | **8** core MCP tools (including `guided_query`), `ServerContext`, `setupCoreServer`, `resolveConfig`, URL registry API, shared types             |
| `"./alliance"` | `dist/alliance/index.js` | Re-exports all of core **plus** `setupAllianceServer`, `resolveAllianceConfig`, `suggest_query_params`, Boost/Slack URL builtins                 |

The CLI binary (`pinecone-read-only-mcp` → `dist/index.js`) is a thin composition root that always wires the Alliance path: `resolveAllianceConfig` → `createServer` → `setupAllianceServer`.

### 2.2 Source layout

| Layer       | Location                                                          | Non-test `.ts` lines (approx.) | Role                                                                                                       |
| ----------- | ----------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Core        | `src/core/`                                                       | ~3,250                         | Generic MCP–Pinecone bridge: 8 tools (incl. `guided_query`), `ServerContext`, formatters, caches, suggestion engine, URL registry |
| Alliance    | `src/alliance/`                                                   | ~600                           | Alliance config defaults, `suggest_query_params`, mailing/Slack URL builtins, `setupAllianceServer`          |
| Shared root | `src/constants.ts`, `types.ts`, `logger.ts`, `cli.ts`, `index.ts` | ~670                           | Instructions constants, shared types, logging, CLI parsing                                                 |

**Total non-test source:** ~4,500 lines (issue eval cited ~2,800; count has grown with ServerContext phases and tests are excluded here).

### 2.3 Dependency direction

```mermaid
flowchart LR
  subgraph pkg ["@will-cppa/pinecone-read-only-mcp (single package today)"]
    core["src/core/ export '.'"]
    alliance["src/alliance/ export './alliance'"]
    shared["constants.ts types.ts logger.ts cli.ts"]
    cli["index.ts CLI bin"]
  end
  alliance -->|"~17 production import statements"| core
  alliance --> shared
  core --> shared
  cli --> alliance
  cli --> core
```

**Production code:** `src/alliance/` imports from `src/core/`; `src/core/` does **not** import from `src/alliance/`.

**Test-only reverse imports** (4 files under `src/core/`):

- `src/core/setup-multi-instance.test.ts`
- `src/core/setup-guards.test.ts`
- `src/core/server.test.ts`
- `src/core/server/redaction.test.ts`

These are manageable in a split (move to an integration test package or add `@will-cppa/pinecone-read-only-mcp-alliance` as a devDependency of core tests).

### 2.4 Alliance-specific surface today

| Artifact       | Location                       | Alliance-specific content                                                                                               |
| -------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| URL generators | `src/alliance/url-builtins.ts` | `mailing`, `slack-Cpplang` namespace patterns                                                                           |
| MCP tools      | `src/alliance/tools/`          | `suggest_query_params` only (`guided_query` lives in core; Alliance file is a re-export shim)                             |
| Config         | `src/alliance/config.ts`       | Defaults: index `rag-hybrid`, rerank `bge-reranker-v2-m3`, suggest-flow gate on (`disableSuggestFlow: false`)           |
| Setup          | `src/alliance/setup.ts`        | Delegates to `setupCoreServer`, then registers builtins + `suggest_query_params`                                        |
| Instructions   | `src/constants.ts`             | `ALLIANCE_SERVER_INSTRUCTIONS` = `CORE_SERVER_INSTRUCTIONS` + Alliance appendix; deprecated `SERVER_INSTRUCTIONS` alias |

Core setup uses `CORE_SERVER_INSTRUCTIONS` (**8** tools). Alliance setup uses `ALLIANCE_SERVER_INSTRUCTIONS` (**9** tools: core eight plus `suggest_query_params`).

### 2.5 Eval §5.3 coherence cost: `disableSuggestFlow` divergence

The eval (§5.3, finding T9) flags a behavioral split invisible from package names alone: the same `query`, `count`, and `query_documents` handlers enforce different prerequisites depending on which config resolver initialized the server.

| Entry point | Resolver | `disableSuggestFlow` default | Effect |
| ----------- | -------- | ---------------------------- | ------ |
| Package root / `setupCoreServer` | `resolveConfig` | `true` (gate **off**) | Direct `query` allowed; `guided_query` is the ceremony-free path |
| CLI / `setupAllianceServer` | `resolveAllianceConfig` | `false` (gate **on**) | `query` returns `FLOW_GATE` without prior `suggest_query_params` |

**Why this matters for a package split:** splitting core and Alliance into separate npm packages does **not** remove this divergence — it is encoded in two config functions that would remain in their respective packages. Consumers who switch entry points (or import from `"."` vs `"./alliance"`) can change gate behavior without changing package version. That is a **coherence tax**: documentation, cross-entry-point tests (`src/__tests__/cross-entry-point.test.ts`), and embedder mental models must track intentional defaults.

**Mitigations while unified:**

- Document the table in [CONFIGURATION.md](./CONFIGURATION.md) and [MIGRATION.md](./MIGRATION.md) (done).
- Recommend `guided_query` for single-call retrieval in both setups (core now registers it).
- Allow explicit `disableSuggestFlow` override when migrating between entry points.

**Mitigations at split:** keep the same default divergence but scope it to package choice (core package docs vs Alliance package docs), or align defaults at 1.0 as a coordinated breaking change (see week-plan Item 7).

### 2.6 `guided_query` placement (core vs Alliance vs third package)

| Option | Verdict | Rationale |
| ------ | ------- | --------- |
| **Core** | **Chosen** | Orchestration uses only core dependencies: `namespace_router`, `suggestQueryParams`, and `query`/`count` handlers. No Alliance URL generators or Alliance index/rerank defaults required. |
| **Alliance** | Rejected as sole owner | Would force core embedders through Alliance for the primary ceremony-reducing tool; contradicts Item 8 goal. |
| **Third orchestration package** | Rejected | Adds a third publish/CI surface for ~250 lines with no independent consumer; Alliance would still depend on it, recreating the coupling problem. |

**Implementation today:** handler in `src/core/server/tools/guided-query-tool.ts`, registered by `setupCoreServer`. `src/alliance/tools/guided-query-tool.ts` re-exports `registerGuidedQueryTool` for any Alliance-internal imports; Alliance setup does not register a second handler.

**Split implication:** `guided_query` ships in the core package. Alliance package adds URL enrichment via builtins registered on `ServerContext`, not via a separate tool implementation.

### 2.7 What is already decoupled

The ServerContext instance API on main established:

- Per-instance `ServerContext` with URL registry, suggest-flow gate, namespaces cache, and client slot
- All tool handlers (8 core + Alliance's `suggest_query_params`) accept optional `ctx`
- `setupCoreServer({ context? })` and `setupAllianceServer({ context? })` support multi-instance embedding without `teardownServer()` between setups
- `src/core/index.ts` documents core as the generic programmatic entrypoint; `src/alliance/index.ts` re-exports core for Alliance consumers

The **source** boundary is production-ready. The **npm** boundary is not yet implemented.

---

## 3. Technical feasibility

### 3.1 Verdict: feasible with moderate build-tooling work

Separating core and alliance into distinct npm packages is **technically feasible** because:

1. **Acyclic dependency graph** — Alliance depends on core; core never depends on Alliance in production code.
2. **Clear ownership** — Core owns generic tools (including `guided_query`) and infrastructure; Alliance owns domain config, builtins, and `suggest_query_params`.
3. **Existing export split** — Consumers already import from `"."` vs `"./alliance"`; a package split mostly changes _where those paths resolve_, not embedder mental models.

### 3.2 Files that must move or be split

| File / module      | Current use                                   | Recommended owner if split                                                                      |
| ------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/core/**`      | Core package body                             | `@will-cppa/pinecone-read-only-mcp` (keep name)                                                 |
| `src/alliance/**`  | Alliance package body                         | `@will-cppa/pinecone-read-only-mcp-alliance` (new name)                                         |
| `src/types.ts`     | Shared response/query types                   | Core (Alliance imports from core)                                                               |
| `src/logger.ts`    | Structured logging, redaction                 | Core (Alliance imports from core)                                                               |
| `src/constants.ts` | Mixed: `CORE_*` and `ALLIANCE_*` instructions | Split: core constants in core package; Alliance appendix + deprecated alias in Alliance package |
| `src/cli.ts`       | CLI flag parsing                              | Alliance package (CLI is Alliance-default) or shared thin CLI package (not recommended)         |
| `src/index.ts`     | CLI entry (`bin`)                             | Alliance package                                                                                |

A third micro-package for logging or types alone is **not recommended** — it adds publish/CI overhead without meaningful decoupling benefit.

### 3.3 Import changes at package boundary

Today `src/alliance/index.ts` does:

```ts
export * from '../core/index.js';
```

After a split this becomes a real npm dependency:

```ts
export * from '@will-cppa/pinecone-read-only-mcp';
```

All relative `../core/...` imports inside Alliance become package imports. TypeScript project references or path mapping in a workspace root `tsconfig.json` support local development linking.

### 3.4 Build and workspace tooling gap

The repository is a **single-package** npm project today. No `pnpm-workspace.yaml`, `lerna.json`, `nx.json`, or `turbo.json` exists.

#### Shared runtime dependencies (version alignment burden)

Both packages would share the same four production dependencies from the root `package.json`:

| Dependency | Current range | Alignment note |
| ---------- | ------------- | -------------- |
| `@modelcontextprotocol/sdk` | `^1.25.3` | MCP protocol surface; must stay aligned across core and Alliance |
| `@pinecone-database/pinecone` | `^7.1.0` | Client API used by `PineconeClient`; core owns the wrapper |
| `dotenv` | `^17.2.3` | Env loading in config resolvers |
| `zod` | `^4.3.6` | Tool input schemas and response validation |

In a two-package monorepo, **core** declares these as `dependencies`; **Alliance** adds `@will-cppa/pinecone-read-only-mcp` plus the same four (or relies on core's transitive deps if Zod/MCP types are only needed through core exports — prefer explicit Alliance `dependencies` on MCP SDK if Alliance tools register handlers directly). DevDependencies (`typescript`, `vitest`, `eslint`, etc.) stay at the workspace root.

**Burden:** two `package.json` files must bump shared deps in lockstep (or use Renovate grouped updates). Misaligned Pinecone client versions between packages would be a hard failure at runtime.

#### Workspace orchestration tradeoffs

| Tool | Fit for this repo | Tradeoff |
| ---- | ----------------- | -------- |
| **npm workspaces** (built-in) | **Recommended** | Lowest ceremony; `npm install` at root links packages; publish with `npm publish -w packages/core`. No task caching; CI scripts orchestrate build order manually (`core` before `alliance`). |
| **pnpm workspaces** | Good alternative | Faster installs, strict `node_modules` layout; team would adopt pnpm for local dev and CI. |
| **Turborepo** | Optional add-on | Remote/local build cache and `turbo run test --filter=...`; worthwhile if CI time grows after split. Overkill for two small packages initially. |
| **Lerna** | Not recommended | Independent versioning + publish is heavier than needed; npm/pnpm workspaces + Changesets (or manual coordinated tags) suffice for two packages. |
| **Nx** | Not recommended | Generator/graph overhead disproportionate to ~4,500 LOC. |

A split requires:

| Work item                                                                    | Effort     |
| ---------------------------------------------------------------------------- | ---------- |
| Root `package.json` workspaces (`"workspaces": ["packages/*"]`)              | Low        |
| Per-package `package.json`, `tsconfig.json`, build scripts                   | Medium     |
| CI: lint, test, coverage, and publish per package (or orchestrated via root) | Medium     |
| `vitest` config spanning workspace packages                                  | Low–medium |
| npm publish: two packages, version coordination policy                       | Medium     |
| CI matrix: Alliance package tested against pinned + latest compatible core    | Low        |

Estimated implementation effort for the split itself: **~3–5 days** (not including legacy facade removal or consumer migration docs).

### 3.5 Public API blockers (must resolve before split)

The core public API (`src/core/index.ts`) still exports **legacy module facades** that delegate to `getDefaultServerContext()`:

- `setPineconeClient`
- `registerUrlGenerator`, `unregisterUrlGenerator`, `generateUrlForNamespace`, `hasUrlGenerator`

These are Alliance-era singleton patterns. Publishing them as the stable surface of a standalone "generic core" package would cement the wrong contract. **Legacy facade deprecation** marks and eventually removes these exports, leaving `ServerContext` + setup APIs as the supported public contract.

Until facade removal at 1.0, "core" is generic in _source layout_ but not yet generic in _published API_.

### 3.6 Extension surface (T23) and package split

A package split **alone** does not open the extension surface. Today, adding a new namespace URL pattern or MCP tool still requires forking or patching source — whether that source lives in one package or two.

What a split **does** enable:

- Non-Alliance consumers depend only on core and never pull Alliance builtins or tools
- Alliance can ship faster without bumping core version for unrelated core stability fixes
- Clearer ownership for contributions (generic vs domain-specific)

Plugin/registry APIs for third-party URL generators and tools remain a separate roadmap item beyond this evaluation.

---

## 4. Consumer impact assessment

### 4.1 Consumer matrix

| Consumer                                         | Layer used                         | Import / deploy path                           | Impact if split                                                                             |
| ------------------------------------------------ | ---------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Alliance CLI** (default npm install, Docker)   | Alliance                           | `bin: pinecone-read-only-mcp` → Alliance setup | Transparent if bin moves to Alliance package; MCP configs update package name only          |
| **MCP clients** (Cursor, Claude Desktop, etc.)   | Alliance via CLI                   | `npx @will-cppa/pinecone-read-only-mcp@…`      | Config changes to Alliance package name; behavior unchanged                                 |
| **Programmatic Alliance embedders**              | Alliance (+ core re-export)        | `@will-cppa/pinecone-read-only-mcp/alliance`   | Can keep ergonomic re-export from Alliance package; must align Alliance ↔ core semver range |
| **Core-only embedders**                          | Core only                          | `@will-cppa/pinecone-read-only-mcp`            | **No breaking change** if core keeps the existing package name and `"."` export             |
| **Alliance examples** (`examples/alliance/`)     | Alliance                           | `setupAllianceServer`, `resolveAllianceConfig` | Update imports to Alliance package; examples already document instance-first setup          |
| **Quickstart examples** (`examples/quickstart/`) | Core or Alliance depending on demo | Mixed                                          | Per-example migration                                                                       |
| **Internal C++ Alliance deployments**            | Alliance                           | Production MCP configs in README               | Track Alliance package version; core bumps only when needed                                 |
| **Hypothetical external generic consumers**      | Core only                          | Not observed yet                               | Primary beneficiaries of split — avoid Alliance defaults and builtins                       |

### 4.2 Adoption and risk window

- **Pre-1.0**, semver 0.y.z — breaking changes are expected; migration cost is acceptable if documented.
- **No known external community consumers** at time of writing — impact is mostly internal (CppAlliance tooling, eval fixtures, documented embed recipes).
- **Highest-risk change:** MCP client configs that pin `@will-cppa/pinecone-read-only-mcp` for `npx` would need to pin the Alliance package (or a meta-package shim).

### 4.3 Version cadence motivation

Today a single version covers:

- Core infrastructure changes (formatters, `ServerContext`, hybrid query paths, `guided_query` in core)
- Alliance-only changes (new Slack URL pattern, suggest-flow defaults, `suggest_query_params` behavior)

After a split, an Alliance-only fix could release as `@will-cppa/pinecone-read-only-mcp-alliance@0.2.1` without bumping core. That decoupling is the **primary business motivation** for the split — but it only matters once multiple consumers with different needs exist or release velocity diverges.

### 4.4 Consumer recommendation during transition

If split proceeds later, publish a **compatibility period**:

1. Continue publishing unified `@will-cppa/pinecone-read-only-mcp` as a meta-package that depends on pinned core + Alliance versions (optional shim, one minor cycle).
2. Document migration in `MIGRATION.md`: core users unchanged; Alliance users add explicit Alliance dependency.
3. Deprecate `./alliance` subpath export on the unified package name before removing it.

### 4.5 Quantified import breakage (this repository)

Audit of **in-repo** consumers at evaluation time (June 2026):

| Import pattern | Sites | Breaks on split? | Migration |
| -------------- | ----- | ---------------- | --------- |
| `@will-cppa/pinecone-read-only-mcp` (package root) | **6** example `.ts` files, README/MIGRATION snippets | **No** if core keeps package name | Unchanged |
| `@will-cppa/pinecone-read-only-mcp/alliance` | **4** example `.ts` files, **~8** README/MIGRATION snippets | **Yes** — subpath moves to Alliance package | `import … from '@will-cppa/pinecone-read-only-mcp-alliance'` |
| `npx @will-cppa/pinecone-read-only-mcp` (CLI / MCP configs) | **~4** README JSON blocks | **Yes** if `bin` moves to Alliance package | Pin `@will-cppa/pinecone-read-only-mcp-alliance` or use meta-package shim (§4.4) |
| Internal `src/alliance/**` → `../core/**` | **~17** production import statements across 6 modules | **Mechanical** — becomes package import | `from '@will-cppa/pinecone-read-only-mcp'` |
| Core tests importing Alliance | **4** test files | **No** production break | Move to integration package or Alliance devDependency |

**Summary:** ~**12** programmatic import lines and ~**4** MCP deploy configs need explicit migration for Alliance consumers. Core-only embedders (quickstart example) need **zero** import path changes if the core package retains `@will-cppa/pinecone-read-only-mcp`. No known external community repos depend on the package yet; migration cost is internal documentation and C++ Alliance MCP configs.

**Export trimming (week-plan Item 2) and split calculus:** removing `HybridQueryResult`, `buildQueryExperimental`, etc. from the public barrel **before** a split reduces the symbol surface Alliance re-exports via `export *`, lowering the cost of later replacing `export *` with named re-exports. Item 2 is partially complete (`buildQueryExperimental` / `buildGuidedQueryExperimental` removed per CHANGELOG); internal hybrid types (`HybridQueryResult`, `HybridLegFailed`, `KeywordIndexNamespacesResult`) remain on the core export list and should be trimmed before 1.0.

---

## 5. Proposed package structure

### 5.1 Option A: npm workspace monorepo (recommended if splitting)

Keep one git repository; add workspace packages:

```text
pinecone-read-only-mcp-typescript/
  package.json                 # workspace root (private)
  packages/
    core/                      # @will-cppa/pinecone-read-only-mcp
      package.json
      tsconfig.json
      src/
        core/                    # moved from repo src/core/
        types.ts
        logger.ts
        constants.ts             # CORE_SERVER_INSTRUCTIONS only
    alliance/                  # @will-cppa/pinecone-read-only-mcp-alliance
      package.json               # dependencies: @will-cppa/pinecone-read-only-mcp
      tsconfig.json
      src/
        alliance/                # moved from repo src/alliance/
        constants.ts             # ALLIANCE_INSTRUCTIONS_APPENDIX, ALLIANCE_SERVER_INSTRUCTIONS
        cli.ts
        index.ts                 # bin entry
```

**Pros:**

- Single repo, shared CI, atomic cross-package PRs
- Core package **retains existing name** — no breaking change for core-only importers
- Alliance package owns CLI `bin` and domain iteration
- Matches existing mental model (`"."` vs Alliance)

**Cons:**

- Workspace tooling and dual publish pipeline to implement
- Semver coordination policy required (Alliance `peerDependencies` or `dependencies` on core)

**Suggested version policy:**

- Core: conservative minors; API stable toward 1.0 after legacy facade removal
- Alliance: faster minors; `dependencies: { "@will-cppa/pinecone-read-only-mcp": "^0.x.0" }` with CI matrix testing latest compatible core

### 5.2 Option B: Separate git repositories

Two repos, two CI pipelines, coordinated releases via tags or a release bot.

**Pros:** Hard package boundary enforcement; independent access control.

**Cons:** High overhead for a small team; every cross-cutting change needs two PRs; harder to keep integration tests green.

**Recommendation:** **Not now.** Revisit if external contributors or divergent release ownership justify the cost.

### 5.3 Option C: Keep unified package (status quo)

Continue with `exports["."]` and `exports["./alliance"]` in one package.

**Pros:** Zero build migration; single version; simplest publish story.

**Cons:** Alliance-only changes always bump the shared version; eval §5.3 coupling perception remains (including `disableSuggestFlow` divergence); core public API still carries legacy facades until facade removal regardless.

---

## 6. Decision

### Recommended: **Split later** (not now)

Defer the npm package split until **after legacy facade deprecation** has shipped and **one deprecation policy window** has elapsed (see [deprecation-policy.md](./deprecation-policy.md)).

Do **not** implement workspace packages in the current sprint. This PR delivers the evaluation only.

### Rationale

1. **Source boundary is ready; published API is not.** The ServerContext instance API is in place on main, but core still exports `setPineconeClient`, global URL registry helpers, and `getDefaultServerContext`. Splitting now would publish those as the long-term "generic core" contract. Legacy facade deprecation and removal must finish first.

2. **Low external adoption incentive.** All current consumers are internal or documentation-driven. Shared version bumps are inconvenient but not blocking release velocity today.

3. **Build tooling cost during active pre-1.0 development.** Workspace setup, dual publish, and CI changes distract from ServerContext completion, security hardening, and response contract work.

4. **Subpath exports already deliver most consumer value.** Core-only embedders can `import from '@will-cppa/pinecone-read-only-mcp'` today without registering Alliance tools at setup time. `guided_query` is now a core tool. The remaining coupling is versioning, npm install footprint (Alliance code still ships in the tarball), and Alliance `export *` re-exporting the full core type surface.

### Alternatives considered

| Option                        | When it makes sense                                     | Why not now                                                        |
| ----------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| **Split now**                 | External core-only adopters blocked by Alliance cadence | Legacy facades still in core exports; tooling not ready            |
| **Split with instance API only**   | Urgent multi-team release decoupling                    | Legacy facade removal still required for clean API; no urgent consumer pressure  |
| **Keep unified indefinitely** | Single consumer, stable 1.0 shipped                     | Loses future cadence decoupling; re-evaluate at 1.0 planning       |
| **Split at 1.0**              | Clean semver major for both packages                    | **Preferred target window** — combine with facade removal release |

### 6.1 Interim measures while unified

Because the recommendation is **split later**, reduce cross-layer leakage **before** the npm boundary moves:

| Measure | Owner | Status / action |
| ------- | ----- | --------------- |
| **Trim internal types from core barrel** | `src/core/index.ts` | Remove `HybridQueryResult`, `HybridLegFailed`, `KeywordIndexNamespacesResult` from public re-exports (week-plan Item 2). `buildQueryExperimental` / `buildGuidedQueryExperimental` already removed. |
| **Replace Alliance `export *`** | `src/alliance/index.ts` | Today: `export * from '../core/index.js'` pulls the entire core symbol table into Alliance's type space. Target: explicit named re-exports of supported core symbols plus Alliance-only exports (`setupAllianceServer`, `resolveAllianceConfig`, `ALLIANCE_DEFAULT_*`, URL builtins). Reduces Hyrum's Law surface for Alliance importers. |
| **Keep Alliance constants off core export** | `src/core/index.ts` | `ALLIANCE_DEFAULT_INDEX_NAME` and `DEFAULT_ALLIANCE_RERANK_MODEL` must remain Alliance-only (already true). |
| **Document default divergence** | `CONFIGURATION.md`, `MIGRATION.md` | `disableSuggestFlow` table and entry-point warning (done). |
| **Expose `guided_query` in core only** | `setupCoreServer` | Done — core embedders get ceremony-free search without Alliance import. |
| **Deprecate legacy module facades** | core exports | Release 1 in progress (`@deprecated` JSDoc merged; removal targeted at 1.0). |
| **Cross-entry-point integration test** | `src/__tests__/cross-entry-point.test.ts` | Locks `disableSuggestFlow` defaults and gate behavior (week-plan Item 4). |

These measures deliver most of the **consumer benefit** of a split (smaller conceptual surface, clearer defaults) without workspace tooling cost. Re-evaluate package split when the prerequisite checklist (§7) is complete.

---

## 7. Prerequisites and trigger checklist

Proceed with Option A (workspace monorepo) when **all** of the following are true:

- [x] Release 1: legacy facades marked `@deprecated` in source (merged; `@since` tags at publish time)
- [ ] Release 3 (or agreed 1.0): module-level singleton accessors removed from public exports
- [ ] `src/types.ts` contains only core-shared types; Alliance-specific types live under `src/alliance/`
- [ ] `src/logger.ts` owned by core; Alliance uses core export
- [ ] `constants.ts` split between packages (no Alliance instructions in core tarball)
- [ ] CI pipeline supports workspace install, per-package test, and coordinated publish
- [ ] `MIGRATION.md` documents package names, shim period, and MCP config updates
- [ ] At least one **external** or **multi-team** consumer needs independent Alliance release cadence

**Suggested trigger:** planning for **1.0.0** major release, combining facade removal with package split if checklist is complete.

---

## 8. References

- [MIGRATION.md](./MIGRATION.md) — core vs Alliance embed recipes, `ServerContext` phases, `disableSuggestFlow` divergence
- [TOOLS.md](./TOOLS.md) — 8 core tools vs 9 Alliance tools
- [CONFIGURATION.md](./CONFIGURATION.md) — `resolveConfig` vs `resolveAllianceConfig`
- [deprecation-policy.md](./deprecation-policy.md) — deprecation windows before API removal
- Eval finding **T9** (Defaults Quality) — `disableSuggestFlow` intentional divergence
- Eval finding **T22** (Abstraction Coherence) — core/Alliance layer tension motivating this evaluation
- Eval finding **T23** — closed extension surface (source modification required for new tools/URL patterns)
- Eval **§5.3** (Core/Alliance Coherence Split) — behavioral and export-surface coupling costs
- Related source: `src/core/index.ts`, `src/alliance/index.ts`, `src/alliance/setup.ts`, `src/alliance/url-builtins.ts`, `src/core/server/tools/guided-query-tool.ts`, `src/constants.ts`, `src/__tests__/cross-entry-point.test.ts`
