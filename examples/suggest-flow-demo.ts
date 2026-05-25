/**
 * Worked example: suggest-then-query (manual multi-step flow).
 *
 * Stage 1 — discovery: call `list_namespaces` (not shown) so the model knows
 * valid namespaces and metadata fields.
 *
 * Stage 2 — gate: call `suggest_query_params` with a **trimmed** namespace and
 * the user query. This records in-process state (`markSuggested`) so the gate
 * opens for that namespace until the cache TTL expires.
 *
 * Stage 3 — retrieval: call `query` with the **same** namespace string, passing
 * `preset` aligned with `recommended_tool` (`fast` | `detailed` | `full`) and
 * optional `fields` from `suggested_fields`.
 *
 * This file is runnable without Pinecone only in **documentation mode**; set
 * `PINECONE_API_KEY` and `PINECONE_INDEX_NAME`, then wire an MCP transport.
 */

import { PineconeClient, setPineconeClient } from '@will-cppa/pinecone-read-only-mcp';
import {
  resolveAllianceConfig,
  setupAllianceServer,
} from '@will-cppa/pinecone-read-only-mcp/alliance';

async function main(): Promise<void> {
  const apiKey = process.env['PINECONE_API_KEY']?.trim();
  const indexName = process.env['PINECONE_INDEX_NAME']?.trim();
  if (!apiKey || !indexName) {
    console.log(
      '[suggest-flow-demo] Set PINECONE_API_KEY and PINECONE_INDEX_NAME to run against Pinecone. ' +
        'Flow: list_namespaces → suggest_query_params → query (same trimmed namespace).'
    );
    return;
  }

  const config = resolveAllianceConfig({ apiKey, indexName });
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
  // With an MCP client connected to `server`, invoke tools in order:
  // 1) suggest_query_params({ namespace: "mailing".trim(), user_query: "..." })
  // 2) query({ query_text, namespace: "mailing", preset: "detailed", ... })
  void server;
  console.log('Server ready — connect a transport and issue suggest_query_params then query.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
