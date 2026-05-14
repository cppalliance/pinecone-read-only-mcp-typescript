import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getNamespacesWithCache } from '../namespaces-cache.js';
import { suggestQueryParams } from '../query-suggestion.js';
import { markSuggested } from '../suggestion-flow.js';
import { classifyToolCatchError, logToolError, validationToolError } from '../tool-error.js';
import { jsonErrorResponse, jsonResponse } from '../tool-response.js';

/** Register the suggest_query_params tool on the MCP server. */
export function registerSuggestQueryParamsTool(server: McpServer): void {
  server.registerTool(
    'suggest_query_params',
    {
      description:
        "Suggest which fields to request and whether to use the count tool, based on the namespace schema (from list_namespaces) and the user's natural language query. " +
        'Call list_namespaces first to get available namespaces and metadata fields. Then call this tool with the target namespace and the user query; ' +
        'it returns suggested_fields (only fields that exist in that namespace), use_count_tool (true if the query is a count question), recommended_tool (count | fast | detailed | full — same vocabulary as the query tool preset), and an explanation. ' +
        'This step is mandatory before query/count tools; use the returned suggested_fields in query tools to reduce payload and cost.',
      inputSchema: {
        namespace: z
          .string()
          .describe(
            'Namespace to query. Must match a name from list_namespaces so the tool can look up available metadata fields.'
          ),
        user_query: z
          .string()
          .describe(
            'The user\'s natural language question or intent (e.g. "list documents by author X with titles and links", "how many records match Y?", "what do the docs say about Z?").'
          ),
      },
    },
    async (params) => {
      try {
        const { namespace, user_query } = params;
        if (!user_query?.trim()) {
          return jsonErrorResponse(
            validationToolError('user_query cannot be empty', 'user_query')
          );
        }
        const { data: namespacesInfo, cache_hit } = await getNamespacesWithCache();
        const ns = namespacesInfo.find((n) => n.namespace === namespace);
        const metadataFields = ns?.metadata ?? null;
        const result = suggestQueryParams(metadataFields, user_query.trim());
        if (result.namespace_found) {
          markSuggested(namespace, {
            recommended_tool: result.recommended_tool,
            suggested_fields: result.suggested_fields,
            user_query: user_query.trim(),
          });
        }
        const response = {
          ...result,
          status: 'success' as const,
          cache_hit,
        };
        return jsonResponse(response);
      } catch (error) {
        logToolError('suggest_query_params', error);
        return jsonErrorResponse(
          classifyToolCatchError(error, 'Failed to suggest query params')
        );
      }
    }
  );
}
