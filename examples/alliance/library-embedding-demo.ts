/**
 * Library embedding: build the MCP server from a Node script (not the CLI).
 *
 * Instance-first pattern (mirrors `src/index.ts`):
 *   1. `resolveAllianceConfig({ apiKey, indexName, ... })` — Alliance index/rerank defaults when unset.
 *   2. `createServer(config)` → `ctx.setClient(new PineconeClient({ ... }))`.
 *   3. `await setupAllianceServer({ config, context: ctx })` then `server.connect(transport)`.
 *
 * **Multi-instance:** pass a distinct `ServerContext` per tenant/session. Each context
 * owns its own suggest-flow state, namespaces cache, and URL registry. Use
 * `await using server = await setupAllianceServer({ config, context: ctx })` for
 * automatic teardown, or call `ctx.teardown()` when done.
 *
 * **Legacy (single process-default server):** `setPineconeClient(client)` then
 * `await setupAllianceServer(config)` still works; call `teardownServer()` before
 * re-initializing the default context.
 */

import { createServer, PineconeClient } from '@will-cppa/pinecone-read-only-mcp';
import { resolveAllianceConfig, setupAllianceServer } from '@will-cppa/pinecone-read-only-mcp/alliance';

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

  const server = await setupAllianceServer({ config, context: ctx });
  // const transport = new StdioServerTransport();
  // await server.connect(transport);
  void server;
  console.log('Embedded server constructed — connect your MCP transport (stdio, HTTP, etc.).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
