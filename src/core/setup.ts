import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SERVER_INSTRUCTIONS, SERVER_NAME, SERVER_VERSION } from '../constants.js';
import { warn as logWarn } from '../logger.js';
import type { ServerConfig } from './config.js';
import { clearPineconeClient } from './server/client-context.js';
import { setServerConfig, resetServerConfig } from './server/config-context.js';
import { invalidateNamespacesCache } from './server/namespaces-cache.js';
import { resetSuggestionFlow } from './server/suggestion-flow.js';
import { resetUrlGenerationRegistry } from './server/url-registry.js';
import { registerCountTool } from './server/tools/count-tool.js';
import { registerGenerateUrlsTool } from './server/tools/generate-urls-tool.js';
import { registerKeywordSearchTool } from './server/tools/keyword-search-tool.js';
import { registerListNamespacesTool } from './server/tools/list-namespaces-tool.js';
import { registerNamespaceRouterTool } from './server/tools/namespace-router-tool.js';
import { registerQueryDocumentsTool } from './server/tools/query-documents-tool.js';
import { registerQueryTool } from './server/tools/query-tool.js';

let mcpServerInitialized = false;

/**
 * Reset process-global MCP server state (suggest-flow, namespace cache, active config,
 * Pinecone client handle, URL generator registry). Call before a second {@link setupCoreServer}.
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
 * Create and configure the MCP server with generic (core) tools only.
 *
 * Does not register Alliance-specific tools (`suggest_query_params`, `guided_query`)
 * or built-in Boost/Slack URL generators. Use {@link setupAllianceServer} from
 * `@will-cppa/pinecone-read-only-mcp/alliance` for the full tool surface.
 */
export async function setupCoreServer(config?: ServerConfig): Promise<McpServer> {
  if (mcpServerInitialized) {
    throw new Error(
      'setupCoreServer() already called in this process. The MCP server uses process-global state (suggest-flow, namespace cache, URL generators, config). Call teardownServer() first if you need to re-initialize.'
    );
  }

  if (config) {
    setServerConfig(config);
    if (!config.rerankModel) {
      logWarn(
        'Reranking disabled: set PINECONE_RERANK_MODEL or pass rerankModel. ' +
          'Alliance deployments: use resolveAllianceConfig / setupAllianceServer for the default rerank model.'
      );
    }
  }

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
  registerCountTool(server);
  registerQueryTool(server);
  registerKeywordSearchTool(server);
  registerQueryDocumentsTool(server);
  registerGenerateUrlsTool(server);

  mcpServerInitialized = true;
  return server;
}
