/**
 * Worked example: `guided_query` single-call orchestration.
 *
 * Unlike the manual flow, `guided_query` bundles:
 *   - optional implicit `namespace_router` ranking
 *   - internal `suggest_query_params` + `markSuggested`
 *   - execution of `count` or hybrid `query` with `fast` / `detailed` / `full`
 *
 * The success payload includes **`decision_trace`**: cache hit, routed vs
 * selected namespace, suggested fields/tools, and the final `selected_tool`.
 * Use the trace in UIs or logs to explain why a path was chosen.
 *
 * **Reranking fidelity:** when reranking was expected, inspect each row's
 * `reranked` boolean; `false` can indicate rerank was skipped or failed while
 * still returning HTTP/MCP success (see docs/TOOLS.md).
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
      '[guided-query-demo] Set PINECONE_API_KEY to run live. ' +
        'Call guided_query with user_query; read decision_trace + result in the JSON response.'
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
  void server;
  console.log('Server ready — call guided_query({ user_query, preferred_tool?: "auto" }).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
