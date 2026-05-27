# Examples

| File                                                     | Description                                                                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [custom-url-generator.ts](./custom-url-generator.ts)     | Embed the MCP server, register a **custom URL generator**, and call `setupAllianceServer()` (full tool surface). |
| [suggest-flow-demo.ts](./suggest-flow-demo.ts)           | Document the **suggest_query_params → query** gate sequence and trimmed namespace usage.                         |
| [guided-query-demo.ts](./guided-query-demo.ts)           | Document **guided_query** and the **`decision_trace`** payload.                                                  |
| [library-embedding-demo.ts](./library-embedding-demo.ts) | Minimal **library embedding** (`resolveConfig`, `setPineconeClient`, `setupAllianceServer`).             |

**Required env for live runs:** `PINECONE_API_KEY`. Optional: `PINECONE_INDEX_NAME` (default `rag-hybrid`), `PINECONE_RERANK_MODEL` (default `bge-reranker-v2-m3`).

Run with `npm run build` then `npx tsx examples/<file>.ts` from the repo root (examples resolve the package via `dist/core` and `dist/alliance`).
