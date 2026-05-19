# CI/CD

## Workflow overview

| Workflow | File | Trigger |
| -------- | ---- | ------- |
| **CI** | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | PR/push to `main`, `workflow_call` |
| **CodeQL** | [`.github/workflows/codeql.yml`](../.github/workflows/codeql.yml) | PR/push to `main`, weekly schedule |
| **Publish** | [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) | GitHub Release `published` |

---

## CI matrix (`ci.yml`)

**Job `build-and-test`**

- **OS:** `ubuntu-latest`, `windows-latest`, `macos-latest`
- **Node:** `20.x`, `22.x` (see workflow comments — Node 18 is unsupported)
- **Steps:** checkout → `npm ci` → `npm run typecheck` → `npm run lint` → `npm run format:check` → `npm run build` → smoke CLI `--help` → `npm run test:coverage` → CycloneDX SBOM (`@cyclonedx/cyclonedx-npm`) → upload SBOM artifact
- **Codecov:** Ubuntu + Node 20 only (`codecov-action`, non-blocking on upload failure flag)

**Job `quality`**

- Ubuntu + Node 20: `npm audit --audit-level=moderate` (continue-on-error) → `npm pack --dry-run` → **`npm run docs:link-check`** (single `npx markdown-link-check` over `README.md`, `CHANGELOG.md`, and all `docs/**/*.md`).

---

## CodeQL (`codeql.yml`)

Static analysis for **JavaScript** (`matrix.language: javascript`). Runs GitHub’s CodeQL init/autobuild/analyze on each PR/push to `main` and on a weekly cron.

---

## SBOM

Each matrix cell uploads `sbom.cdx.json` (CycloneDX) as a workflow artifact for supply-chain review.

---

## Releases & npm

Publishing is **not** done on every tag push alone: the **Publish** workflow runs when a GitHub **Release** is published. It reuses CI via `workflow_call`, then `npm publish --provenance --access public` with `NPM_TOKEN`.

Details: [RELEASING.md](./RELEASING.md).
