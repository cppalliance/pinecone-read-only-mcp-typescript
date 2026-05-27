# Examples

## Generic quickstart (start here)

Run the MCP server against **your own** Pinecone indexes — no Alliance instance required.

| Path | Description |
| ---- | ----------- |
| [quickstart/README.md](./quickstart/README.md) | Setup guide: create indexes, seed data, run MCP demo |
| [quickstart/seed-data.ts](./quickstart/seed-data.ts) | Upsert sample records into dense + sparse indexes |
| [quickstart/mcp-demo.ts](./quickstart/mcp-demo.ts) | `list_namespaces`, `count`, `query` via `setupCoreServer` |

```bash
cp examples/quickstart/.env.example examples/quickstart/.env
# edit .env, then:
npx tsx examples/quickstart/seed-data.ts
npx tsx examples/quickstart/mcp-demo.ts
```

## Alliance / advanced

| Path | Description |
| ---- | ----------- |
| [alliance/README.md](./alliance/README.md) | Full tool surface (`suggest_query_params`, `guided_query`, URL builtins) |
| [alliance/suggest-flow-demo.ts](./alliance/suggest-flow-demo.ts) | Suggest-then-query gate sequence |
| [alliance/guided-query-demo.ts](./alliance/guided-query-demo.ts) | `guided_query` orchestration |
| [alliance/library-embedding-demo.ts](./alliance/library-embedding-demo.ts) | Library embedding with `setupAllianceServer` |
| [alliance/custom-url-generator.ts](./alliance/custom-url-generator.ts) | Custom URL generator registration |

## Shared utilities

| File | Description |
| ---- | ----------- |
| [mcp-linked-transport.ts](./mcp-linked-transport.ts) | In-memory MCP transport pair for examples |

**Build first:** `npm run build`, then `npx tsx examples/...` from the repo root. Examples resolve the package via `dist/core` and `dist/alliance` (see [tsconfig.json](./tsconfig.json) path aliases).
