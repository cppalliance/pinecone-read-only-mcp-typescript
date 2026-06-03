/**
 * Library embedding: build the MCP server from a Node script (not the CLI).
 *
 * Pattern (mirrors `src/index.ts`):
 *   1. `resolveAllianceConfig({ apiKey, indexName, ... })` — Alliance index/rerank defaults when unset.
 *   2. `new PineconeClient({ ... })` + `setPineconeClient(client)` (legacy), or `createServer(config)` + `ctx.setClient(...)`.
 *   3. `await setupAllianceServer(config)` then `server.connect(transport)`.
 *
 * **Single process:** `setupAllianceServer` registers tools against process-global
 * singletons (suggest-flow state, namespaces cache, URL registry, active config).
 * A second setup call throws — call `teardownServer()` first to re-initialize
 * (tests). For isolated tenants in production, prefer one server per Node process.
 */

import { PineconeClient, setPineconeClient } from '@will-cppa/pinecone-read-only-mcp';
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

  setPineconeClient(
    new PineconeClient({
      apiKey: config.apiKey,
      indexName: config.indexName,
      sparseIndexName: config.sparseIndexName,
      rerankModel: config.rerankModel,
      defaultTopK: config.defaultTopK,
      requestTimeoutMs: config.requestTimeoutMs,
    })
  );

  const server = await setupAllianceServer(config);
  // const transport = new StdioServerTransport();
  // await server.connect(transport);
  void server;
  console.log('Embedded server constructed — connect your MCP transport (stdio, HTTP, etc.).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
