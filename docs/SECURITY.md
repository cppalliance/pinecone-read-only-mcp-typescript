# Security

## API keys

- **Never** commit real Pinecone API keys. Use environment variables (`PINECONE_API_KEY`, or per-source keys referenced from `PINECONE_SOURCES` / a JSON config file) or secret managers in CI.
- The CLI and `resolveConfig` read keys only from argv/env/overrides — logs must not echo raw keys. In multi-source mode, each source may use a different API key; all are redacted in logs and MCP responses.
- Use **separate deployment profiles** for external (public-only) vs internal (merged) MCP configs — see [CONFIGURATION.md § Deployment profiles](./CONFIGURATION.md#deployment-profiles).

## Log redaction

`src/logger.ts` implements `redactApiKey` and recursive redaction for structured log data:

- UUID-shaped tokens (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) → `***`
- Modern Pinecone keys (`pcsk_…`) → `***`
- Substrings after `apiKey` / `api_key` / similar patterns → masked
- `Authorization: Bearer …` tokens → masked

Logs go to **stderr**; use `PINECONE_READ_ONLY_MCP_LOG_FORMAT=json` for pipelines and ensure downstream sinks treat stderr as sensitive.

## MCP response redaction

Tool responses are sanitized at construction and at the serialization boundary:

- `src/core/server/tool-error.ts`: `pineconeToolError` and `timeoutToolError` apply `redactApiKey` to `message` and `suggestion` before the `ToolError` object is built, so DEBUG-mode SDK error text is masked at the tool-error layer.
- `src/logger.ts`: `redactErrorMessage` redacts credential-shaped substrings from error values; `redactSensitiveFields()` masks known sensitive keys (`message`, `suggestion`, `degradation_reason`) and every string value nested directly under `source_errors` (keyed by source name, not a sensitive field name).
- `src/core/server/source-registry.ts`: multi-source `source_errors` rejection messages are redacted via `redactErrorMessage` when the per-source error map is built.
- `src/core/server/tool-response.ts`: `jsonResponse` / `jsonErrorResponse` call `redactSensitiveFields()` before JSON serialization (boundary layer).

Document metadata UUIDs and other non-sensitive fields are preserved throughout MCP response construction, aggregation, and serialization.

## Private config content (descriptions and schemas)

Per-source `description` and per-namespace `namespaces` (including namespace names and `metadata_schema` field names) loaded from `PINECONE_CONFIG_FILE` or the `_mcp_config` schema manifest are **High**-risk if committed to the open-source repo or shared through public distribution channels — they can disclose what private corpora contain and which internal metadata fields exist. Manifests in `_mcp_config` inherit the same access boundary as the rest of that Pinecone index; do not publish sensitive descriptions on indexes shared more broadly than the private data warrants. Keep real values on staff machines only; use generic placeholders in examples and tests. Same deployment-profile separation as API keys — see [CONFIGURATION.md § Deployment profiles](./CONFIGURATION.md#deployment-profiles).

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
