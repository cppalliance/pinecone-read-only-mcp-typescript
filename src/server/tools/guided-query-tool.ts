import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FAST_QUERY_FIELDS, MAX_TOP_K, MIN_TOP_K } from '../../constants.js';
import type { QueryResponse } from '../../types.js';
import { getPineconeClient } from '../client-context.js';
import { formatQueryResultRows } from '../format-query-result.js';
import { metadataFilterSchema, validateMetadataFilter } from '../metadata-filter.js';
import { rankNamespacesByQuery } from '../namespace-router.js';
import { getNamespacesWithCache } from '../namespaces-cache.js';
import { suggestQueryParams } from '../query-suggestion.js';
import { markSuggested } from '../suggestion-flow.js';
import { getToolErrorMessage, logToolError } from '../tool-error.js';
import { jsonErrorResponse, jsonResponse } from '../tool-response.js';

type GuidedToolName = 'count' | 'query_fast' | 'query_detailed';

/**
 * Registers `guided_query` (routing + suggestion + execution in one call).
 * See "Retrieval tool decision matrix" in README.md for tool-selection guidance.
 */
export function registerGuidedQueryTool(server: McpServer): void {
  server.registerTool(
    'guided_query',
    {
      description:
        'Combines namespace routing, suggestion, and query into a single call — no prerequisite tools needed. ' +
        'Single orchestrator: optional namespace_router logic -> suggest_query_params logic -> executes count/query_fast/query_detailed. ' +
        'Returns decision_trace so behavior stays transparent and debuggable.',
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
          .describe('Result count for query_fast/query_detailed paths (1-100).'),
        preferred_tool: z
          .enum(['auto', 'count', 'query_fast', 'query_detailed'])
          .default('auto')
          .describe('Optional override. Use auto to follow suggestion logic.'),
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
        const {
          user_query,
          namespace: inputNamespace,
          metadata_filter,
          top_k,
          preferred_tool,
          enrich_urls,
        } = params;

        if (!user_query?.trim()) {
          return jsonErrorResponse({ status: 'error', message: 'user_query cannot be empty' });
        }

        if (metadata_filter) {
          const err = validateMetadataFilter(metadata_filter);
          if (err) {
            return jsonErrorResponse({ status: 'error', message: err });
          }
        }

        const queryText = user_query.trim();
        const { data: namespaces, cache_hit } = await getNamespacesWithCache();
        const ranked = rankNamespacesByQuery(queryText, namespaces, 3);

        const namespace = inputNamespace ?? ranked[0]?.namespace;
        if (!namespace) {
          return jsonErrorResponse({
            status: 'error',
            message: 'No namespace available. Please run list_namespaces and verify index data.',
          });
        }

        const ns = namespaces.find((n) => n.namespace === namespace);
        const suggestion = suggestQueryParams(ns?.metadata ?? null, queryText);
        if (!suggestion.namespace_found) {
          return jsonErrorResponse({
            status: 'error',
            message: `Namespace "${namespace}" not found in cached namespaces. Call list_namespaces and retry.`,
          });
        }

        const selectedTool: GuidedToolName =
          preferred_tool === 'auto' ? suggestion.recommended_tool : preferred_tool;
        markSuggested(namespace, {
          recommended_tool: selectedTool,
          suggested_fields: suggestion.suggested_fields,
          user_query: queryText,
        });

        const client = getPineconeClient();
        const decision_trace = {
          cache_hit,
          input_namespace: inputNamespace ?? null,
          routed_namespace: ranked[0]?.namespace ?? null,
          selected_namespace: namespace,
          ranked_namespaces: ranked,
          suggested_fields: suggestion.suggested_fields,
          suggested_tool: suggestion.recommended_tool,
          selected_tool: selectedTool,
          explanation: suggestion.explanation,
          enrich_urls,
        };

        if (selectedTool === 'count') {
          const { count, truncated } = await client.count({
            query: queryText,
            namespace,
            metadataFilter: metadata_filter,
          });
          return jsonResponse({
            status: 'success',
            decision_trace,
            result: {
              tool: 'count',
              namespace,
              query: queryText,
              metadata_filter,
              count,
              truncated,
            },
          });
        }

        const isFast = selectedTool === 'query_fast';
        const fields =
          suggestion.suggested_fields.length > 0
            ? suggestion.suggested_fields
            : isFast
              ? [...FAST_QUERY_FIELDS]
              : undefined;
        const queryResults = await client.query({
          query: queryText,
          namespace,
          topK: top_k,
          metadataFilter: metadata_filter,
          useReranking: !isFast,
          fields: fields?.length ? fields : undefined,
        });
        const formattedResults = formatQueryResultRows(queryResults, {
          namespace,
          enrichUrls: enrich_urls,
        });
        const result: QueryResponse = {
          status: 'success',
          mode: isFast ? 'query_fast' : 'query_detailed',
          query: queryText,
          namespace,
          metadata_filter: metadata_filter,
          result_count: formattedResults.length,
          ...(fields?.length ? { fields } : {}),
          results: formattedResults,
        };
        return jsonResponse({
          status: 'success',
          decision_trace,
          result,
        });
      } catch (error) {
        logToolError('guided_query', error);
        return jsonErrorResponse({
          status: 'error',
          message: getToolErrorMessage(error, 'Failed to execute guided query'),
        });
      }
    }
  );
}
