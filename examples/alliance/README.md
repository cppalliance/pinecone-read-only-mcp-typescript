# Alliance / advanced examples

These examples target the **full** MCP surface via `setupAllianceServer` from `@will-cppa/pinecone-read-only-mcp/alliance`:

- `suggest_query_params` and the suggest-flow gate
- `guided_query` with `decision_trace`
- Built-in URL generators for `mailing` and `slack-Cpplang`

They assume a Pinecone index you control with compatible data (not necessarily the C++ Alliance production index). To bootstrap a **neutral** index from scratch, start with [examples/quickstart/README.md](../quickstart/README.md).

## Required environment

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `PINECONE_API_KEY` | Yes | For live runs |
| `PINECONE_INDEX_NAME` | Yes | Your dense index name |

Optional: `PINECONE_RERANK_MODEL`, `PINECONE_SPARSE_INDEX_NAME`, etc. See [docs/CONFIGURATION.md](../../docs/CONFIGURATION.md). CLI-only configs that set only `PINECONE_API_KEY` still use documented defaults (`rag-hybrid`, `bge-reranker-v2-m3`).

## Files

| File | Description |
| ---- | ----------- |
| [suggest-flow-demo.ts](./suggest-flow-demo.ts) | Manual **suggest_query_params → query** flow |
| [guided-query-demo.ts](./guided-query-demo.ts) | **guided_query** and `decision_trace` |
| [library-embedding-demo.ts](./library-embedding-demo.ts) | Programmatic **setupAllianceServer** wiring |
| [custom-url-generator.ts](./custom-url-generator.ts) | Custom **URL generator** registration |
| [demo-mock-pinecone-client.ts](./demo-mock-pinecone-client.ts) | Mock client with `mailing` namespace (no network) |

Run from the repo root after `npm run build`:

```bash
npx tsx examples/alliance/suggest-flow-demo.ts
```

Shared in-process MCP transport helper: [../mcp-linked-transport.ts](../mcp-linked-transport.ts).
