import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getNamespacesWithCache } from '../namespaces-cache.js';
import { rankNamespacesByQuery } from '../namespace-router.js';
import type { ServerContext } from '../server-context.js';
import { sourceParamSchema } from '../source-tool-utils.js';
import {
  classifyToolCatchError,
  lifecycleToolError,
  logToolError,
  logToolInvocation,
  validationToolError,
} from '../tool-error.js';
import {
  namespaceRouterResponseSchema,
  type NamespaceRouterResponse,
} from '../response-schemas.js';
import { jsonErrorResponse, validatedJsonResponse } from '../tool-response.js';

/** Register the namespace_router tool on the MCP server. */
export function registerNamespaceRouterTool(server: McpServer, ctx?: ServerContext): void {
  server.registerTool(
    'namespace_router',
    {
      description:
        'Suggest likely namespace(s) for a user query using namespace names, metadata fields, and keyword heuristics. ' +
        'Use before suggest_query_params when namespace is unclear. ' +
        'In multi-source mode, ranks across all sources unless source is set.',
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
        source: sourceParamSchema,
      },
    },
    async (params) => {
      try {
        if (ctx?.disposed) {
          return jsonErrorResponse(lifecycleToolError('ServerContext has been disposed'));
        }
        const { user_query, top_n, source } = params;
        if (!user_query?.trim()) {
          return jsonErrorResponse(validationToolError('user_query cannot be empty', 'user_query'));
        }
        if (source) {
          logToolInvocation('namespace_router', source);
        }
        const { data, cache_hit } = ctx
          ? await ctx.getNamespacesWithCache(source)
          : await getNamespacesWithCache();
        const ranked = rankNamespacesByQuery(user_query.trim(), data, top_n);
        const top = ranked[0];

        const response: NamespaceRouterResponse = {
          status: 'success',
          cache_hit,
          user_query: user_query.trim(),
          suggestions: ranked,
          recommended_namespace: top?.namespace ?? null,
          ...(top?.source !== undefined ? { recommended_source: top.source } : {}),
        };
        return validatedJsonResponse(namespaceRouterResponseSchema, response);
      } catch (error) {
        logToolError('namespace_router', error);
        return jsonErrorResponse(classifyToolCatchError(error, 'Failed to route namespace'));
      }
    }
  );
}
