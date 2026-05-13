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
 * Registers semantic chunk query tools (`query`, `query_fast`, `query_detailed`).
 * See "Retrieval tool decision matrix" in README.md for tool-selection guidance.
 */
export function registerQueryTool(server: McpServer): void {
  server.registerTool(
    'query',
    {
      description:
        'Full query tool with optional reranking. Requires suggest_query_params to be called first for the target namespace. ' +
        'For lighter retrieval use query_fast; for content-heavy retrieval use query_detailed.',
      inputSchema: {
        ...baseSchema,
        use_reranking: z
          .boolean()
          .default(true)
          .describe(
            'Whether to use semantic reranking for better relevance. Slower but more accurate.'
          ),
      },
    },
    async (params) =>
      executeQuery({
        ...params,
        top_k: params.top_k,
        use_reranking: params.use_reranking,
        mode: 'query',
      })
  );

  server.registerTool(
    'query_fast',
    {
      description:
        'Fast query preset. Requires suggest_query_params to be called first for the target namespace. ' +
        'Defaults to no reranking and lightweight fields for lower latency/cost.',
      inputSchema: {
        ...baseSchema,
      },
    },
    async (params) =>
      executeQuery({
        ...params,
        top_k: params.top_k,
        use_reranking: false,
        fields: params.fields?.length ? params.fields : [...FAST_QUERY_FIELDS],
        mode: 'query_fast',
      })
  );

  server.registerTool(
    'query_detailed',
    {
      description:
        'Detailed query preset. Requires suggest_query_params to be called first for the target namespace. ' +
        'Designed for reading/summarization workflows with content snippets.',
      inputSchema: {
        ...baseSchema,
        use_reranking: z
          .boolean()
          .default(true)
          .describe('Whether to use semantic reranking for better precision (default true).'),
      },
    },
    async (params) =>
      executeQuery({
        ...params,
        top_k: params.top_k ?? 10,
        use_reranking: params.use_reranking ?? true,
        mode: 'query_detailed',
      })
  );
}
