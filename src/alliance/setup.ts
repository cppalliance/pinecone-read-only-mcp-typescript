import { ALLIANCE_SERVER_INSTRUCTIONS } from '../constants.js';
import type { ServerConfig } from '../core/config.js';
import { getDefaultServerContext, type ServerContext } from '../core/server/server-context.js';
import { resolveAllianceConfig } from './config.js';
import { setupCoreServer, type ServerHandle } from '../core/setup.js';
import { registerBuiltinUrlGenerators } from './url-builtins.js';
import { registerGuidedQueryTool } from './tools/guided-query-tool.js';
import { registerSuggestQueryParamsTool } from './tools/suggest-query-params-tool.js';

/**
 * Options for {@link setupAllianceServer}.
 */
export type SetupAllianceServerOptions = {
  config?: ServerConfig;
  context?: ServerContext;
  /** MCP server instructions; defaults to {@link ALLIANCE_SERVER_INSTRUCTIONS}. */
  instructions?: string;
};

function isServerConfig(value: unknown): value is ServerConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ServerConfig).apiKey === 'string' &&
    typeof (value as ServerConfig).indexName === 'string'
  );
}

function isSetupAllianceServerOptions(value: unknown): value is SetupAllianceServerOptions {
  return typeof value === 'object' && value !== null && !isServerConfig(value);
}

function normalizeSetupAllianceArgs(
  configOrOptions?: ServerConfig | SetupAllianceServerOptions,
  legacyOptions?: Pick<SetupAllianceServerOptions, 'instructions'>
): SetupAllianceServerOptions {
  if (configOrOptions === undefined) {
    return legacyOptions ?? {};
  }
  if (isServerConfig(configOrOptions)) {
    return { config: configOrOptions, ...legacyOptions };
  }
  if (isSetupAllianceServerOptions(configOrOptions)) {
    return { ...configOrOptions, ...legacyOptions };
  }
  return legacyOptions ?? {};
}

/**
 * Create and configure the MCP server with the full Alliance tool surface:
 * all core tools plus `suggest_query_params`, `guided_query`, and built-in URL generators.
 *
 * When `config` is omitted, resolves env via {@link resolveAllianceConfig} (Alliance index/rerank defaults when unset).
 */
export async function setupAllianceServer(
  configOrOptions?: ServerConfig | SetupAllianceServerOptions,
  legacyOptions?: Pick<SetupAllianceServerOptions, 'instructions'>
): Promise<ServerHandle> {
  const opts = normalizeSetupAllianceArgs(configOrOptions, legacyOptions);
  const instructions = opts.instructions ?? ALLIANCE_SERVER_INSTRUCTIONS;
  const config = opts.config ?? resolveAllianceConfig({});

  let server: ServerHandle;
  let resolvedCtx: ServerContext;

  if (opts.context) {
    resolvedCtx = opts.context;
    server = await setupCoreServer({
      config: opts.config ?? config,
      context: resolvedCtx,
      instructions,
    });
  } else {
    server = await setupCoreServer({
      config: opts.config ?? config,
      instructions,
    });
    resolvedCtx = getDefaultServerContext();
  }

  registerBuiltinUrlGenerators(resolvedCtx);
  registerSuggestQueryParamsTool(server, resolvedCtx);
  registerGuidedQueryTool(server, resolvedCtx);
  return server;
}
