/**
 * Library embedding: build the MCP server from a Node script (not the CLI).
 *
 * Instance-first pattern (mirrors `src/index.ts`):
 *   1. `resolveAllianceConfig({ apiKey, indexName, ... })` — Alliance index/rerank defaults when unset.
 *   2. `createServer(config)` → `ctx.setClient(new PineconeClient({ ... }))`.
 *   3. `await setupAllianceServer({ context: ctx })` then `server.connect(transport)`.
 *
 * Pass `config` at setup only when the context is not yet configured; after
 * `createServer` + `setClient`, pass `{ context: ctx }` only.
 *
 * **Multi-instance:** pass a distinct `ServerContext` per tenant/session. Each context
 * owns its own suggest-flow state, namespaces cache, and URL registry. Use
 * `await using server = await setupAllianceServer({ context: ctx })` for
 * automatic teardown, or call `ctx.teardown()` when done.
 *
 * **Legacy (deprecated):** `setPineconeClient(client)` then
 * `await setupAllianceServer(config)` still works during the deprecation window;
 * see [docs/MIGRATION.md#030-legacy-module-facade-deprecations](docs/MIGRATION.md#030-legacy-module-facade-deprecations).
 */

import { createServer, PineconeClient } from '@will-cppa/pinecone-read-only-mcp';
import { resolveAllianceConfig, setupAllianceServer } from '@will-cppa/pinecone-read-only-mcp/alliance';
import { exitOnDemoFailure } from '../lib/exit-on-failure.js';

async function main(): Promise<void> {
  const apiKey = process.env['PINECONE_API_KEY']?.trim();
  if (!apiKey) {
    console.log(
      'Set PINECONE_API_KEY to run this example. Skipping live setup in doc-only mode.'
    );
    return;
  }
  const config = resolveAllianceConfig({ apiKey });

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
  // const transport = new StdioServerTransport();
  // await server.connect(transport);
  void server;
  console.log('Embedded server constructed — connect your MCP transport (stdio, HTTP, etc.).');
}

main().catch(exitOnDemoFailure('library-embedding-demo'));
