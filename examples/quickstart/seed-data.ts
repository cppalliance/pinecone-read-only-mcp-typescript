/**
 * Seed domain-neutral sample records into dense + sparse Pinecone indexes.
 *
 * Prerequisites: integrated-embedding indexes already exist (see README.md).
 * Usage: npx tsx examples/quickstart/seed-data.ts [--dry-run]
 */

import { config as loadEnv } from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '.env') });
loadEnv();

export const QUICKSTART_NAMESPACE = 'quickstart';

const SAMPLE_SNIPPETS: Array<{ id: string; document_number: string; title: string; chunk_text: string }> =
  [
    {
      id: 'qs-001',
      document_number: 'DOC-001',
      title: 'Variables and types',
      chunk_text: 'Most languages distinguish mutable variables from immutable values and attach static or dynamic types.',
    },
    {
      id: 'qs-002',
      document_number: 'DOC-002',
      title: 'Functions',
      chunk_text: 'A function packages reusable logic with parameters and a return value, enabling decomposition of programs.',
    },
    {
      id: 'qs-003',
      document_number: 'DOC-003',
      title: 'Control flow',
      chunk_text: 'Conditionals and loops direct which statements run, forming the backbone of structured programming.',
    },
    {
      id: 'qs-004',
      document_number: 'DOC-004',
      title: 'Data structures',
      chunk_text: 'Arrays, lists, maps, and trees organize data so algorithms can access and update information efficiently.',
    },
    {
      id: 'qs-005',
      document_number: 'DOC-005',
      title: 'Recursion',
      chunk_text: 'A recursive function solves a problem by calling itself on smaller subproblems until a base case is reached.',
    },
    {
      id: 'qs-006',
      document_number: 'DOC-006',
      title: 'Object-oriented design',
      chunk_text: 'Classes encapsulate state and behavior; inheritance and polymorphism help model relationships between concepts.',
    },
    {
      id: 'qs-007',
      document_number: 'DOC-007',
      title: 'Error handling',
      chunk_text: 'Exceptions and result types let programs recover from failures instead of crashing silently.',
    },
    {
      id: 'qs-008',
      document_number: 'DOC-008',
      title: 'Concurrency',
      chunk_text: 'Threads, async tasks, and message passing coordinate work across cores without corrupting shared state.',
    },
    {
      id: 'qs-009',
      document_number: 'DOC-009',
      title: 'Testing',
      chunk_text: 'Unit tests verify small pieces of logic; integration tests exercise components together under realistic inputs.',
    },
    {
      id: 'qs-010',
      document_number: 'DOC-010',
      title: 'Version control',
      chunk_text: 'Git tracks changes over time, supports branching for experiments, and enables collaborative code review.',
    },
    {
      id: 'qs-011',
      document_number: 'DOC-011',
      title: 'APIs',
      chunk_text: 'Application programming interfaces define contracts between services, often using HTTP and JSON payloads.',
    },
    {
      id: 'qs-012',
      document_number: 'DOC-012',
      title: 'Databases',
      chunk_text: 'Relational and document stores persist structured data; indexes accelerate lookups for query-heavy workloads.',
    },
    {
      id: 'qs-013',
      document_number: 'DOC-013',
      title: 'Caching',
      chunk_text: 'Caches store frequently accessed values in fast memory to reduce latency and load on upstream systems.',
    },
    {
      id: 'qs-014',
      document_number: 'DOC-014',
      title: 'Security basics',
      chunk_text: 'Hashing passwords, validating input, and applying least privilege reduce common attack surfaces.',
    },
    {
      id: 'qs-015',
      document_number: 'DOC-015',
      title: 'Documentation',
      chunk_text: 'Clear README files and inline comments help newcomers understand setup steps and architectural decisions.',
    },
  ];

function parseArgs(): { dryRun: boolean } {
  return { dryRun: process.argv.includes('--dry-run') };
}

async function upsertToIndex(
  pc: Pinecone,
  indexName: string,
  namespace: string,
  dryRun: boolean
): Promise<void> {
  const records = SAMPLE_SNIPPETS.map((row) => ({
    id: row.id,
    chunk_text: row.chunk_text,
    document_number: row.document_number,
    title: row.title,
  }));

  if (dryRun) {
    console.log(`[dry-run] Would upsert ${records.length} records to index "${indexName}" namespace "${namespace}"`);
    return;
  }

  // Pinecone TS SDK v7: index({ name }) and upsertRecords({ records }) per UpsertRecordsOptions.
  const index = pc.index({ name: indexName }).namespace(namespace);
  await index.upsertRecords({ records });
  console.log(`Upserted ${records.length} records → index "${indexName}", namespace "${namespace}"`);
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs();
  const apiKey = process.env['PINECONE_API_KEY']?.trim();
  const indexName = process.env['PINECONE_INDEX_NAME']?.trim();

  if (!apiKey || !indexName) {
    console.log(
      '[seed-data] Set PINECONE_API_KEY and PINECONE_INDEX_NAME in examples/quickstart/.env (see .env.example).'
    );
    process.exit(dryRun ? 0 : 1);
  }

  const sparseIndexName =
    process.env['PINECONE_SPARSE_INDEX_NAME']?.trim() ?? `${indexName}-sparse`;

  console.log(`Dense index: ${indexName}`);
  console.log(`Sparse index: ${sparseIndexName}`);
  console.log(`Namespace: ${QUICKSTART_NAMESPACE}`);

  const pc = new Pinecone({ apiKey });

  await upsertToIndex(pc, indexName, QUICKSTART_NAMESPACE, dryRun);
  await upsertToIndex(pc, sparseIndexName, QUICKSTART_NAMESPACE, dryRun);

  console.log('Done. Wait a few seconds for indexing, then run: npx tsx examples/quickstart/mcp-demo.ts');
}

const isDirectRun =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
