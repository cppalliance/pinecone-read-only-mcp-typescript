import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CORE_SERVER_INSTRUCTIONS, SERVER_NAME, SERVER_VERSION } from '../constants.js';
import type { ServerConfig } from './config.js';
import { PineconeClient } from './pinecone-client.js';
import {
  createServer,
  getDefaultServerContext,
  peekDefaultServerContext,
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
 * Create and configure the MCP server with generic (core) tools only.
 *
 * Does not register Alliance-specific tools (`suggest_query_params`, `guided_query`)
 * or built-in Boost/Slack URL generators. Use {@link setupAllianceServer} from
 * `@will-cppa/pinecone-read-only-mcp/alliance` for the full tool surface.
 */
export type SetupCoreServerOptions = {
  config?: ServerConfig;
  context?: ServerContext;
  /** MCP server instructions; defaults to {@link CORE_SERVER_INSTRUCTIONS}. */
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
  configOrOptions?: ServerConfig | SetupCoreServerOptions,
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
  throw new TypeError('configOrOptions must be a ServerConfig or SetupCoreServerOptions');
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
    return opts.context;
  }

  if (opts.config) {
    const existingDefault = peekDefaultServerContext();
    if (existingDefault?.hasToolsRegistered()) {
      throw new Error(
        'setupCoreServer() already called in this process. Call teardownServer() first if you need to re-initialize.'
      );
    }

    const defaultCtx = getDefaultServerContext();
    const existingClient = defaultCtx.hasInjectedClient() ? defaultCtx.getClientIfSet() : undefined;
    const ctx = createServer(opts.config);
    if (existingClient) {
      ctx.setClient(existingClient);
    }
    return ctx;
  }

  return getDefaultServerContext();
}

export async function setupCoreServer(
  configOrOptions?: ServerConfig | SetupCoreServerOptions,
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

  ctx.markToolsRegistered();

  const handle = server as ServerHandle;
  handle[Symbol.asyncDispose] = async () => {
    await ctx[Symbol.asyncDispose]();
  };
  return handle;
}
