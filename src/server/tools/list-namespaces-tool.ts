import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getNamespacesWithCache } from '../namespaces-cache.js';
import { getToolErrorMessage, logToolError } from '../tool-error.js';
import { jsonErrorResponse, jsonResponse } from '../tool-response.js';

/** Register the list_namespaces tool on the MCP server. */
export function registerListNamespacesTool(server: McpServer): void {
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
    async () => {
      try {
        const { data: namespacesInfo, cache_hit, expires_at } = await getNamespacesWithCache();
        const now = Date.now();
        const ttlSeconds = Math.max(0, Math.floor((expires_at - now) / 1000));

        const response = {
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

        return jsonResponse(response);
      } catch (error) {
        logToolError('list_namespaces', error);
        const response = {
          status: 'error',
          message: getToolErrorMessage(error, 'Failed to list namespaces'),
        };
        return jsonErrorResponse(response);
      }
    }
  );
}
