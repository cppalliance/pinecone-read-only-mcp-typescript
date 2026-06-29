/**
 * @packageDocumentation
 * **@will-cppa/pinecone-read-only-mcp** — generic (core) programmatic entrypoint.
 *
 * Import from the package root for the generic MCP-Pinecone bridge only.
 * For the full Alliance tool surface, use `@will-cppa/pinecone-read-only-mcp/alliance`.
 */

export { setPineconeClient } from './server/client-context.js';
export {
  ServerContext,
  createServer,
  createIsolatedContext,
  createUnconfiguredAllianceContext,
  getDefaultServerContext,
} from './server/server-context.js';
export type {
  ServerContextComposition,
  NamespaceCacheSeed,
  SuggestionFlowSeedEntry,
  CoreServerContext,
  AllianceServerContext,
} from './server/server-context.js';
export {
  validateMetadataFilter,
  validateMetadataFilterDetailed,
} from './server/metadata-filter.js';
export type { MetadataFilterValidationError } from './server/metadata-filter.js';
export { toolErrorSchema } from './server/tool-error.js';
export type { ToolError, ToolErrorCode } from './server/tool-error.js';
export {
  countResponseSchema,
  generateUrlsResponseSchema,
  guidedQueryResponseSchema,
  keywordSearchResponseSchema,
  keywordSearchSuccessResponseSchema,
  listNamespacesResponseSchema,
  namespaceRouterResponseSchema,
  queryDocumentsResponseSchema,
  queryResponseSchema,
  querySuccessResponseSchema,
  queryResultRowSchema,
  suggestQueryParamsResponseSchema,
} from './server/response-schemas.js';
export type {
  CountResponse,
  GenerateUrlsResponse,
  GuidedQueryDecisionTrace,
  GuidedQueryResponse,
  KeywordSearchResponse,
  KeywordSearchSuccessResponse,
  ListNamespacesSuccessResponse,
  NamespaceRouterResponse,
  QueryDocumentsResponse,
  QueryExperimental,
  QuerySuccessResponse,
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
export type { SourceDefinition } from './server/source-config.js';
export { SourceRegistry, buildSourceRegistry } from './server/source-registry.js';
export type {
  AggregatedCacheResult,
  PerSourceCacheResult,
} from './server/source-registry.js';
export type {
  ServerConfig,
  ServerConfigBase,
  CoreServerConfig,
  AnyServerConfig,
  LogLevel,
  LogFormat,
  ConfigOverrides,
} from './config.js';
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
export {
  setupCoreServer,
  teardownServer,
  type ServerHandle,
  type SetupCoreServerOptions,
} from './setup.js';
