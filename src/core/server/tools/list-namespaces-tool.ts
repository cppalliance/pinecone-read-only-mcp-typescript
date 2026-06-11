import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getNamespacesWithCache } from '../namespaces-cache.js';
import type { ServerContext } from '../server-context.js';
import { classifyToolCatchError, lifecycleToolError, logToolError } from '../tool-error.js';
import {
  listNamespacesResponseSchema,
  type ListNamespacesSuccessResponse,
} from '../response-schemas.js';
import { jsonErrorResponse, validatedJsonResponse } from '../tool-response.js';

async function executeListNamespaces(ctx?: ServerContext) {
  try {
    if (ctx?.disposed) {
      return jsonErrorResponse(lifecycleToolError('ServerContext has been disposed'));
    }
    const {
      data: namespacesInfo,
      cache_hit,
      expires_at,
    } = ctx ? await ctx.getNamespacesWithCache() : await getNamespacesWithCache();
    const now = Date.now();
    const ttlSeconds = Math.max(0, Math.floor((expires_at - now) / 1000));

    const response: ListNamespacesSuccessResponse = {
      status: 'success',
      cache_hit,
      cache_ttl_seconds: ttlSeconds,
      expires_at_iso: new Date(expires_at).toISOString(),
      count: namespacesInfo.length,
      namespaces: namespacesInfo.map((ns) => ({
        name: ns.namespace,
        record_count: ns.recordCount,
        metadata_fields: ns.metadata,
      })),
    };

    return validatedJsonResponse(listNamespacesResponseSchema, response);
  } catch (error) {
    logToolError('list_namespaces', error);
    return jsonErrorResponse(classifyToolCatchError(error, 'Failed to list namespaces'));
  }
}

/** Register the list_namespaces tool on the MCP server. */
export function registerListNamespacesTool(server: McpServer, ctx?: ServerContext): void {
  server.registerTool(
    'list_namespaces',
    {
      description:
        'List all available namespaces in the Pinecone index with their metadata fields and record counts. ' +
        'Returns detailed information about each namespace including available metadata fields that can be used for filtering in queries. ' +
        'Use this tool first to discover which namespaces exist and what metadata fields are available for filtering. ' +
        'Results are cached in-memory for 30 minutes for better performance.',
      inputSchema: {},
    },
    async () => executeListNamespaces(ctx)
  );
}
