/**
 * @packageDocumentation
 * **@will-cppa/pinecone-read-only-mcp** — programmatic entrypoint for the
 * Pinecone read-only MCP server.
 *
 * Import from the package root:
 *
 * - {@link setupServer} — build an `McpServer` with all tools registered.
 * - {@link PineconeClient} — hybrid search, count, namespace listing, etc.
 * - {@link resolveConfig} — merge CLI-style overrides with `process.env`.
 * - {@link setPineconeClient} — inject a client instance before `setupServer()`.
 * - {@link registerUrlGenerator} / {@link unregisterUrlGenerator} — extend URL synthesis (`UrlGeneratorFn`).
 * - Built-in `mailing` / `slack-Cpplang` URL generators are registered from {@link setupServer}
 *   via {@link registerBuiltinUrlGenerators}; call it yourself if you use the library without `setupServer`.
 *
 * The CLI binary (`pinecone-read-only-mcp`) lives in `dist/index.js` and is not
 * exported from this module.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SERVER_INSTRUCTIONS, SERVER_NAME, SERVER_VERSION } from './constants.js';
import type { ServerConfig } from './config.js';
import { setServerConfig } from './server/config-context.js';
import { registerBuiltinUrlGenerators } from './server/url-generation.js';
import { registerCountTool } from './server/tools/count-tool.js';
import { registerGuidedQueryTool } from './server/tools/guided-query-tool.js';
import { registerGenerateUrlsTool } from './server/tools/generate-urls-tool.js';
import { registerKeywordSearchTool } from './server/tools/keyword-search-tool.js';
import { registerListNamespacesTool } from './server/tools/list-namespaces-tool.js';
import { registerNamespaceRouterTool } from './server/tools/namespace-router-tool.js';
import { registerQueryDocumentsTool } from './server/tools/query-documents-tool.js';
import { registerQueryTool } from './server/tools/query-tool.js';
import { registerSuggestQueryParamsTool } from './server/tools/suggest-query-params-tool.js';

export { setPineconeClient } from './server/client-context.js';
/** Validate user-supplied Pinecone metadata filter objects before querying. */
export { validateMetadataFilter } from './server/metadata-filter.js';
/** Heuristic field + tool suggestions from a namespace schema + user query. */
export { suggestQueryParams } from './server/query-suggestion.js';
export type { RecommendedTool, SuggestQueryParamsResult } from './server/query-suggestion.js';
/** Register custom per-namespace URL synthesis used by `generate_urls` / row enrichment. */
export {
  registerUrlGenerator,
  unregisterUrlGenerator,
  generateUrlForNamespace,
  hasUrlGenerator,
  registerBuiltinUrlGenerators,
} from './server/url-generation.js';
export type {
  UrlGenerationResult,
  UrlGenerator,
  UrlGeneratorFn,
  RegisterBuiltinUrlGeneratorsOptions,
} from './server/url-generation.js';
/** Build {@link ServerConfig} from CLI overrides + environment variables. */
export { resolveConfig } from './config.js';
export type { ServerConfig, LogLevel, LogFormat, ConfigOverrides } from './config.js';
/** Pinecone SDK wrapper: hybrid query, keyword search, count, namespace metadata. */
export { PineconeClient } from './pinecone-client.js';
export type {
  PineconeClientConfig,
  QueryParams,
  CountParams,
  CountResult,
  KeywordSearchParams,
  SearchResult,
  PineconeMetadataValue,
  QueryResponse,
  QueryResultRowShape,
  KeywordIndexNamespacesResult,
} from './types.js';

/**
 * Create and configure the MCP server with all tools.
 *
 * Process-global state (one MCP client per Node process is assumed):
 * suggest-flow gate (`stateByNamespace`), namespaces cache, URL generator registry,
 * and {@link setServerConfig} — see README “Deployment model”. Multi-tenant HTTP
 * multiplexing can violate the suggest-flow guarantee unless you isolate by session.
 *
 * @returns the configured `McpServer` instance, ready to connect to a transport.
 */
export async function setupServer(config?: ServerConfig): Promise<McpServer> {
  if (config) {
    setServerConfig(config);
  }

  registerBuiltinUrlGenerators();

  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    }
  );

  registerListNamespacesTool(server);
  registerNamespaceRouterTool(server);
  registerSuggestQueryParamsTool(server);
  registerCountTool(server);
  registerQueryTool(server);
  registerKeywordSearchTool(server);
  registerQueryDocumentsTool(server);
  registerGuidedQueryTool(server);
  registerGenerateUrlsTool(server);

  return server;
}
