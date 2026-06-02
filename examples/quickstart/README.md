# Quickstart — generic Pinecone (no Alliance instance)

This guide walks through running the **core** MCP tools against **your own** Pinecone project and indexes. You do not need access to the C++ Alliance `rag-hybrid` index or Alliance-specific namespaces.

## Prerequisites

- [Pinecone](https://www.pinecone.io/) account (free tier is fine)
- **Node.js 20.12+**
- This repository built locally:

```bash
npm install
npm run build
```

## 1. Create two integrated-embedding indexes

The server performs **hybrid** search on a **dense** index and a **sparse** index named `{dense}-sparse` by default (see [`PineconeClient.getSparseIndexName()`](../../src/core/pinecone-client.ts)).

In the [Pinecone console](https://app.pinecone.io/), create **two** indexes configured for **integrated embedding** (hosted model, text field mapped to `chunk_text`). Example names (use your own):

| Index | Role | Example name |
| ----- | ---- | -------------- |
| Dense | Hybrid dense leg + `list_namespaces` metadata sampling | `my-mcp-demo` |
| Sparse | Hybrid sparse leg + `keyword_search` | `my-mcp-demo-sparse` |

Use the **same embedding model** (or compatible setup) on both indexes so hybrid merge behaves predictably. Pinecone’s [create index for model](https://docs.pinecone.io/guides/index-data/create-an-index#integrated-embedding) flow applies; the SDK example uses `fieldMap: { text: 'chunk_text' }`.

> **Note:** Index creation is manual in this quickstart so the seed script stays portable. If your console labels differ, align record fields with `chunk_text`, `document_number`, and `title` as in `seed-data.ts`.

## 2. Configure environment

```bash
cp examples/quickstart/.env.example examples/quickstart/.env
```

Edit `.env`:

- `PINECONE_API_KEY` — your API key
- `PINECONE_INDEX_NAME` — dense index name (e.g. `my-mcp-demo`)

Optional: `PINECONE_SPARSE_INDEX_NAME` if the sparse index is not `{dense}-sparse`.

## 3. Seed sample data

Inserts 15 neutral programming snippets into namespace `quickstart` on **both** indexes:

```bash
npx tsx examples/quickstart/seed-data.ts
```

Dry run (no API calls):

```bash
npx tsx examples/quickstart/seed-data.ts --dry-run
```

Wait a few seconds for Pinecone to finish indexing.

## 4. Run the MCP demo

In-process demo using `setupCoreServer` and core tools `list_namespaces`, `count`, and `query`:

```bash
npx tsx examples/quickstart/mcp-demo.ts
```

## 5. Optional: CLI (stdio MCP)

After seeding, you can run the published **Alliance** CLI with the same index (suggest-flow gate on by default; use `suggest_query_params` or `guided_query`):

```bash
export PINECONE_API_KEY=...
export PINECONE_INDEX_NAME=my-mcp-demo
npx @will-cppa/pinecone-read-only-mcp
```

For the **full** Alliance tool surface (`suggest_query_params`, `guided_query`, built-in URL generators), see [examples/alliance/README.md](../alliance/README.md).

## Troubleshooting

| Symptom | Check |
| ------- | ----- |
| `FLOW_GATE` on `query` / `count` | Core: gate is off by default via `resolveConfig`. If you set `PINECONE_DISABLE_SUGGEST_FLOW=false`, call `suggest_query_params` first or use Alliance server + `guided_query` |
| Empty `list_namespaces` | Run `seed-data.ts`; confirm namespace `quickstart` and index names in `.env` |
| Upsert / search errors | Indexes must support integrated embedding and `chunk_text` as the text field |
| Hybrid partial results | Both dense and sparse indexes must contain the same record IDs in the same namespace |

## Alliance-specific examples

Advanced demos (suggest-flow, guided query, custom URL generators) live under [examples/alliance/](../alliance/).
