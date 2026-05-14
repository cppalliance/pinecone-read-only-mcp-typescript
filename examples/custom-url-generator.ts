/**
 * Example: register a custom URL generator for your namespace.
 *
 * The Pinecone Read-Only MCP exposes a per-namespace URL registry so library
 * consumers can synthesize URLs from metadata when records do not already
 * carry a `url` field. Built-ins cover `mailing` (Boost archives) and
 * `slack-Cpplang`; everything else is up to you.
 *
 * Usage:
 *   1. Import { registerUrlGenerator, setupServer, ... } from the package.
 *   2. Call registerUrlGenerator(namespace, fn) BEFORE setupServer(config) so
 *      the registry is populated when the server registers tools.
 *   3. The generate_urls tool, plus query/keyword_search/guided_query rows,
 *      will pick up the generator automatically.
 *
 * Run from a project that depends on the package, or replace the import
 * with a relative path when running inside this repo.
 */

import {
  PineconeClient,
  registerUrlGenerator,
  resolveConfig,
  setPineconeClient,
  setupServer,
  type UrlGenerationResult,
} from '@will-cppa/pinecone-read-only-mcp';

// Example domain: a documentation index whose chunks carry { product, slug }
// metadata. We turn that into https://docs.example.com/{product}/{slug}.
registerUrlGenerator('product-docs', (metadata): UrlGenerationResult => {
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

async function main(): Promise<void> {
  const config = resolveConfig({ apiKey: process.env['PINECONE_API_KEY'] ?? 'demo-key' });
  setPineconeClient(
    new PineconeClient({
      apiKey: config.apiKey,
      indexName: config.indexName,
      sparseIndexName: config.sparseIndexName,
      rerankModel: config.rerankModel,
      requestTimeoutMs: config.requestTimeoutMs,
    })
  );

  const server = await setupServer(config);
  // `server` is ready to connect to a transport. The generate_urls tool
  // (and any query result enrichment) will route `product-docs` records
  // through the generator registered above.
  void server;
  console.log('Custom URL generator registered for namespace "product-docs".');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
