import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServerConfig } from '../core/config.js';
import { resolveConfig } from '../core/config.js';
import { setupCoreServer } from '../core/setup.js';
import { applyAllianceRerankDefault } from './config.js';
import { registerBuiltinUrlGenerators } from './url-builtins.js';
import { registerGuidedQueryTool } from './tools/guided-query-tool.js';
import { registerSuggestQueryParamsTool } from './tools/suggest-query-params-tool.js';

/**
 * Create and configure the MCP server with the full Alliance tool surface:
 * all core tools plus `suggest_query_params`, `guided_query`, and built-in URL generators.
 *
 * When `config` is omitted, resolves env via {@link resolveConfig} then applies the
 * Alliance rerank default. When `config` is passed, applies the default if `rerankModel` is unset.
 */
export async function setupAllianceServer(config?: ServerConfig): Promise<McpServer> {
  const allianceConfig = applyAllianceRerankDefault(config ?? resolveConfig({}));
  const server = await setupCoreServer(allianceConfig);
  registerBuiltinUrlGenerators();
  registerSuggestQueryParamsTool(server);
  registerGuidedQueryTool(server);
  return server;
}
