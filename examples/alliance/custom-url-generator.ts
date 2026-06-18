/**
 * Example: register a custom URL generator for your namespace.
 *
 * The Pinecone Read-Only MCP exposes a per-namespace URL registry so library
 * consumers can synthesize URLs from metadata when records do not already
 * carry a `url` field. Built-in `mailing` / `slack-Cpplang` generators are
 * registered by `setupAllianceServer` (Alliance layer); everything else is up to you.
 *
 * Usage:
 *   1. `createServer(config)` → `ctx.setClient(...)` → `ctx.registerUrlGenerator(namespace, fn)`.
 *   2. `await setupAllianceServer({ context: ctx })`.
 *   3. The generate_urls tool and query row enrichment use the registry automatically.
 *
 * Run from a project that depends on the package, or use this repo after `npm run build`.
 */

import {
  createServer,
  PineconeClient,
  resolveConfig,
  type UrlGenerationResult,
} from '@will-cppa/pinecone-read-only-mcp';
import { setupAllianceServer } from '@will-cppa/pinecone-read-only-mcp/alliance';

async function main(): Promise<void> {
  const apiKey = process.env['PINECONE_API_KEY']?.trim();
  const indexName = process.env['PINECONE_INDEX_NAME']?.trim();
  if (!apiKey || !indexName) {
    console.log(
      '[custom-url-generator] Set PINECONE_API_KEY and PINECONE_INDEX_NAME to run live.'
    );
    return;
  }
  const config = resolveConfig({ apiKey, indexName });

  const ctx = createServer(config);
  ctx.setClient(
    new PineconeClient({
      apiKey: config.apiKey,
      indexName: config.indexName,
      sparseIndexName: config.sparseIndexName,
      rerankModel: config.rerankModel,
      requestTimeoutMs: config.requestTimeoutMs,
    })
  );

  ctx.registerUrlGenerator('product-docs', (metadata): UrlGenerationResult => {
    const product = typeof metadata['product'] === 'string' ? metadata['product'] : null;
    const slug = typeof metadata['slug'] === 'string' ? metadata['slug'] : null;
    if (!product || !slug) {
      return {
        url: null,
        method: 'unavailable',
        reason: 'product-docs requires both `product` and `slug` metadata fields',
      };
    }
    return {
      url: `https://docs.example.com/${product}/${slug}`,
      method: 'generated.custom',
    };
  });

  const server = await setupAllianceServer({ context: ctx });
  void server;
  console.log('Custom URL generator registered for namespace "product-docs".');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
