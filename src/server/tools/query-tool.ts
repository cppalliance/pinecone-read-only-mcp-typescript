import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FAST_QUERY_FIELDS, MAX_TOP_K, MIN_TOP_K } from '../../constants.js';
import type { QueryResponse } from '../../types.js';
import { getPineconeClient } from '../client-context.js';
import { formatQueryResultRows } from '../format-query-result.js';
import { metadataFilterSchema, validateMetadataFilter } from '../metadata-filter.js';
import { requireSuggested } from '../suggestion-flow.js';
import { getToolErrorMessage, logToolError } from '../tool-error.js';
import { jsonErrorResponse, jsonResponse } from '../tool-response.js';

type QueryMode = 'query' | 'query_fast' | 'query_detailed';

type QueryExecParams = {
  query_text: string;
  namespace: string;
  top_k: number;
  use_reranking: boolean;
  metadata_filter?: Record<string, unknown>;
  fields?: string[];
  mode: QueryMode;
};

/** Run the query tool: validate flow, call Pinecone, format and return results. */
async function executeQuery(params: QueryExecParams) {
  const { query_text, namespace, top_k, use_reranking, metadata_filter, fields, mode } = params;
  try {
    if (!query_text.trim()) {
      const response: QueryResponse = {
        status: 'error',
        message: 'Query text cannot be empty',
      };
      return jsonErrorResponse(response);
    }

    if (metadata_filter) {
      const filterValidationError = validateMetadataFilter(metadata_filter);
      if (filterValidationError) {
        const response: QueryResponse = {
          status: 'error',
          message: filterValidationError,
        };
        return jsonErrorResponse(response);
      }
    }

    const flowCheck = requireSuggested(namespace);
    if (!flowCheck.ok) {
      return jsonErrorResponse({ status: 'error', message: flowCheck.message });
    }

    const client = getPineconeClient();
    const results = await client.query({
      query: query_text.trim(),
      topK: top_k,
      namespace,
      useReranking: use_reranking,
      metadataFilter: metadata_filter,
      fields: fields?.length ? fields : undefined,
    });

    const formattedResults = formatQueryResultRows(results);

    const response: QueryResponse = {
      status: 'success',
      mode,
      query: query_text,
      namespace,
      metadata_filter: metadata_filter,
      result_count: formattedResults.length,
      results: formattedResults,
      ...(fields?.length ? { fields } : {}),
    };
    return jsonResponse(response);
  } catch (error) {
    logToolError(mode, error);
    const response: QueryResponse = {
      status: 'error',
      message: getToolErrorMessage(error, 'An error occurred while processing your query'),
    };
    return jsonErrorResponse(response);
  }
}

const baseSchema = {
  query_text: z.string().describe('Search query text. Be specific for better results.'),
  namespace: z
    .string()
    .describe(
      'Namespace to search within. Use list_namespaces/namespace_router first, then suggest_query_params before querying.'
    ),
  top_k: z
    .number()
    .int()
    .min(MIN_TOP_K)
    .max(MAX_TOP_K)
    .default(10)
    .describe('Number of results to return (1-100). Default: 10'),
  metadata_filter: metadataFilterSchema
    .optional()
    .describe('Optional metadata filter to narrow down search results.'),
  fields: z
    .array(z.string())
    .optional()
    .describe(
      'Optional field names to return from Pinecone. Use suggest_query_params suggested_fields for better performance.'
    ),
};

/**
 * Single hybrid `query` tool (replaces separate `query_fast` / `query_detailed` MCP tools).
 * Presets mirror the old defaults.
 */
export function registerQueryTool(server: McpServer): void {
  server.registerTool(
    'query',
    {
      description:
        'Hybrid semantic search (dense + sparse) with optional reranking. Mandatory flow: call suggest_query_params first. ' +
        'Use preset=`fast` for low-latency retrieval without reranking and lightweight fields; `detailed` for reranked, content-oriented retrieval; `full` to set use_reranking and fields explicitly.',
      inputSchema: {
        ...baseSchema,
        preset: z
          .enum(['fast', 'detailed', 'full'])
          .default('full')
          .describe(
            'fast: no reranking + lightweight fields (former query_fast). detailed: reranking on (former query_detailed). full: use use_reranking and fields below.'
          ),
        use_reranking: z
          .boolean()
          .optional()
          .describe(
            'Used when preset is detailed or full (default true). Ignored when preset is fast.'
          ),
      },
    },
    async (params) => {
      const preset = params.preset;
      let use_reranking: boolean;
      let fields: string[] | undefined;
      let mode: QueryMode;

      if (preset === 'fast') {
        use_reranking = false;
        fields = params.fields?.length ? params.fields : [...FAST_QUERY_FIELDS];
        mode = 'query_fast';
      } else if (preset === 'detailed') {
        use_reranking = params.use_reranking ?? true;
        fields = params.fields?.length ? params.fields : undefined;
        mode = 'query_detailed';
      } else {
        use_reranking = params.use_reranking ?? true;
        fields = params.fields?.length ? params.fields : undefined;
        mode = 'query';
      }

      return executeQuery({
        query_text: params.query_text,
        namespace: params.namespace,
        top_k: params.top_k,
        use_reranking,
        metadata_filter: params.metadata_filter,
        fields,
        mode,
      });
    }
  );
}
