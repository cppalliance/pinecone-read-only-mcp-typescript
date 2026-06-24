import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CORE_SERVER_INSTRUCTIONS, SERVER_NAME, SERVER_VERSION } from '../constants.js';
import type { CoreServerConfig, ServerConfigBase } from './config.js';
import {
  createServer,
  installExplicitServerContext,
  peekDefaultServerContext,
  resolveDefaultServerContext,
  teardownDefaultServerContext,
  type ServerContext,
} from './server/server-context.js';
import { registerCountTool } from './server/tools/count-tool.js';
import { registerGenerateUrlsTool } from './server/tools/generate-urls-tool.js';
import { registerGuidedQueryTool } from './server/tools/guided-query-tool.js';
import { registerKeywordSearchTool } from './server/tools/keyword-search-tool.js';
import { registerListNamespacesTool } from './server/tools/list-namespaces-tool.js';
import { registerNamespaceRouterTool } from './server/tools/namespace-router-tool.js';
import { registerQueryDocumentsTool } from './server/tools/query-documents-tool.js';
import { registerQueryTool } from './server/tools/query-tool.js';

/** MCP server handle with automatic teardown via `await using`. */
export type ServerHandle = McpServer & AsyncDisposable;

/**
 * Reset process-global MCP server state (suggest-flow, namespace cache, active config,
 * Pinecone client handle, URL generator registry). Call before a second legacy
 * {@link setupCoreServer} that reuses the process-default context.
 */
export function teardownServer(): void {
  teardownDefaultServerContext();
}

/**
 * Create and configure the MCP server with generic (core) tools.
 *
 * Registers eight core tools including `guided_query`. Does not register Alliance-specific
 * `suggest_query_params` or built-in Boost/Slack URL generators. Use
 * {@link setupAllianceServer} from `@will-cppa/pinecone-read-only-mcp/alliance` for the
 * full Alliance tool surface (suggest-flow gate on by default).
 */
export type SetupCoreServerOptions = {
  config?: CoreServerConfig;
  context?: ServerContext;
  /** MCP server instructions; defaults to {@link CORE_SERVER_INSTRUCTIONS}. */
  instructions?: string;
};

function isServerConfig(value: unknown): value is CoreServerConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ServerConfigBase).apiKey === 'string' &&
    typeof (value as ServerConfigBase).indexName === 'string'
  );
}

function isSetupCoreServerOptions(value: unknown): value is SetupCoreServerOptions {
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

function normalizeSetupCoreServerArgs(
  configOrOptions?: CoreServerConfig | SetupCoreServerOptions,
  legacyOptions?: Pick<SetupCoreServerOptions, 'instructions'>
): SetupCoreServerOptions {
  if (configOrOptions === undefined) {
    return legacyOptions ?? {};
  }
  if (isServerConfig(configOrOptions)) {
    return { config: configOrOptions, ...legacyOptions };
  }
  if (isSetupCoreServerOptions(configOrOptions)) {
    return { ...configOrOptions, ...legacyOptions };
  }
  throw new TypeError('configOrOptions must be a CoreServerConfig or SetupCoreServerOptions');
}

function resolveSetupContext(opts: SetupCoreServerOptions): ServerContext {
  if (opts.context) {
    if (opts.config) {
      if (opts.context.hasInjectedClient()) {
        throw new Error(
          'Passing both config and context clears an injected Pinecone client. ' +
            'Omit config when reusing a pre-configured context, or call setClient() after setup.'
        );
      }
      opts.context.setConfig(opts.config);
    }
    installExplicitServerContext(opts.context);
    return opts.context;
  }

  if (opts.config) {
    const existingDefault = peekDefaultServerContext();
    if (existingDefault?.hasToolsRegistered()) {
      throw new Error(
        'setupCoreServer() already called in this process. Call teardownServer() first if you need to re-initialize.'
      );
    }

    const defaultCtx = resolveDefaultServerContext();
    const existingClient = defaultCtx.hasInjectedClient() ? defaultCtx.getClientIfSet() : undefined;
    const ctx = createServer(opts.config);
    if (existingClient) {
      ctx.setClient(existingClient);
    }
    return ctx;
  }

  return resolveDefaultServerContext();
}

export async function setupCoreServer(
  configOrOptions?: CoreServerConfig | SetupCoreServerOptions,
  legacyOptions?: Pick<SetupCoreServerOptions, 'instructions'>
): Promise<ServerHandle> {
  const opts = normalizeSetupCoreServerArgs(configOrOptions, legacyOptions);
  const ctx = resolveSetupContext(opts);
  ctx.assertCanRegisterTools();

  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      instructions: opts.instructions ?? CORE_SERVER_INSTRUCTIONS,
    }
  );

  registerListNamespacesTool(server, ctx);
  registerNamespaceRouterTool(server, ctx);
  registerCountTool(server, ctx);
  registerQueryTool(server, ctx);
  registerKeywordSearchTool(server, ctx);
  registerQueryDocumentsTool(server, ctx);
  registerGenerateUrlsTool(server, ctx);
  registerGuidedQueryTool(server, ctx);

  ctx.markToolsRegistered();

  const handle = server as ServerHandle;
  handle[Symbol.asyncDispose] = async () => {
    await ctx[Symbol.asyncDispose]();
  };
  return handle;
}
