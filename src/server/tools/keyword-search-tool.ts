import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MAX_TOP_K, MIN_TOP_K } from '../../constants.js';
import { getPineconeClient } from '../client-context.js';
import { formatQueryResultRows } from '../format-query-result.js';
import { metadataFilterSchema, validateMetadataFilter } from '../metadata-filter.js';
import { getToolErrorMessage, logToolError } from '../tool-error.js';
import { jsonErrorResponse, jsonResponse } from '../tool-response.js';

/** Response shape for keyword_search: same as query tool for consistency. */
export interface KeywordSearchResponse {
  status: 'success' | 'error';
  query?: string;
  namespace?: string;
  index?: string;
  metadata_filter?: Record<string, unknown>;
  result_count?: number;
  results?: Array<{
    /** Canonical document identifier. */
    document_id: string | null;
    /** @deprecated Use `document_id`; removed in the next major release. */
    paper_number: string | null;
    title: string;
    author: string;
    url: string;
    content: string;
    score: number;
    reranked: boolean;
    metadata?: Record<string, unknown>;
  }>;
  fields?: string[];
  message?: string;
}

async function executeKeywordSearch(params: {
  query_text: string;
  namespace: string;
  top_k: number;
  metadata_filter?: Record<string, unknown>;
  fields?: string[];
}): Promise<KeywordSearchResponse> {
  const { query_text, namespace, top_k, metadata_filter, fields } = params;

  const normalizedQuery = query_text.trim();
  const normalizedNamespace = namespace?.trim() ?? '';

  if (!normalizedQuery) {
    return {
      status: 'error',
      message: 'Query text cannot be empty',
    };
  }

  if (!normalizedNamespace) {
    return {
      status: 'error',
      message: 'Namespace cannot be empty',
    };
  }

  if (metadata_filter) {
    const filterError = validateMetadataFilter(metadata_filter);
    if (filterError) {
      return { status: 'error', message: filterError };
    }
  }

  const client = getPineconeClient();
  const results = await client.keywordSearch({
    query: normalizedQuery,
    namespace: normalizedNamespace,
    topK: top_k,
    metadataFilter: metadata_filter,
    fields: fields?.length ? fields : undefined,
  });

  const formattedResults = formatQueryResultRows(results, {
    namespace: normalizedNamespace,
  });

  const response: KeywordSearchResponse = {
    status: 'success',
    query: normalizedQuery,
    namespace: normalizedNamespace,
    index: client.getSparseIndexName(),
    metadata_filter: metadata_filter,
    result_count: formattedResults.length,
    results: formattedResults,
  };
  if (fields?.length) {
    response.fields = fields;
  }
  return response;
}

/** Register the keyword_search tool on the MCP server. */
export function registerKeywordSearchTool(server: McpServer): void {
  server.registerTool(
    'keyword_search',
    {
      description:
        'Keyword (lexical/sparse-only) search over the Pinecone sparse index (default: rag-hybrid-sparse). ' +
        'Use for exact or keyword-style queries. Does not use semantic reranking. ' +
        'Call list_namespaces first to discover namespaces; suggest_query_params is optional.',
      inputSchema: {
        query_text: z.string().describe('Search query text (keyword/lexical match).'),
        namespace: z
          .string()
          .describe('Namespace to search. Use list_namespaces to discover available namespaces.'),
        top_k: z
          .number()
          .int()
          .min(MIN_TOP_K)
          .max(MAX_TOP_K)
          .default(10)
          .describe('Number of results to return (1-100). Default: 10'),
        metadata_filter: metadataFilterSchema
          .optional()
          .describe('Optional metadata filter to narrow results.'),
        fields: z
          .array(z.string())
          .optional()
          .describe(
            'Optional field names to return. Omit for all fields; use suggest_query_params for suggestions.'
          ),
      },
    },
    async (params) => {
      try {
        const response = await executeKeywordSearch({
          query_text: params.query_text,
          namespace: params.namespace,
          top_k: params.top_k,
          metadata_filter: params.metadata_filter,
          fields: params.fields,
        });
        if (response.status === 'error') {
          return jsonErrorResponse(response);
        }
        return jsonResponse(response);
      } catch (error) {
        logToolError('keyword_search', error);
        const response: KeywordSearchResponse = {
          status: 'error',
          message: getToolErrorMessage(error, 'Keyword search failed'),
        };
        return jsonErrorResponse(response);
      }
    }
  );
}
