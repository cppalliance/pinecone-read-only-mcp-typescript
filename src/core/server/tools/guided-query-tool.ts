import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FAST_QUERY_FIELDS, MAX_TOP_K, MIN_TOP_K } from '../../../constants.js';
import { guidedRerankStatus } from '../../rerank-trace.js';
import { getPineconeClient } from '../client-context.js';
import { formatQueryResultRows } from '../format-query-result.js';
import { metadataFilterSchema, validateMetadataFilterDetailed } from '../metadata-filter.js';
import { rankNamespacesByQuery } from '../namespace-router.js';
import { getNamespacesWithCache } from '../namespaces-cache.js';
import { normalizeNamespace } from '../namespace-utils.js';
import { suggestQueryParams } from '../query-suggestion.js';
import type { ServerContext } from '../server-context.js';
import {
  buildGuidedQueryExperimental,
  buildQueryExperimental,
  guidedQueryResponseSchema,
  type GuidedQueryResponse,
  type QueryResponse,
} from '../response-schemas.js';
import { markSuggested } from '../suggestion-flow.js';
import {
  classifyToolCatchError,
  lifecycleToolError,
  logToolError,
  pineconeToolError,
  validationToolError,
} from '../tool-error.js';
import { jsonErrorResponse, validatedJsonResponse } from '../tool-response.js';

type GuidedToolName = 'count' | 'fast' | 'detailed' | 'full';

function resolveGuidedToolName(
  preferred: 'auto' | 'count' | 'fast' | 'detailed' | 'full',
  suggestion: { recommended_tool: GuidedToolName }
): GuidedToolName {
  if (preferred === 'auto') return suggestion.recommended_tool;
  if (preferred === 'count') return 'count';
  if (preferred === 'fast') return 'fast';
  if (preferred === 'detailed') return 'detailed';
  return 'full';
}

/**
 * Registers `guided_query` (routing + suggestion + execution in one call).
 * See "Retrieval tool decision matrix" in README.md for tool-selection guidance.
 */
