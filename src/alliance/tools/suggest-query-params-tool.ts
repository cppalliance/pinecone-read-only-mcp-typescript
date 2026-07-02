import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { normalizeNamespace } from '../../core/server/namespace-utils.js';
import { getNamespacesWithCache } from '../../core/server/namespaces-cache.js';
import { suggestQueryParams } from '../../core/server/query-suggestion.js';
import type { ServerContext } from '../../core/server/server-context.js';
import { markSuggested } from '../../core/server/suggestion-flow.js';
import {
  optionalSourceField,
  rejectSourceWithoutContext,
  resolveSourceForTool,
  sourceParamSchema,
  sourceValidationError,
} from '../../core/server/source-tool-utils.js';
import {
  classifyToolCatchError,
  lifecycleToolError,
  logToolError,
  validationToolError,
} from '../../core/server/tool-error.js';
import {
  suggestQueryParamsResponseSchema,
  type SuggestQueryParamsResponse,
} from '../../core/server/response-schemas.js';
import { jsonErrorResponse, validatedJsonResponse } from '../../core/server/tool-response.js';

/** Register the suggest_query_params tool on the MCP server. */
export function registerSuggestQueryParamsTool(server: McpServer, ctx?: ServerContext): void {
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
        source: sourceParamSchema,
      },
    },
    async (params) => {
      try {
        if (ctx?.disposed) {
          return jsonErrorResponse(lifecycleToolError('ServerContext has been disposed'));
        }
        const { namespace, user_query, source } = params;
        if (!user_query?.trim()) {
          return jsonErrorResponse(validationToolError('user_query cannot be empty', 'user_query'));
        }
        const nsNorm = normalizeNamespace(namespace);
        if (!nsNorm) {
          return jsonErrorResponse(
            validationToolError('namespace cannot be empty', 'namespace', {
              suggestion: 'Use a namespace name from list_namespaces (trimmed).',
            })
          );
        }

        const sourceError = rejectSourceWithoutContext(source, ctx);
        if (sourceError) {
          return jsonErrorResponse(sourceError);
        }

        let activeCtx = ctx;
        let activeSource: string | undefined;
        if (ctx?.isMultiSource()) {
          const resolved = await resolveSourceForTool(ctx, source, nsNorm);
          if (!resolved.ok) {
            return jsonErrorResponse(sourceValidationError(resolved.code, resolved.message));
          }
          activeCtx = resolved.ctx;
          activeSource = resolved.source;
        }

        const { data: namespacesInfo, cache_hit } = activeCtx
          ? await activeCtx.getNamespacesWithCache(activeSource)
          : await getNamespacesWithCache();
        const ns = namespacesInfo.find(
          (n) => n.namespace === nsNorm || normalizeNamespace(n.namespace) === nsNorm
        );
        const metadataFields = ns?.metadata ?? null;
        const result = suggestQueryParams(metadataFields, user_query.trim());
        if (result.namespace_found) {
          if (activeCtx) {
            activeCtx.markSuggested(
              nsNorm,
              {
                recommended_tool: result.recommended_tool,
                suggested_fields: result.suggested_fields,
                user_query: user_query.trim(),
              },
              activeCtx.isMultiSource() ? activeSource : undefined
            );
          } else {
            markSuggested(nsNorm, {
              recommended_tool: result.recommended_tool,
              suggested_fields: result.suggested_fields,
              user_query: user_query.trim(),
            });
          }
        }
        const response: SuggestQueryParamsResponse = {
          ...result,
          status: 'success',
          cache_hit,
          ...optionalSourceField(activeCtx, activeSource),
        };
        return validatedJsonResponse(suggestQueryParamsResponseSchema, response);
      } catch (error) {
        logToolError('suggest_query_params', error);
        return jsonErrorResponse(classifyToolCatchError(error, 'Failed to suggest query params'));
      }
    }
  );
}
