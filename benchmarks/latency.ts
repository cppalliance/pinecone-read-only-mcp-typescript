#!/usr/bin/env tsx
/**
 * Local benchmark harness: mocked Pinecone I/O, measures server-side latency (p50/p95/p99).
 *
 * Usage: npm run benchmark
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PineconeClient } from '../src/pinecone-client.js';
import { setLogLevel } from '../src/logger.js';
import { setPineconeClient } from '../src/server/client-context.js';
import { invalidateNamespacesCache, getNamespacesWithCache } from '../src/server/namespaces-cache.js';
import { registerGuidedQueryTool } from '../src/server/tools/guided-query-tool.js';
import type { MergedHit, PineconeHit, SearchResult, SearchableIndex } from '../src/types.js';

const WARMUP = 10;
const ITERATIONS = 200;
const TOP_K = 20;

type BenchmarkResult = {
  name: string;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  iterations: number;
};

/** Test double: stub ensureIndexes, searchIndex, rerankResults (no network). */
type PineconeClientBenchDouble = PineconeClient & {
  ensureIndexes: () => Promise<{ denseIndex: SearchableIndex; sparseIndex: SearchableIndex }>;
  searchIndex: (
    _index: SearchableIndex,
    _query: string,
    _topK: number,
    _namespace?: string,
    _metadataFilter?: Record<string, unknown>,
    _options?: { fields?: string[] }
  ) => Promise<PineconeHit[]>;
  rerankResults: (_q: string, results: MergedHit[], topN: number) => Promise<SearchResult[]>;
};

function syntheticHits(prefix: string, count: number, scoreBase: number): PineconeHit[] {
  const hits: PineconeHit[] = [];
  for (let i = 0; i < count; i++) {
    hits.push({
      _id: `${prefix}-${i}`,
      _score: scoreBase - i * 0.01,
      fields: {
        chunk_text: `Content ${prefix} ${i} lorem ipsum dolor sit amet.`,
        document_number: `DOC-${prefix}-${i}`,
        title: `Title ${i}`,
        url: `https://example.com/${prefix}/${i}`,
        author: 'bench',
      },
    });
  }
  return hits;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

async function runBenchmark(
  name: string,
  fn: () => Promise<void>,
  iterations = ITERATIONS
): Promise<BenchmarkResult> {
  for (let w = 0; w < WARMUP; w++) {
    await fn();
  }
  const samples: number[] = [];
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await fn();
    const t1 = performance.now();
    const ms = t1 - t0;
    samples.push(ms);
    min = Math.min(min, ms);
    max = Math.max(max, ms);
  }
  samples.sort((a, b) => a - b);
  const round4 = (n: number) => Math.round(n * 10000) / 10000;
  return {
    name,
    p50: round4(percentile(samples, 50)),
    p95: round4(percentile(samples, 95)),
    p99: round4(percentile(samples, 99)),
    min: round4(min),
    max: round4(max),
    iterations,
  };
}

function formatTable(rows: BenchmarkResult[]): string {
  const headers = ['Scenario', 'p50 (ms)', 'p95 (ms)', 'p99 (ms)', 'min (ms)', 'max (ms)'];
  const colWidths = [28, 12, 12, 12, 12, 12];
  const line = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(colWidths[i])).join(' | ');
  const out: string[] = [line(headers), line(colWidths.map((w) => '-'.repeat(w)))];
  for (const r of rows) {
    out.push(
      line([
        r.name.slice(0, colWidths[0] ?? 28),
        r.p50.toFixed(4),
        r.p95.toFixed(4),
        r.p99.toFixed(4),
        r.min.toFixed(4),
        r.max.toFixed(4),
      ])
    );
  }
  return out.join('\n');
}

function buildQueryBenchClient(): PineconeClientBenchDouble {
  const denseHits = syntheticHits('dense', TOP_K, 0.95);
  const sparseHits = syntheticHits('sparse', TOP_K, 0.9);
  const denseIndexRef = {} as SearchableIndex;
  const sparseIndexRef = {} as SearchableIndex;
  const client = new PineconeClient({
    apiKey: 'bench-key',
    indexName: 'bench-index',
    rerankModel: 'bench-rerank',
  }) as PineconeClientBenchDouble;

  client.ensureIndexes = async () => ({
    denseIndex: denseIndexRef,
    sparseIndex: sparseIndexRef,
  });

  client.searchIndex = async (index) => {
    if (index === denseIndexRef) return denseHits;
    if (index === sparseIndexRef) return sparseHits;
    return [];
  };

  client.rerankResults = async (_q, results, topN) =>
    results.slice(0, topN).map((r, i) => ({
      id: r._id,
      content: r.chunk_text,
      score: 1 - i * 0.01,
      metadata: r.metadata,
      reranked: true,
    }));

  return client;
}

