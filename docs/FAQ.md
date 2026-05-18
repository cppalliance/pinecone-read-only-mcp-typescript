# FAQ

## Why does `query` return `FLOW_GATE`?

Call **`suggest_query_params`** for that namespace first (within the cache TTL). Or use **`guided_query`**, which performs suggestion internally.

## Does `keyword_search` need `suggest_query_params`?

**No.** Only `query`, `count`, and `query_documents` are gated.

## What happened to `query_fast` / `query_detailed`?

They are unified into **`query`** with `preset`: `fast`, `detailed`, or `full`. See [MIGRATION.md](./MIGRATION.md).

## How do I disable the suggest gate for testing?

Set **`PINECONE_DISABLE_SUGGEST_FLOW=true`** or pass **`--disable-suggest-flow`**. Prefer fixing the client flow in production.

## Where are benchmarks?

There is a `npm run benchmark` script (`benchmarks/latency.ts`); published README claims remain qualitative until benchmark results are checked in.

## Which field is the document id?

Use **`document_id`** on rows. **`paper_number`** is a deprecated alias scheduled for removal in the next major release.

## Node version errors with Vitest

Use **Node ≥ 20.12** — Vitest 4’s bundler and `@vitest/coverage-v8` require newer `node:util` / inspector APIs.
