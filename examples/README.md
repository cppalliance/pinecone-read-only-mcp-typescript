# Examples

| File | Description |
|------|-------------|
| [custom-url-generator.ts](./custom-url-generator.ts) | Embed the MCP server as a library, register a **custom URL generator** for a namespace, and wire `PineconeClient` + `setupServer()`. |
| [suggest-flow-demo.ts](./suggest-flow-demo.ts) | Document the **suggest_query_params → query** gate sequence and trimmed namespace usage. |
| [guided-query-demo.ts](./guided-query-demo.ts) | Document **guided_query** and the **`decision_trace`** payload. |
| [library-embedding-demo.ts](./library-embedding-demo.ts) | Minimal **library embedding** (`resolveConfig`, `setPineconeClient`, `setupServer`). |

Run with `npx tsx examples/<file>.ts` after `npm install` (live Pinecone calls need `PINECONE_API_KEY` and related env).
