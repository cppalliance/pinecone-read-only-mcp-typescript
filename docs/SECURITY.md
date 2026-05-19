# Security

## API keys

- **Never** commit real Pinecone API keys. Use environment variables (`PINECONE_API_KEY`) or secret managers in CI.
- The CLI and `resolveConfig` read keys only from argv/env/overrides — logs must not echo raw keys.

## Log redaction

`src/logger.ts` implements `redactApiKey` and recursive redaction for structured log data:

- UUID-shaped tokens (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) → `***`
- Substrings after `apiKey` / `api_key` / similar patterns → masked
- `Authorization: Bearer …` tokens → masked

Logs go to **stderr**; use `PINECONE_READ_ONLY_MCP_LOG_FORMAT=json` for pipelines and ensure downstream sinks treat stderr as sensitive.

## Docker image

The multi-stage [`Dockerfile`](../Dockerfile):

1. **Build stage** (`node:20-bookworm-slim`): `npm ci`, `npm run build`.
2. **Runtime stage**: `npm ci --omit=dev`, copies `dist/` only.
3. Creates a non-root user **`mcpuser`** (uid `10001`) and runs `node dist/index.js` as that user (`USER mcpuser`).

Do not run the production image as root unless you have a compensating security model.

## Supply chain

- CI runs `npm audit --audit-level=moderate` (see [CI_CD.md](./CI_CD.md)).
- SBOM: CycloneDX JSON is generated per CI matrix job.

## Reporting vulnerabilities

Open a **private** security advisory or issue per repository policy on [GitHub](https://github.com/cppalliance/pinecone-read-only-mcp-typescript/security). Do not post exploit details in public issues before a fix is available.

Include: affected version, reproduction steps, and impact assessment.
