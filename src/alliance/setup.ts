import { ALLIANCE_SERVER_INSTRUCTIONS } from '../constants.js';
import type { ServerConfig } from '../core/config.js';
import { resolveDefaultServerContext, type ServerContext } from '../core/server/server-context.js';
import { resolveAllianceConfig } from './config.js';
import { setupCoreServer, type ServerHandle, type SetupCoreServerOptions } from '../core/setup.js';
import { registerBuiltinUrlGenerators } from './url-builtins.js';
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
  if (typeof value !== 'object' || value === null || isServerConfig(value)) {
    return false;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (key !== 'config' && key !== 'context' && key !== 'instructions') {
      return false;
    }
  }
  return true;
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
  throw new TypeError('configOrOptions must be a ServerConfig or SetupAllianceServerOptions');
}

/**
 * Create and configure the MCP server with the full Alliance tool surface:
 * all core tools (including `guided_query`) plus `suggest_query_params` and built-in URL generators.
 *
 * When `config` is omitted, resolves env via {@link resolveAllianceConfig} (Alliance index/rerank defaults when unset).
 */
export async function setupAllianceServer(
  configOrOptions?: ServerConfig | SetupAllianceServerOptions,
  legacyOptions?: Pick<SetupAllianceServerOptions, 'instructions'>
): Promise<ServerHandle> {
  const opts = normalizeSetupAllianceArgs(configOrOptions, legacyOptions);
  const instructions = opts.instructions ?? ALLIANCE_SERVER_INSTRUCTIONS;

  let server: ServerHandle;
  let resolvedCtx: ServerContext;

  if (opts.context) {
    resolvedCtx = opts.context;
    const coreOpts: SetupCoreServerOptions = { context: resolvedCtx, instructions };
    if (opts.config !== undefined) {
      coreOpts.config = opts.config;
    }
    server = await setupCoreServer(coreOpts);
  } else {
    const config = opts.config ?? resolveAllianceConfig({});
    server = await setupCoreServer({
      config: opts.config ?? config,
      instructions,
    });
    resolvedCtx = resolveDefaultServerContext();
  }

  registerBuiltinUrlGenerators(resolvedCtx);
  registerSuggestQueryParamsTool(server, resolvedCtx);
  return server;
}