function captureGuidedQueryHandler(): (params: {
  user_query: string;
  namespace?: string;
  metadata_filter?: Record<string, unknown>;
  top_k: number;
  preferred_tool: 'auto' | 'count' | 'query_fast' | 'query_detailed';
  enrich_urls: boolean;
}) => Promise<unknown> {
  const handlers = new Map<string, (params: unknown) => Promise<unknown>>();
  const mockServer = {
    registerTool: (
      name: string,
      _config: unknown,
      handler: (params: unknown) => Promise<unknown>
    ) => {
      handlers.set(name, handler);
    },
  } as unknown as McpServer;
  registerGuidedQueryTool(mockServer);
  const h = handlers.get('guided_query');
  if (!h) {
    throw new Error('guided_query handler not registered');
  }
  return h as (params: {
    user_query: string;
    namespace?: string;
    metadata_filter?: Record<string, unknown>;
    top_k: number;
    preferred_tool: 'auto' | 'count' | 'query_fast' | 'query_detailed';
    enrich_urls: boolean;
  }) => Promise<unknown>;
}

const benchNamespaceMetadata = {
  document_number: 'string',
  title: 'string',
  url: 'string',
  author: 'string',
  chunk_text: 'string',
} as const;

function createBenchPineconeMock(): PineconeClient {
  const namespaces = [
    {
      namespace: 'docs',
      recordCount: 1000,
      metadata: { ...benchNamespaceMetadata },
    },
  ];

  const mockQueryResults: SearchResult[] = syntheticHits('mock', 10, 0.9).map((h) => ({
    id: h._id,
    content: String(h.fields['chunk_text'] ?? ''),
    score: h._score,
    metadata: {
      document_number: h.fields['document_number'],
      title: h.fields['title'],
      url: h.fields['url'],
      author: h.fields['author'],
    },
    reranked: false,
  }));

  return {
    async query() {
      return mockQueryResults;
    },
    async count() {
      return { count: 42, truncated: false };
    },
    async listNamespacesWithMetadata() {
      return namespaces;
    },
    async listNamespacesFromKeywordIndex() {
      return namespaces.map((n) => ({ namespace: n.namespace, recordCount: n.recordCount }));
    },
    getSparseIndexName() {
      return 'bench-index-sparse';
    },
    async keywordSearch() {
      return mockQueryResults;
    },
  } as unknown as PineconeClient;
}

async function main(): Promise<void> {
  setLogLevel('ERROR');
  const results: BenchmarkResult[] = [];

  const queryClient = buildQueryBenchClient();
  results.push(
    await runBenchmark('query_no_rerank', async () => {
      await queryClient.query({
        query: 'benchmark hybrid query text',
        namespace: 'docs',
        topK: TOP_K,
        useReranking: false,
      });
    })
  );

  results.push(
    await runBenchmark('query_with_rerank', async () => {
      await queryClient.query({
        query: 'benchmark hybrid query text',
        namespace: 'docs',
        topK: TOP_K,
        useReranking: true,
      });
    })
  );

  setPineconeClient(createBenchPineconeMock());
  invalidateNamespacesCache();
  await getNamespacesWithCache();

  const guidedHandler = captureGuidedQueryHandler();
  const guidedParams = {
    user_query: 'list papers about machine learning',
    top_k: TOP_K,
    preferred_tool: 'query_fast' as const,
    enrich_urls: false,
  };

  results.push(
    await runBenchmark('guided_query_end_to_end', async () => {
      await guidedHandler(guidedParams);
    })
  );

  results.push(
    await runBenchmark('list_namespaces_cache_miss', async () => {
      invalidateNamespacesCache();
      await getNamespacesWithCache();
    })
  );

  results.push(
    await runBenchmark('list_namespaces_cache_hit', async () => {
      await getNamespacesWithCache();
    })
  );

  const table = formatTable(results);
  console.log(table);
  console.log('');

  const payload = {
    generated_at: new Date().toISOString(),
    node: process.version,
    warmup_iterations: WARMUP,
    measured_iterations: ITERATIONS,
    results,
  };

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const baselinePath = join(__dirname, 'baseline.json');
  writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${baselinePath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
