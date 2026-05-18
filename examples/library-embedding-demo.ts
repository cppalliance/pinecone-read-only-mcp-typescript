/**
 * Library embedding: build the MCP server from a Node script (not the CLI).
 *
 * Pattern (mirrors `src/index.ts`):
 *   1. `resolveConfig({ apiKey, ... })` — never rely on ambient env alone in libraries.
 *   2. `new PineconeClient({ ... })` + `setPineconeClient(client)`.
 *   3. `await setupServer(config)` then `server.connect(transport)`.
 *
 * **Single process:** `setupServer` registers tools against process-global
 * singletons (suggest-flow state, namespaces cache, URL registry, active config).
 * Do **not** call `setupServer` twice in one process for isolated tenants unless
 * you accept shared state — prefer **one server per Node process** or external
 * process isolation. (A future release may add an explicit teardown API; see
 * CHANGELOG when available.)
 */

import {
  PineconeClient,
  resolveConfig,
  setPineconeClient,
  setupServer,
} from '@will-cppa/pinecone-read-only-mcp';

async function main(): Promise<void> {
  const apiKey = process.env['PINECONE_API_KEY']?.trim();
  if (!apiKey) {
    console.log(
      'Set PINECONE_API_KEY to run this example. Skipping live setup in doc-only mode.'
    );
    return;
  }
  const config = resolveConfig({ apiKey });

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

  const server = await setupServer(config);
  // const transport = new StdioServerTransport();
  // await server.connect(transport);
  void server;
  console.log('Embedded server constructed — connect your MCP transport (stdio, HTTP, etc.).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
