/**
 * @packageDocumentation
 * **@will-cppa/pinecone-read-only-mcp** — programmatic entrypoint for the
 * Pinecone read-only MCP server.
 *
 * Import from the package root:
 *
 * - {@link setupServer} — build an `McpServer` with all tools registered (at most once per process unless {@link teardownServer} runs).
 * - {@link teardownServer} — clear process-global server state so {@link setupServer} can run again (tests, re-embedding).
 * - {@link PineconeClient} — hybrid search, count, namespace listing, etc.
 * - {@link resolveConfig} — merge CLI-style overrides with `process.env`.
 * - {@link setPineconeClient} — inject a client instance before `setupServer()`.
 * - {@link registerUrlGenerator} / {@link unregisterUrlGenerator} — extend URL synthesis (`UrlGeneratorFn`).
 * - {@link toolErrorSchema} / {@link ToolError} — parse MCP tool failures (`isError: true` JSON bodies).
 * - Built-in `mailing` / `slack-Cpplang` URL generators are registered from {@link setupServer}
 *   via {@link registerBuiltinUrlGenerators}; call it yourself if you use the library without `setupServer`.
 *
 * The CLI binary (`pinecone-read-only-mcp`) lives in `dist/index.js` and is not
 * exported from this module.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SERVER_INSTRUCTIONS, SERVER_NAME, SERVER_VERSION } from './constants.js';
import type { ServerConfig } from './config.js';
import { setServerConfig, resetServerConfig } from './server/config-context.js';
import { clearPineconeClient } from './server/client-context.js';
import {
  registerBuiltinUrlGenerators,
  resetUrlGenerationRegistry,
} from './server/url-generation.js';
import { invalidateNamespacesCache } from './server/namespaces-cache.js';
import { resetSuggestionFlow } from './server/suggestion-flow.js';
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
/** Structured metadata filter validation (`field` dot-path); {@link validateMetadataFilter} remains a string-only wrapper. */
export { validateMetadataFilterDetailed } from './server/metadata-filter.js';
export type { MetadataFilterValidationError } from './server/metadata-filter.js';
/** Zod schema and types for MCP tool error JSON bodies (`isError: true`). */
export { toolErrorSchema } from './server/tool-error.js';
export type { ToolError, ToolErrorCode } from './server/tool-error.js';
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
  HybridQueryResult,
  HybridLegFailed,
} from './types.js';

let mcpServerInitialized = false;

/**
 * Reset process-global MCP server state (suggest-flow, namespace cache, active config,
 * Pinecone client handle, URL generator registry). Call before a second {@link setupServer}.
 */
export function teardownServer(): void {
  resetSuggestionFlow();
  invalidateNamespacesCache();
  resetServerConfig();
  clearPineconeClient();
  resetUrlGenerationRegistry();
  mcpServerInitialized = false;
}

/**
 * Create and configure the MCP server with all tools.
 *
 * Process-global state (one MCP client per Node process is assumed):
 * suggest-flow gate (`stateByNamespace`), namespaces cache, URL generator registry,
 * and {@link setServerConfig} — see README “Deployment model”. Multi-tenant HTTP
 * multiplexing can violate the suggest-flow guarantee unless you isolate by session.
 *
 * A second call in the same process throws unless {@link teardownServer} runs first.
 *
 * @returns the configured `McpServer` instance, ready to connect to a transport.
 */
export async function setupServer(config?: ServerConfig): Promise<McpServer> {
  if (mcpServerInitialized) {
    throw new Error(
      'setupServer() already called in this process. The MCP server uses process-global state (suggest-flow, namespace cache, URL generators, config). Call teardownServer() first if you need to re-initialize.'
    );
  }

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

  mcpServerInitialized = true;
  return server;
}
