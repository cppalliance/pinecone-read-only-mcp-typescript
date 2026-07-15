import { ALLIANCE_SERVER_INSTRUCTIONS } from '../constants.js';
import type { AllianceServerConfig, ServerConfigBase } from '../core/config.js';
import { getServerConfigLineage } from '../core/config.js';
import { createServer, type AllianceServerContext } from '../core/server/server-context.js';
import { resolveAllianceConfig } from './config.js';
import { setupCoreServerOnContext, type ServerHandle } from '../core/setup.js';
import { registerBuiltinUrlGenerators } from './url-builtins.js';

/**
 * Options for {@link setupAllianceServer}.
 */
export type SetupAllianceServerOptions = {
  config?: AllianceServerConfig;
  context?: AllianceServerContext;
  /** MCP server instructions; defaults to {@link ALLIANCE_SERVER_INSTRUCTIONS}. */
  instructions?: string;
};

function isServerConfig(value: unknown): value is AllianceServerConfig {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const base = value as ServerConfigBase;
  if (typeof base.apiKey !== 'string' || typeof base.indexName !== 'string') {
    return false;
  }
  return getServerConfigLineage(base) === 'alliance';
}

function assertAllianceServerConfig(config: ServerConfigBase): AllianceServerConfig {
  if (getServerConfigLineage(config) !== 'alliance') {
    throw new TypeError(
      'Expected AllianceServerConfig. Use setupCoreServer for core-branded config.'
    );
  }
  return config as AllianceServerConfig;
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
  configOrOptions?: AllianceServerConfig | SetupAllianceServerOptions,
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
  throw new TypeError(
    'configOrOptions must be an AllianceServerConfig or SetupAllianceServerOptions'
  );
}

/**
 * Create and configure the MCP server with the full Alliance tool surface:
 * all core tools (including `guided_query`) plus `suggest_query_params` and built-in URL generators.
 *
 * When `config` is omitted, resolves env via {@link resolveAllianceConfig} (Alliance index/rerank defaults when unset).
 */
export async function setupAllianceServer(
  configOrOptions?: AllianceServerConfig | SetupAllianceServerOptions,
  legacyOptions?: Pick<SetupAllianceServerOptions, 'instructions'>
): Promise<ServerHandle> {
  const opts = normalizeSetupAllianceArgs(configOrOptions, legacyOptions);
  const instructions = opts.instructions ?? ALLIANCE_SERVER_INSTRUCTIONS;

  if (opts.config) {
    assertAllianceServerConfig(opts.config);
  }

  let server: ServerHandle;
  let resolvedCtx: AllianceServerContext;

  if (opts.context) {
    resolvedCtx = opts.context;
    if (opts.config !== undefined) {
      if (resolvedCtx.hasInjectedClient()) {
        throw new Error(
          'Passing both config and context clears an injected Pinecone client. ' +
            'Omit config when reusing a pre-configured context, or call setClient() after setup.'
        );
      }
      resolvedCtx.setConfig(opts.config);
    } else if (!resolvedCtx.hasConfig()) {
      resolvedCtx.setConfig(resolveAllianceConfig({}));
    } else {
      const stored = resolvedCtx.getConfigIfSet();
      if (stored) {
        assertAllianceServerConfig(stored);
      }
    }
    server = await setupCoreServerOnContext(resolvedCtx, instructions);
  } else {
    const config = opts.config ?? resolveAllianceConfig({});
    const ctx = createServer(config);
    server = await setupCoreServerOnContext(ctx, instructions);
    resolvedCtx = ctx;
  }

  registerBuiltinUrlGenerators(resolvedCtx);
  return server;
}