export function registerGuidedQueryTool(server: McpServer, ctx?: ServerContext): void {
  server.registerTool(
    'guided_query',
    {
      description:
        'Combines namespace routing, suggestion, and query into a single call — no prerequisite tools needed. ' +
        'Single orchestrator: optional namespace_router logic -> executes count or hybrid query (fast / detailed / full presets). ' +
        'Returns experimental.decision_trace so behavior stays transparent and debuggable.',
      inputSchema: {
        user_query: z.string().describe('User question or intent.'),
        namespace: z
          .string()
          .optional()
          .describe(
            'Optional explicit namespace. If omitted, namespace_router logic will choose one.'
          ),
        metadata_filter: metadataFilterSchema
          .optional()
          .describe('Optional metadata filter to constrain results.'),
        top_k: z
          .number()
          .int()
          .min(MIN_TOP_K)
          .max(MAX_TOP_K)
          .default(10)
          .describe('Result count for hybrid query paths (1-100).'),
        preferred_tool: z
          .enum(['auto', 'count', 'fast', 'detailed', 'full'])
          .default('auto')
          .describe(
            'Optional override: count, fast (no rerank / light fields), detailed (reranked), full (explicit rerank + fields), or auto from suggestion.'
          ),
        enrich_urls: z
          .boolean()
          .default(true)
          .describe(
            'If true, enrich result URLs using the namespace URL generator when metadata.url is missing (if supported for that namespace).'
          ),
      },
    },
    async (params) => {
      try {
        if (ctx?.disposed) {
          return jsonErrorResponse(lifecycleToolError('ServerContext has been disposed'));
        }
        const {
          user_query,
          namespace: inputNamespace,
          metadata_filter,
          top_k,
          preferred_tool,
          enrich_urls,
        } = params;

        if (!user_query?.trim()) {
          return jsonErrorResponse(validationToolError('user_query cannot be empty', 'user_query'));
        }

        if (metadata_filter) {
          const err = validateMetadataFilterDetailed(metadata_filter);
          if (err) {
            return jsonErrorResponse(validationToolError(err.message, err.field));
          }
        }

        const queryText = user_query.trim();
        const { data: namespaces, cache_hit } = ctx
          ? await ctx.getNamespacesWithCache()
          : await getNamespacesWithCache();
        const ranked = rankNamespacesByQuery(queryText, namespaces, 3);

        let namespace: string | null = null;
        if (inputNamespace !== undefined) {
          namespace = normalizeNamespace(inputNamespace);
          if (!namespace) {
            return jsonErrorResponse(validationToolError('namespace cannot be empty', 'namespace'));
          }
        } else {
          const top = ranked[0]?.namespace;
          namespace = top ? normalizeNamespace(top) : null;
        }
        /*
         * ToolError mapping: empty index / no routable namespace is backend/data state
         * (PINECONE_ERROR, recoverable). Explicit namespace missing from cache is user/input
         * (VALIDATION, field namespace).
         */
        if (!namespace) {
          return jsonErrorResponse(
            pineconeToolError(
              'No namespace available. Please run list_namespaces and verify index data.',
              {
                recoverable: true,
                suggestion: 'Call list_namespaces to confirm the index has namespaces, then retry.',
              }
            )
          );
        }

        const ns = namespaces.find(
          (n) => n.namespace === namespace || normalizeNamespace(n.namespace) === namespace
        );
        const suggestion = suggestQueryParams(ns?.metadata ?? null, queryText);
        if (!suggestion.namespace_found) {
          return jsonErrorResponse(
            validationToolError(
              `Namespace "${namespace}" not found in cached namespaces. Call list_namespaces and retry.`,
              'namespace',
              {
                suggestion:
                  'Use a namespace name returned by list_namespaces, then call list_namespaces again if the cache is stale.',
              }
            )
          );
        }

        const selectedTool: GuidedToolName = resolveGuidedToolName(preferred_tool, suggestion);
        if (ctx) {
          ctx.markSuggested(namespace, {
            recommended_tool: selectedTool,
            suggested_fields: suggestion.suggested_fields,
            user_query: queryText,
          });
        } else {
          markSuggested(namespace, {
            recommended_tool: selectedTool,
            suggested_fields: suggestion.suggested_fields,
            user_query: queryText,
          });
        }

        const client = ctx ? ctx.getClient() : getPineconeClient();
        const enrichUrls = enrich_urls ?? true;
        const baseTrace = {
          cache_hit,
          input_namespace: inputNamespace ?? null,
          routed_namespace: ranked[0]?.namespace ?? null,
          selected_namespace: namespace,
          ranked_namespaces: ranked,
          suggested_fields: suggestion.suggested_fields,
          suggested_tool: suggestion.recommended_tool,
          selected_tool: selectedTool,
          explanation: suggestion.explanation,
          enrich_urls: enrichUrls,
        };

        if (selectedTool === 'count') {
          const { count, truncated } = await client.count({
            query: queryText,
            namespace,
            metadataFilter: metadata_filter,
          });
          const countResponse: GuidedQueryResponse = {
            status: 'success',
            ...buildGuidedQueryExperimental({
              ...baseTrace,
              rerank_status: 'skipped' as const,
            }),
            result: {
              tool: 'count',
              namespace,
              query: queryText,
              ...(metadata_filter !== undefined ? { metadata_filter } : {}),
              count,
              truncated,
            },
          };
          return validatedJsonResponse(guidedQueryResponseSchema, countResponse);
        }

        const isFast = selectedTool === 'fast';
        const mode: QueryResponse['mode'] =
          selectedTool === 'fast'
            ? 'query_fast'
            : selectedTool === 'detailed'
              ? 'query_detailed'
              : 'query';
        const fields =
          suggestion.suggested_fields.length > 0
            ? suggestion.suggested_fields
            : isFast
              ? [...FAST_QUERY_FIELDS]
              : undefined;
        const queryOutcome = await client.query({
          query: queryText,
          namespace,
          topK: top_k,
          metadataFilter: metadata_filter,
          useReranking: !isFast,
          fields: fields?.length ? fields : undefined,
        });
        const rerank_status = guidedRerankStatus(!isFast, queryOutcome);
        const formattedResults = formatQueryResultRows(queryOutcome.results, {
          namespace,
          enrichUrls: enrichUrls,
          ctx,
        });
        const result: QueryResponse = {
          status: 'success',
          mode,
          query: queryText,
          namespace,
          metadata_filter: metadata_filter,
          result_count: formattedResults.length,
          ...(fields?.length ? { fields } : {}),
          results: formattedResults,
          ...buildQueryExperimental(queryOutcome),
        };
        const queryResponse: GuidedQueryResponse = {
          status: 'success',
          ...buildGuidedQueryExperimental({
            ...baseTrace,
            rerank_status,
          }),
          result,
        };
        return validatedJsonResponse(guidedQueryResponseSchema, queryResponse);
      } catch (error) {
        logToolError('guided_query', error);
        return jsonErrorResponse(classifyToolCatchError(error, 'Failed to execute guided query'));
      }
    }
  );
}
