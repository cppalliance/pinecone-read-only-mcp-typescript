/**
 * CLI argv parsing for `src/index.ts`. All flags map into {@link ConfigOverrides}
 * for {@link resolveConfig}; environment variables remain the fallback there.
 */

import { SERVER_VERSION } from './constants.js';
import type { ConfigOverrides } from './core/config.js';

export type ParseCliResult =
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'config'; overrides: ConfigOverrides };

function parsePositiveInt(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Next argv token if it is a real value (not another flag). */
function readOptionValue(argv: string[], i: number): string | undefined {
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('-')) return undefined;
  return v;
}

/** Parse `process.argv` (slice 2..) into help/version/config result. */
export function parseCli(argv: string[] = process.argv.slice(2)): ParseCliResult {
  const overrides: ConfigOverrides = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case '--help':
      case '-h':
        return { kind: 'help' };
      case '--version':
      case '-v':
        return { kind: 'version' };
      case '--api-key': {
        const v = readOptionValue(argv, i);
        if (v !== undefined) {
          overrides.apiKey = v;
          i++;
        }
        break;
      }
      case '--index-name': {
        const v = readOptionValue(argv, i);
        if (v !== undefined) {
          overrides.indexName = v;
          i++;
        }
        break;
      }
      case '--sparse-index-name': {
        const v = readOptionValue(argv, i);
        if (v !== undefined) {
          overrides.sparseIndexName = v;
          i++;
        }
        break;
      }
      case '--rerank-model': {
        const v = readOptionValue(argv, i);
        if (v !== undefined) {
          overrides.rerankModel = v;
          i++;
        }
        break;
      }
      case '--top-k': {
        const raw = readOptionValue(argv, i);
        const n = parsePositiveInt(raw);
        if (n !== undefined) {
          overrides.defaultTopK = n;
          i++;
        }
        break;
      }
      case '--log-level': {
        const v = readOptionValue(argv, i);
        if (v !== undefined) {
          overrides.logLevel = v;
          i++;
        }
        break;
      }
      case '--log-format': {
        const v = readOptionValue(argv, i);
        if (v !== undefined) {
          overrides.logFormat = v;
          i++;
        }
        break;
      }
      case '--cache-ttl-seconds': {
        const raw = readOptionValue(argv, i);
        const n = parsePositiveInt(raw);
        if (n !== undefined) {
          overrides.cacheTtlSeconds = n;
          i++;
        }
        break;
      }
      case '--request-timeout-ms': {
        const raw = readOptionValue(argv, i);
        const n = parsePositiveInt(raw);
        if (n !== undefined) {
          overrides.requestTimeoutMs = n;
          i++;
        }
        break;
      }
      case '--disable-suggest-flow':
        overrides.disableSuggestFlow = true;
        break;
      case '--check-indexes':
        overrides.checkIndexes = true;
        break;
      default:
        break;
    }
  }

  return { kind: 'config', overrides };
}

/** Print CLI usage (stdout). */
export function printHelp(): void {
  process.stdout.write(`
Pinecone Read-Only MCP Server

Usage: pinecone-read-only-mcp [options]

Options:
  --api-key TEXT              Pinecone API key (or PINECONE_API_KEY)
  --index-name TEXT           Dense index (required, or PINECONE_INDEX_NAME)
  --sparse-index-name TEXT    Sparse index [default: {index-name}-sparse]
  --rerank-model TEXT         Reranker model (default: bge-reranker-v2-m3, or PINECONE_RERANK_MODEL)
  --top-k N                   Default top-k for queries [env: PINECONE_TOP_K]
  --log-level LEVEL           DEBUG | INFO | WARN | ERROR [default: INFO]
  --log-format FORMAT         text | json [default: text]
  --cache-ttl-seconds N       Namespace / suggest-flow cache TTL [env: PINECONE_CACHE_TTL_SECONDS]
  --request-timeout-ms N      Per Pinecone call timeout [env: PINECONE_REQUEST_TIMEOUT_MS]
  --disable-suggest-flow      Bypass suggest_query_params gate (PINECONE_DISABLE_SUGGEST_FLOW)
  --check-indexes             Verify dense + sparse indexes then exit 0/1 (PINECONE_CHECK_INDEXES)
  --help, -h                  Show this message
  --version, -v               Print package version

Environment variables are documented in README.md (CLI overrides win when both are set).

Examples:
  pinecone-read-only-mcp --api-key YOUR_KEY
  export PINECONE_API_KEY=YOUR_KEY && pinecone-read-only-mcp --index-name my-index
`);
}

/** Print package version (stdout). */
export function printVersion(): void {
  process.stdout.write(`${SERVER_VERSION}\n`);
}
