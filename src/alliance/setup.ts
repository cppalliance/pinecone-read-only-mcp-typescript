import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ALLIANCE_SERVER_INSTRUCTIONS } from '../constants.js';
import type { ServerConfig } from '../core/config.js';
import { resolveAllianceConfig } from './config.js';
import { setupCoreServer } from '../core/setup.js';
import { registerBuiltinUrlGenerators } from './url-builtins.js';
import { registerGuidedQueryTool } from './tools/guided-query-tool.js';
import { registerSuggestQueryParamsTool } from './tools/suggest-query-params-tool.js';

/**
 * Create and configure the MCP server with the full Alliance tool surface:
 * all core tools plus `suggest_query_params`, `guided_query`, and built-in URL generators.
 *
 * When `config` is omitted, resolves env via {@link resolveAllianceConfig} (Alliance index/rerank defaults when unset).
 */
export async function setupAllianceServer(config?: ServerConfig): Promise<McpServer> {
  const server = await setupCoreServer(config ?? resolveAllianceConfig({}), {
    instructions: ALLIANCE_SERVER_INSTRUCTIONS,
  });
  registerBuiltinUrlGenerators();
  registerSuggestQueryParamsTool(server);
  registerGuidedQueryTool(server);
  return server;
}
