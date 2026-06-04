import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getNamespacesWithCache } from '../namespaces-cache.js';
import { rankNamespacesByQuery } from '../namespace-router.js';
import type { ServerContext } from '../server-context.js';
import { classifyToolCatchError, logToolError, validationToolError } from '../tool-error.js';
import { jsonErrorResponse, jsonResponse } from '../tool-response.js';

/** Register the namespace_router tool on the MCP server. */
export function registerNamespaceRouterTool(server: McpServer, ctx?: ServerContext): void {
  server.registerTool(
    'namespace_router',
    {
      description:
        'Suggest likely namespace(s) for a user query using namespace names, metadata fields, and keyword heuristics. ' +
        'Use before suggest_query_params when namespace is unclear.',
      inputSchema: {
        user_query: z
          .string()
          .describe('User question/intent used to infer relevant namespace(s).'),
        top_n: z
          .number()
          .int()
          .min(1)
          .max(5)
          .default(3)
          .describe('Maximum number of suggested namespaces (1-5).'),
      },
    },
    async (params) => {
      try {
        const { user_query, top_n } = params;
        if (!user_query?.trim()) {
          return jsonErrorResponse(validationToolError('user_query cannot be empty', 'user_query'));
        }
        const { data, cache_hit } = ctx
          ? await ctx.getNamespacesWithCache()
          : await getNamespacesWithCache();
        const ranked = rankNamespacesByQuery(user_query.trim(), data, top_n);

        const response = {
          status: 'success' as const,
          cache_hit,
          user_query: user_query.trim(),
          suggestions: ranked,
          recommended_namespace: ranked[0]?.namespace ?? null,
        };
        return jsonResponse(response);
      } catch (error) {
        logToolError('namespace_router', error);
        return jsonErrorResponse(classifyToolCatchError(error, 'Failed to route namespace'));
      }
    }
  );
}
