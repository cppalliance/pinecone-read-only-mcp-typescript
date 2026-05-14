# Pinecone Read-Only MCP (TypeScript)

[![npm version](https://img.shields.io/npm/v/@will-cppa/pinecone-read-only-mcp.svg)](https://www.npmjs.com/package/@will-cppa/pinecone-read-only-mcp)
[![Node.js Version](https://img.shields.io/node/v/@will-cppa/pinecone-read-only-mcp.svg)](https://nodejs.org)
[![License: BSL-1.0](https://img.shields.io/badge/License-BSL--1.0-blue.svg)](https://opensource.org/licenses/BSL-1.0)
[![CI](https://github.com/CppDigest/pinecone-read-only-mcp-typescript/workflows/CI/badge.svg)](https://github.com/CppDigest/pinecone-read-only-mcp-typescript/actions)

A Model Context Protocol (MCP) server that provides semantic search over Pinecone vector databases using hybrid search (dense + sparse) with reranking.

## Documentation

| Doc | Description |
|-----|---------------|
| [docs/README.md](docs/README.md) | Index of all guides |
| [docs/TOOLS.md](docs/TOOLS.md) | Tool catalog & flows |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Env vars, CLI flags, library config |
| [docs/FAQ.md](docs/FAQ.md) | Common questions |
| [docs/MIGRATION.md](docs/MIGRATION.md) | Deprecations & breaking changes |
| [docs/CI_CD.md](docs/CI_CD.md) | GitHub Actions, SBOM, Docker, releases |
| [RELEASING.md](RELEASING.md) | Pointer to the full release guide in `docs/` |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting |

## Features

- **Hybrid Search**: Combines dense and sparse embeddings for superior recall
- **Semantic Reranking**: Uses BGE reranker model for improved precision
- **Dynamic Namespace Discovery**: Automatically discovers available namespaces in your Pinecone index
- **Metadata Filtering**: Supports optional metadata filters for refined searches
- **Fast presets**: Lazy initialization, connection pooling, and efficient result merging; use the `query` tool `preset=fast | detailed | full` to trade latency vs quality (no published benchmarks yet — treat descriptions as qualitative).
- **Production-oriented defaults**: Input validation, error handling, and configurable logging (semantic versioning is pre-1.0 — review CHANGELOG before upgrading).
- **TypeScript Support**: Full TypeScript support with type definitions

## Installation

**Node.js [20.12](https://nodejs.org/en/download) or later** is required (`engines` in `package.json`).

### As a Package

```bash
npm install @will-cppa/pinecone-read-only-mcp
```

Or using yarn:

```bash
yarn add @will-cppa/pinecone-read-only-mcp
```

Or using pnpm:

```bash
pnpm add @will-cppa/pinecone-read-only-mcp
```

### Global Installation

```bash
npm install -g @will-cppa/pinecone-read-only-mcp
```

### From Source

```bash
git clone https://github.com/CppDigest/pinecone-read-only-mcp-typescript.git
cd pinecone-read-only-mcp-typescript
npm install
npm run build
```

## Configuration

You need a **Pinecone API key** and (by default) a **dense** index plus matching **sparse** index; see [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for every environment variable and CLI flag.

Quick reference:

| Variable | Required | Default |
| -------- | -------- | ------- |
| `PINECONE_API_KEY` | Yes (for live Pinecone) | — |
| `PINECONE_INDEX_NAME` | No | `rag-hybrid` |
| `PINECONE_SPARSE_INDEX_NAME` | No | `{index}-sparse` |
| `PINECONE_READ_ONLY_MCP_LOG_LEVEL` | No | `INFO` (`DEBUG`–`ERROR`) |
| `PINECONE_READ_ONLY_MCP_LOG_FORMAT` | No | `text` (`json` for log pipelines) |

Run `pinecone-read-only-mcp --help` for CLI equivalents (`--cache-ttl-seconds`, `--request-timeout-ms`, `--disable-suggest-flow`, etc.).

### Deployment model

The server uses **process-global** memory for the suggest-flow gate (`suggest_query_params` context), namespaces cache, URL generator registry, and active configuration. **Stdio MCP (one client per Node process)** matches this model. If you embed `setupServer` behind a multi-tenant HTTP transport, isolate those structures per session yourself or treat the suggest-flow guard as best-effort only.

### Custom URL generators

Namespaces other than `mailing` and `slack-Cpplang` (or different URL rules for any namespace) can use programmatic registration — no fork required.

Import `registerUrlGenerator` and types `UrlGeneratorFn` / `UrlGenerationResult` from `@will-cppa/pinecone-read-only-mcp`. Register **additional** namespaces before tools that emit URLs run (typically right after `setupServer` resolves config). To **replace** the built-in `mailing` or `slack-Cpplang` generators, call `registerUrlGenerator` **after** `setupServer`, because `setupServer` installs the defaults first.

```ts
import {
  registerUrlGenerator,
  setupServer,
  type UrlGenerationResult,
  type UrlGeneratorFn,
} from '@will-cppa/pinecone-read-only-mcp';

const server = await setupServer(config);

const myDocs: UrlGeneratorFn = (metadata): UrlGenerationResult => {
  const id = typeof metadata.doc_id === 'string' ? metadata.doc_id : null;
  return id
    ? { url: `https://docs.example.com/${id}`, method: 'generated.custom' }
    : { url: null, method: 'unavailable', reason: 'doc_id missing' };
};

registerUrlGenerator('product-docs', myDocs);
```

A fuller embedding sample lives in [examples/custom-url-generator.ts](examples/custom-url-generator.ts).

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pinecone-search": {
      "command": "npx",
      "args": ["-y", "@will-cppa/pinecone-read-only-mcp"],
      "env": {
        "PINECONE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Or with explicit options:

```json
{
  "mcpServers": {
    "pinecone-search": {
      "command": "npx",
      "args": [
        "-y",
        "@will-cppa/pinecone-read-only-mcp",
        "--api-key",
        "your-api-key-here",
        "--index-name",
        "your-index-name",
        "--rerank-model",
        "bge-reranker-v2-m3"
      ]
    }
  }
}
```

For a global installation:

```json
{
  "mcpServers": {
    "pinecone-search": {
      "command": "pinecone-read-only-mcp",
      "args": ["--api-key", "your-api-key-here"]
    }
  }
}
```

## Usage

### Command Line

Run the server using npx (no installation required):

```bash
npx @will-cppa/pinecone-read-only-mcp --api-key YOUR_API_KEY
```

Or if installed globally:

```bash
pinecone-read-only-mcp --api-key YOUR_API_KEY
```

Or if installed locally in your project:

```bash
node node_modules/@will-cppa/pinecone-read-only-mcp/dist/index.js --api-key YOUR_API_KEY
```

### Available Options

```
--api-key TEXT           Pinecone API key (or set PINECONE_API_KEY env var)
--index-name TEXT        Pinecone index name [default: rag-hybrid]
--rerank-model TEXT      Reranking model [default: bge-reranker-v2-m3]
--log-level TEXT         Logging level [default: INFO]
--help, -h               Show help message
```

## Deployment

### Production Readiness Defaults

- Build now **fails fast** on TypeScript errors (`npm run build` no longer suppresses failures).
- CI validates typecheck, lint, format, build, smoke run, tests, and package dry-run.
- `list_namespaces` data is cached in-memory for 30 minutes to reduce repeated Pinecone calls.
- Query/count flow has guardrails (`suggest_query_params` before execution) to prevent wasteful calls.

### Deploy with npm Package

```bash
# install
npm i @will-cppa/pinecone-read-only-mcp

# run
npx @will-cppa/pinecone-read-only-mcp --api-key YOUR_API_KEY
```

### Deploy with Docker

```bash
# build image
docker build -t pinecone-read-only-mcp:latest .

# run (stdio MCP server)
docker run --rm -i \
  -e PINECONE_API_KEY=YOUR_API_KEY \
  -e PINECONE_INDEX_NAME=rag-hybrid \
  pinecone-read-only-mcp:latest
```

### Release Gate (recommended)

Before tagging/releasing:

```bash
npm run release:check
```

This runs full CI-equivalent checks and validates publish contents with `npm pack --dry-run`.

## API Documentation

The server exposes the following tools via MCP:

### `list_namespaces`

Discovers and lists all available namespaces in the configured Pinecone index, including metadata fields and record counts for each namespace.

**Parameters:** None

**Returns:** JSON object with namespace details including available metadata fields

`metadata_fields` values represent inferred field types from sampled records. Common values include:
`string`, `number`, `boolean`, `string[]`, and `array`.

**Example response:**

```json
{
  "status": "success",
  "count": 3,
  "namespaces": [
    {
      "name": "namespace1",
      "record_count": 1500,
      "metadata_fields": {
        "author": "string",
        "year": "number",
        "category": "string"
      }
    },
    {
      "name": "namespace2",
      "record_count": 850,
      "metadata_fields": {
        "title": "string",
        "date": "string"
      }
    }
  ]
}
```

### `suggest_query_params`

Suggests which **fields** to request and which path to use (`count`, or hybrid query presets **fast** / **detailed** / **full** — same vocabulary as the `query` tool `preset` argument), based on the namespace’s schema (from `list_namespaces`) and the user’s natural language query. This is a mandatory flow step before `count` / `query` tools.

**Parameters:**

| Parameter    | Type   | Required | Description                                                                                     |
| ------------ | ------ | -------- | ----------------------------------------------------------------------------------------------- |
| `namespace`  | string | Yes      | Namespace to query (must match a name from `list_namespaces`)                                   |
| `user_query` | string | Yes      | User’s question or intent (e.g. "list papers by John Doe with titles", "how many papers by Wong?") |

**Returns:** `suggested_fields` (only fields that exist in that namespace), `use_count_tool`, `recommended_tool`, `explanation`, and `namespace_found`.

**Example response:**

```json
{
  "status": "success",
  "suggested_fields": ["document_number", "title", "url", "author"],
  "use_count_tool": false,
  "recommended_tool": "fast",
  "explanation": "User asked for a list or browse; use minimal fields (no chunk_text) for smaller payload and cost.",
  "namespace_found": true
}
```

Use `suggested_fields` as the `fields` parameter when calling query tools.

### `guided_query`

Single orchestrator tool that runs the full flow in one call:

1. namespace routing (if namespace is omitted),
2. query param suggestion,
3. execution via `count` or hybrid `query` (`fast` / `detailed` / `full` presets).

It returns both the final result and a `decision_trace` for transparency.

**Parameters:**

| Parameter         | Type    | Required | Default | Description                                                                         |
| ----------------- | ------- | -------- | ------- | ----------------------------------------------------------------------------------- |
| `user_query`      | string  | Yes      | -       | User question/intent                                                                |
| `namespace`       | string  | No       | -       | Optional explicit namespace                                                         |
| `metadata_filter` | object  | No       | -       | Optional metadata filter                                                            |
| `top_k`           | integer | No       | `10`    | Query result size for query paths (1-100)                                           |
| `preferred_tool`  | enum    | No       | `auto`  | One of `auto`, `count`, `fast`, `detailed`, `full`                                 |
| `enrich_urls`     | boolean | No       | `true`  | Auto-generate URLs for `mailing` and `slack-Cpplang` when `metadata.url` is missing |

**Returns:** JSON containing `decision_trace` and `result`.

### `generate_urls`

Generates URLs for retrieved records when metadata does not contain `url` and URL is required.

Supported namespaces:

- `mailing`
- `slack-Cpplang`

Rules:

- **`mailing`**: uses `doc_id` or `thread_id`  
  Format: `https://lists.boost.org/archives/list/{doc_id_or_thread_id}/`
- **`slack-Cpplang`**: prefer `source` directly if present; otherwise use `team_id`, `channel_id`, and `doc_id`  
  `message_id = doc_id.replace('.', '')`  
  Format: `https://app.slack.com/client/{team_id}/{channel_id}/p{message_id}`

**Parameters:**

| Parameter   | Type   | Required | Description                                                                                   |
| ----------- | ------ | -------- | --------------------------------------------------------------------------------------------- |
| `namespace` | string | Yes      | Namespace for URL-generation logic                                                            |
| `records`   | array  | Yes      | Retrieved records; each item can be either metadata itself or an object with `metadata` field |

**Returns:** Per-record generated URL, generation method, and reason if unavailable.

### `count`

Returns the **unique document count** matching a metadata filter and semantic query. Use for questions like "how many papers by John Doe?" instead of the `query` tool. For performance, the count tool uses **semantic (dense) search only** (no hybrid or lexical) and requests only document identifiers (`document_number`, `url`, `doc_id`)—no chunk content—then deduplicates by document.

**Parameters:**

| Parameter         | Type   | Required | Description                                                                                  |
| ----------------- | ------ | -------- | -------------------------------------------------------------------------------------------- |
| `namespace`       | string | Yes      | Namespace to count in (use `list_namespaces` to discover)                                    |
| `query_text`      | string | Yes      | Search query; use a broad term (e.g. `"paper"`, `"document"`) when counting by metadata only |
| `metadata_filter` | object | No       | Same operators as `query` (e.g. `{"author": {"$in": ["John Doe"]}}` for wg21-papers)       |

**Returns:** JSON with `count` (unique documents, up to 10,000), and `truncated: true` if there are at least 10,000 matches.

**Example response:**

```json
{
  "status": "success",
  "count": 42,
  "truncated": false,
  "namespace": "wg21-papers",
  "metadata_filter": { "author": { "$in": ["John Doe"] } }
}
```

### `keyword_search`

Performs **keyword (lexical/sparse-only)** search over the dedicated sparse index (default: `rag-hybrid-sparse`, i.e. `{PINECONE_INDEX_NAME}-sparse`). Use for exact or keyword-style queries. Does not use the dense index or semantic reranking. Call `list_namespaces` first to discover namespaces; `suggest_query_params` is optional.

**Parameters:**

| Parameter         | Type     | Required | Default | Description                                                                 |
| ----------------- | -------- | -------- | ------- | --------------------------------------------------------------------------- |
| `query_text`      | string   | Yes      | -       | Search query text (keyword/lexical match)                                   |
| `namespace`       | string   | Yes      | -       | Namespace to search (use `list_namespaces` to discover)                     |
| `top_k`           | integer  | No       | `10`    | Number of results to return (1-100)                                         |
| `metadata_filter` | object   | No       | -       | Optional metadata filter (same operators as `query`)                         |
| `fields`          | string[] | No       | -       | Optional field names to return; omit for all fields                        |

**Returns:** JSON with `status`, `query`, `namespace`, `index` (sparse index name), `result_count`, and `results` (ids, metadata, scores). Result rows match the `query` tool shape (e.g. `paper_number`, `title`, `author`, `url`, `content`, `score`, `reranked: false`).

**Example response:**

```json
{
  "status": "success",
  "query": "contracts C++",
  "namespace": "wg21-papers",
  "index": "rag-hybrid-sparse",
  "result_count": 5,
  "results": [
    {
      "paper_number": "P0548",
      "title": "Contracts for C++",
      "author": "John Doe",
      "url": "https://...",
      "content": "...",
      "score": 0.85,
      "reranked": false
    }
  ]
}
```

### `query`

Performs hybrid semantic search over the specified namespace in the Pinecone index with optional metadata filtering. For **count** questions, use the `count` tool instead.

**Parameters:**

| Parameter         | Type     | Required | Default | Description                                                                                                                                          |
| ----------------- | -------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `query_text`      | string   | Yes      | -       | Search query text                                                                                                                                    |
| `namespace`       | string   | Yes      | -       | Namespace to search (use `list_namespaces` to discover)                                                                                              |
| `top_k`           | integer  | No       | `10`    | Number of results (1-100)                                                                                                                            |
| `use_reranking`   | boolean  | No       | `true`  | Enable semantic reranking                                                                                                                            |
| `metadata_filter` | object   | No       | -       | Metadata filter to narrow results (e.g., `{"author": "John", "year": 2023}`)                                                                         |
| `fields`          | string[] | No       | -       | Field names to return (e.g. `["document_number", "title", "url"]`). Omit for all fields; include `chunk_text` for content. Reduces payload and cost. |

**Returns:** JSON object with search results (only requested fields when `fields` is set), relevance scores, and metadata

**Example response:**

```json
{
  "status": "success",
  "query": "your search query",
  "namespace": "namespace1",
  "metadata_filter": { "author": "John Doe" },
  "result_count": 10,
  "results": [
    {
      "paper_number": "DOC-001",
      "title": "Document Title",
      "author": "John Doe",
      "url": "https://example.com/doc",
      "content": "Document content preview...",
      "score": 0.9234,
      "reranked": true
    }
  ]
}
```

**Using Metadata Filters:**

Metadata filters allow you to narrow down search results based on document properties. First, use `list_namespaces` to see available metadata fields, then apply filters.

**Supported Operators (10 total):**

| Operator              | Syntax                  | Description              | Example                                                                  |
| --------------------- | ----------------------- | ------------------------ | ------------------------------------------------------------------------ |
| Equal                 | `$eq` or value directly | Exact match              | `{"status": "published"}` or `{"status": {"$eq": "published"}}`          |
| Not Equal             | `$ne`                   | Not equal to             | `{"status": {"$ne": "draft"}}`                                           |
| Greater Than          | `$gt`                   | Greater than             | `{"year": {"$gt": 2022}}`                                                |
| Greater Than or Equal | `$gte`                  | Greater than or equal    | `{"timestamp": {"$gte": 1704067200}}`                                    |
| Less Than             | `$lt`                   | Less than                | `{"score": {"$lt": 0.5}}`                                                |
| Less Than or Equal    | `$lte`                  | Less than or equal       | `{"priority": {"$lte": 3}}`                                              |
| In Array              | `$in`                   | Value is in array field  | `{"tags": {"$in": ["cpp", "contracts"]}}` (only for array-type fields)   |
| Not In Array          | `$nin`                  | Value not in array field | `{"tags": {"$nin": ["draft", "archived"]}}` (only for array-type fields) |

**Filter Examples:**

```json
// Exact match (implicit $eq) - works for single-value string fields
{"status": "published"}

// Exact string match - NOTE: requires full exact match
{"author": "John Doe"}  // Only matches if author field is exactly "John Doe"

// Array field contains value (use $in only for array-type fields)
{"tags": {"$in": ["cpp", "contracts"]}}  // Only if tags is stored as an array

// Numeric comparison
{"year": {"$gte": 2023}}

// Timestamp range (papers from last 2 years)
{"timestamp": {"$gte": 1704067200}}

// Multiple conditions on same field
{"score": {"$gt": 0.8, "$lt": 1.0}}
{"timestamp": {"$gte": 1704067200, "$lte": 1735689600}}

// Multiple fields (AND logic)
{
  "year": {"$gte": 2023},
  "status": "published",
  "timestamp": {"$gte": 1704067200}
}

// Array field not in list (only for array-type fields)
{"tags": {"$nin": ["draft", "template"]}}
```

**Important Limitations:**

- **String fields require EXACT match** - No wildcards, partial matches, or substring searches
- **Comma-separated strings**: If a field contains `"John Doe, Herb Sutter"`, you cannot filter for just `"John Doe"`
  - You must match the entire string: `{"author": "John Doe, Herb Sutter"}`
  - To filter by individual authors, the data must be stored as an array field
- **`$in` and `$nin` operators**: Only work on array-type fields, not comma-separated strings
- **Unsupported operators are rejected**: Unknown operators (for example `$regex`) return a validation error
- **`$in` and `$nin` must use arrays**: `{"tags": {"$in": "cpp"}}` is invalid; use `{"tags": {"$in": ["cpp"]}}`
- Multiple conditions at the top level are combined with **AND** logic
- Use comparison operators (`$gt`, `$gte`, `$lt`, `$lte`) for numeric and timestamp fields
- Direct value assignment implies `$eq` (exact match)

## How It Works

1. **Namespace Discovery**: The `list_namespaces` tool queries your Pinecone index stats to discover available namespaces
2. **Hybrid Search**: When querying, the tool searches both dense and sparse indexes in parallel
3. **Result Merging**: Results from both indexes are merged and deduplicated
4. **Reranking** (optional): The merged results are reranked using a semantic reranker for improved relevance

## Development

### Setup Development Environment

```bash
git clone https://github.com/CppDigest/pinecone-read-only-mcp-typescript.git
cd pinecone-read-only-mcp-typescript
npm install
```

### Build

```bash
npm run build
```

### Run Tests

```bash
npm test
```

### Testing the keyword_search tool

1. **Connectivity and keyword search (script):**  
   Run the search test script (includes a keyword search step against the sparse index):
   ```bash
   PINECONE_API_KEY=your-key npm run test:search
   ```
   If the sparse index (`rag-hybrid-sparse` by default) does not exist or has no data, the keyword search step is skipped with a warning.

2. **Via MCP client:**  
   Start the server and call the `keyword_search` tool with `query_text`, `namespace` (from `list_namespaces`), and optional `top_k` or `metadata_filter`. Response shape is the same as the `query` tool (e.g. `results` with ids, metadata, scores; `reranked` is always `false`).

### Code Quality

```bash
# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Check formatting
npm run format:check

# Format code
npm run format

# Type check
npm run typecheck
```

### Development Server

Run the server in development mode with auto-reload:

```bash
npm run dev -- --api-key YOUR_API_KEY
```

### Contribution Guidelines

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and add tests
4. Ensure all tests pass: `npm test`
5. Ensure code quality checks pass: `npm run lint && npm run format:check && npm run typecheck`
6. Commit your changes: `git commit -am 'Add some feature'`
7. Push to the branch: `git push origin feature-name`
8. Submit a pull request

## Dependencies

### Production Dependencies

- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) - MCP SDK for TypeScript
- [@pinecone-database/pinecone](https://www.npmjs.com/package/@pinecone-database/pinecone) - Pinecone client SDK
- [zod](https://www.npmjs.com/package/zod) - TypeScript-first schema validation
- [dotenv](https://www.npmjs.com/package/dotenv) - Environment variable management

### Development Dependencies

- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- [ESLint](https://eslint.org/) - Code linting
- [Prettier](https://prettier.io/) - Code formatting
- [Vitest](https://vitest.dev/) - Testing framework

## Comparison with Python Version

This TypeScript implementation grew out of the [Python version](https://github.com/CppDigest/pinecone-read-only-mcp) and now exposes a strict superset of its tool surface, including:

- `guided_query` (single-call orchestrator with decision trace)
- `query_documents` (full-document reassembly from chunks)
- `keyword_search` (sparse-index-only retrieval)
- `namespace_router` and `suggest_query_params` (flow guidance)
- `count` and `generate_urls`

Other benefits:

- Native Node.js integration
- Better npm ecosystem integration
- TypeScript type safety
- Similar performance characteristics

## Troubleshooting

### API Key Issues

If you see "Pinecone API key is required" error:

1. Ensure `PINECONE_API_KEY` environment variable is set, OR
2. Pass `--api-key` option when running the server

### Index Not Found

If you see index-related errors:

1. Verify your index name is correct
2. Ensure your API key has access to the index
3. Check that both `your-index-name` and `your-index-name-sparse` indexes exist

### Connection Issues

If you experience connection issues:

1. Check your internet connection
2. Verify Pinecone service status
3. Ensure firewall/proxy settings allow connections to Pinecone

## License

This project is licensed under the Boost Software License 1.0 - see the [LICENSE](LICENSE) file for details.

## Authors

- **Will Pak** - [cppalliance.org](https://cppalliance.org/)

## Acknowledgements

This project uses:

- [Pinecone](https://www.pinecone.io/) for vector storage and retrieval
- [Model Context Protocol](https://modelcontextprotocol.io/) for standardized AI integration
- Hybrid search approach combining dense embeddings with sparse BM25-style retrieval

## Related Projects

- [Python version](https://github.com/CppDigest/pinecone-read-only-mcp) - Original Python implementation
- [Pinecone MCP](https://github.com/pinecone-io/pinecone-mcp) - Full-featured Pinecone MCP with write capabilities

## Support

For issues and questions:

- GitHub Issues: [https://github.com/CppDigest/pinecone-read-only-mcp-typescript/issues](https://github.com/CppDigest/pinecone-read-only-mcp-typescript/issues)
- Email: will@cppalliance.org

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes in each version.
