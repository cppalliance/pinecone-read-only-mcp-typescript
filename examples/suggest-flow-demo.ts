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
 * `PINECONE_API_KEY` and wire an MCP transport to execute real tool calls.
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
      '[suggest-flow-demo] Set PINECONE_API_KEY to run against Pinecone. ' +
        'Flow: list_namespaces → suggest_query_params → query (same trimmed namespace).'
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
