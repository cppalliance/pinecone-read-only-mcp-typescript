import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getPineconeClient } from '../client-context.js';
import { metadataFilterSchema, validateMetadataFilter } from '../metadata-filter.js';
import { requireSuggested } from '../suggestion-flow.js';
import { getToolErrorMessage, logToolError } from '../tool-error.js';
import { jsonErrorResponse, jsonResponse } from '../tool-response.js';

const COUNT_RESPONSE_STATUS = 'success' as const;
type CountResponse =
  | {
      status: 'success';
      count: number;
      truncated: boolean;
      namespace: string;
      metadata_filter?: Record<string, unknown>;
    }
  | { status: 'error'; message: string };

/** Register the count tool on the MCP server. */
export function registerCountTool(server: McpServer): void {
  server.registerTool(
    'count',
    {
      description:
        'Get the number of unique documents matching a metadata filter and semantic query. ' +
        'Use when the user asks for a count (e.g. "how many documents by author X?", "how many records tagged Y?"). ' +
        'Uses semantic (dense) search only and requests only document identifiers (no content) for performance. ' +
        'Returns the number of unique documents (deduped by document_number/url/doc_id) up to 10,000; truncated=true if at least that many. ' +
        'Mandatory flow: call suggest_query_params first, then count. ' +
        'Use list_namespaces to discover namespace and metadata fields. ' +
        'For count-by-metadata only, use a broad query_text (e.g. "document" or "record"). ' +
        'Same metadata_filter operators as query: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $and, $or.',
      inputSchema: {
        namespace: z
          .string()
          .describe('Namespace to count in. Use list_namespaces to discover namespaces.'),
        query_text: z
          .string()
          .describe(
            'Search query text. Use a broad term (e.g. "document", "record") when counting by metadata only.'
          ),
        metadata_filter: metadataFilterSchema
          .optional()
          .describe(
            'Optional metadata filter. Use exact field names from list_namespaces. E.g. {"author": {"$in": ["Alex Doe", "A. Doe"]}} to count by author.'
          ),
      },
    },
    async (params) => {
      try {
        const { namespace, query_text, metadata_filter } = params;
        if (!query_text.trim()) {
          const response: CountResponse = {
            status: 'error',
            message: 'query_text cannot be empty',
          };
          return jsonErrorResponse(response);
        }
        if (metadata_filter) {
          const err = validateMetadataFilter(metadata_filter);
          if (err) {
            return jsonErrorResponse({ status: 'error', message: err });
          }
        }
        const flowCheck = requireSuggested(namespace);
        if (!flowCheck.ok) {
          return jsonErrorResponse({ status: 'error', message: flowCheck.message });
        }
        const client = getPineconeClient();
        const { count, truncated } = await client.count({
          query: query_text.trim(),
          namespace,
          metadataFilter: metadata_filter,
        });
        const response: CountResponse = {
          status: COUNT_RESPONSE_STATUS,
          count,
          truncated,
          namespace,
          metadata_filter,
        };
        return jsonResponse(response);
      } catch (error) {
        logToolError('count', error);
        const response: CountResponse = {
          status: 'error',
          message: getToolErrorMessage(error, 'Failed to get count'),
        };
        return jsonErrorResponse(response);
      }
    }
  );
}
