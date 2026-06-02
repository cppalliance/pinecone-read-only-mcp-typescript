/**
 * Generic quickstart: embed setupCoreServer and call core MCP tools in-process.
 *
 * Flow: list_namespaces → count → query (preset fast, no rerank).
 * Requires seeded data (seed-data.ts). Core resolveConfig disables the suggest-flow gate by default.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { config as loadEnv } from 'dotenv';
import {
  PineconeClient,
  resolveConfig,
  setPineconeClient,
  setupCoreServer,
  teardownServer,
} from '@will-cppa/pinecone-read-only-mcp';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLinkedTransports } from '../mcp-linked-transport.js';
import { QUICKSTART_NAMESPACE } from './seed-data.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(__dirname, '.env') });
loadEnv();

function parseToolJson(result: { content?: Array<{ type: string; text?: string }>; isError?: boolean }): unknown {
  const text = result.content?.find((c) => c.type === 'text')?.text;
  if (!text) {
    throw new Error('Tool result had no text content');
  }
  return JSON.parse(text) as unknown;
}

async function main(): Promise<void> {
  const apiKey = process.env['PINECONE_API_KEY']?.trim();
  const indexName = process.env['PINECONE_INDEX_NAME']?.trim();

  if (!apiKey || !indexName) {
    console.log(
      '[mcp-demo] Set PINECONE_API_KEY and PINECONE_INDEX_NAME (see examples/quickstart/.env.example). ' +
        'Run seed-data.ts first, then this script.'
    );
    return;
  }

  const config = resolveConfig({
    apiKey,
    indexName,
  });

  setPineconeClient(
    new PineconeClient({
      apiKey: config.apiKey,
      indexName: config.indexName,
      sparseIndexName: config.sparseIndexName,
      defaultTopK: config.defaultTopK,
      requestTimeoutMs: config.requestTimeoutMs,
    })
  );

  const { clientTransport, serverTransport } = createLinkedTransports();
  const server = await setupCoreServer(config);
  await server.connect(serverTransport);

  const client = new Client({ name: 'quickstart-demo', version: '1.0.0' });
  await client.connect(clientTransport);

  try {
    console.log('\n--- list_namespaces ---');
    const listRaw = await client.callTool({ name: 'list_namespaces', arguments: {} });
    if (listRaw.isError) {
      throw new Error(`list_namespaces failed: ${JSON.stringify(listRaw)}`);
    }
    const listPayload = parseToolJson(listRaw) as {
      status?: string;
      count?: number;
      namespaces?: Array<{ name: string; record_count: number }>;
    };
    console.log(JSON.stringify(listPayload, null, 2));

    const ns =
      listPayload.namespaces?.find((n) => n.name === QUICKSTART_NAMESPACE)?.name ??
      listPayload.namespaces?.[0]?.name;

    if (!ns) {
      throw new Error(
        `No namespaces found. Run: npx tsx examples/quickstart/seed-data.ts (expected "${QUICKSTART_NAMESPACE}").`
      );
    }

    console.log(`\n--- count (namespace="${ns}") ---`);
    const countRaw = await client.callTool({
      name: 'count',
      arguments: {
        namespace: ns,
        query_text: 'document',
      },
    });
    if (countRaw.isError) {
      throw new Error(`count failed: ${JSON.stringify(countRaw)}`);
    }
    const countPayload = parseToolJson(countRaw);
    console.log(JSON.stringify(countPayload, null, 2));

    console.log(`\n--- query (namespace="${ns}", preset=fast) ---`);
    const queryRaw = await client.callTool({
      name: 'query',
      arguments: {
        namespace: ns,
        query_text: 'functions and reusable logic',
        preset: 'fast',
        top_k: 3,
      },
    });
    if (queryRaw.isError) {
      throw new Error(`query failed: ${JSON.stringify(queryRaw)}`);
    }
    const queryPayload = parseToolJson(queryRaw);
    console.log(JSON.stringify(queryPayload, null, 2));

    console.log('\nQuickstart MCP demo completed successfully.');
  } finally {
    await client.close();
    await server.close();
    teardownServer();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
