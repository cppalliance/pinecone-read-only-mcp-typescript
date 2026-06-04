import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CORE_SERVER_INSTRUCTIONS, SERVER_NAME, SERVER_VERSION } from '../constants.js';
import type { ServerConfig } from './config.js';
import { PineconeClient } from './pinecone-client.js';
import {
  createServer,
  getDefaultServerContext,
  teardownDefaultServerContext,
  type ServerContext,
} from './server/server-context.js';
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
  teardownDefaultServerContext();
  mcpServerInitialized = false;
}

/**
 * Create and configure the MCP server with generic (core) tools only.
 *
 * Does not register Alliance-specific tools (`suggest_query_params`, `guided_query`)
 * or built-in Boost/Slack URL generators. Use {@link setupAllianceServer} from
 * `@will-cppa/pinecone-read-only-mcp/alliance` for the full tool surface.
 */
export type SetupCoreServerOptions = {
  /** MCP server instructions; defaults to {@link CORE_SERVER_INSTRUCTIONS}. */
  instructions?: string;
};

export async function setupCoreServer(
  config?: ServerConfig,
  options?: SetupCoreServerOptions
): Promise<McpServer> {
  if (mcpServerInitialized) {
    throw new Error(
      'setupCoreServer() already called in this process. The MCP server uses process-global state (suggest-flow, namespace cache, URL generators, config). Call teardownServer() first if you need to re-initialize.'
    );
  }

  let ctx: ServerContext;
  if (config) {
    let existingClient: PineconeClient | undefined;
    try {
      existingClient = getDefaultServerContext().getClientIfSet();
    } catch {
      existingClient = undefined;
    }
    ctx = createServer(config);
    if (existingClient) {
      ctx.setClient(existingClient);
    }
  } else {
    ctx = getDefaultServerContext();
  }

  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions: options?.instructions ?? CORE_SERVER_INSTRUCTIONS,
    }
  );

  registerListNamespacesTool(server, ctx);
  registerNamespaceRouterTool(server);
  registerCountTool(server, ctx);
  registerQueryTool(server, ctx);
  registerKeywordSearchTool(server);
  registerQueryDocumentsTool(server);
  registerGenerateUrlsTool(server);

  mcpServerInitialized = true;
  return server;
}
