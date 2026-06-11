/**
 * @packageDocumentation
 * **@will-cppa/pinecone-read-only-mcp** — generic (core) programmatic entrypoint.
 *
 * Import from the package root for the generic MCP-Pinecone bridge only.
 * For the full Alliance tool surface, use `@will-cppa/pinecone-read-only-mcp/alliance`.
 */

export { setPineconeClient } from './server/client-context.js';
export { ServerContext, createServer, getDefaultServerContext } from './server/server-context.js';
export {
  validateMetadataFilter,
  validateMetadataFilterDetailed,
} from './server/metadata-filter.js';
export type { MetadataFilterValidationError } from './server/metadata-filter.js';
export { toolErrorSchema } from './server/tool-error.js';
export type { ToolError, ToolErrorCode } from './server/tool-error.js';
export {
  buildGuidedQueryExperimental,
  buildQueryExperimental,
  countResponseSchema,
  generateUrlsResponseSchema,
  guidedQueryResponseSchema,
  keywordSearchResponseSchema,
  listNamespacesResponseSchema,
  namespaceRouterResponseSchema,
  queryDocumentsResponseSchema,
  queryResponseSchema,
  queryResultRowSchema,
  suggestQueryParamsResponseSchema,
} from './server/response-schemas.js';
export type {
  CountResponse,
  GenerateUrlsResponse,
  GuidedQueryDecisionTrace,
  GuidedQueryResponse,
  KeywordSearchResponse,
  ListNamespacesSuccessResponse,
  NamespaceRouterResponse,
  QueryDocumentsResponse,
  QueryExperimental,
  SuggestQueryParamsResponse,
} from './server/response-schemas.js';
export { suggestQueryParams } from './server/query-suggestion.js';
export type { RecommendedTool, SuggestQueryParamsResult } from './server/query-suggestion.js';
export {
  registerUrlGenerator,
  unregisterUrlGenerator,
  generateUrlForNamespace,
  hasUrlGenerator,
} from './server/url-registry.js';
export type { UrlGenerationResult, UrlGenerator, UrlGeneratorFn } from './server/url-registry.js';
export { resolveConfig, trimOptional } from './config.js';
export type { ServerConfig, LogLevel, LogFormat, ConfigOverrides } from './config.js';
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
} from '../types.js';
export { setupCoreServer, teardownServer, type ServerHandle } from './setup.js';
