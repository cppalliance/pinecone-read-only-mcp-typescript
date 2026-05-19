# Contributing

## Prerequisites

- **Node.js ≥ 20.12** (see `engines` in `package.json` — Vitest 4 / coverage require it).
- npm (lockfile is `package-lock.json`).

## Setup

```bash
git clone https://github.com/cppalliance/pinecone-read-only-mcp-typescript.git
cd pinecone-read-only-mcp-typescript
npm ci
```

## Commands

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

## Coding conventions

- **TypeScript strict** options enabled (`strict`, `noUncheckedIndexedAccess`, etc.).
- Prefer explicit types on exported APIs; use Zod at MCP tool boundaries.
- **No `process.env` reads** in feature code outside `resolveConfig` / CLI — thread `ServerConfig`.
- Tool errors: return `jsonErrorResponse` with `ToolError` shapes from `tool-error.ts`.
- Tests live beside sources as `*.test.ts`; use Vitest.

## Pull requests

- Run `npm run ci` before pushing.
- Keep changes focused; update `CHANGELOG.md` `[Unreleased]` for user-visible behavior.
- Documentation changes should keep [README](../README.md) links; run `npm run docs:link-check` locally if you touch many relative links.

## Documentation

Authoritative reference lives under [`docs/`](./README.md). When adding tools or config knobs, update `docs/TOOLS.md` and `docs/CONFIGURATION.md` in the same PR when possible.
