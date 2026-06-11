import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getPineconeClient } from '../client-context.js';
import { metadataFilterSchema, validateMetadataFilterDetailed } from '../metadata-filter.js';
import { normalizeNamespace } from '../namespace-utils.js';
import type { ServerContext } from '../server-context.js';
import { requireSuggested } from '../suggestion-flow.js';
import {
  classifyToolCatchError,
  flowGateToolError,
  lifecycleToolError,
  logToolError,
  validationToolError,
} from '../tool-error.js';
import { countResponseSchema, type CountResponse } from '../response-schemas.js';
import { jsonErrorResponse, validatedJsonResponse } from '../tool-response.js';

type CountExecParams = {
  namespace: string;
  query_text: string;
  metadata_filter?: Record<string, unknown>;
};

async function executeCount(params: CountExecParams, ctx?: ServerContext) {
  try {
    if (ctx?.disposed) {
      return jsonErrorResponse(lifecycleToolError('ServerContext has been disposed'));
    }
    const { namespace, query_text, metadata_filter } = params;
    const nsNorm = normalizeNamespace(namespace);
    if (!nsNorm) {
      return jsonErrorResponse(
        validationToolError('namespace cannot be empty', 'namespace', {
          suggestion: 'Use a namespace name from list_namespaces (trimmed).',
        })
      );
    }
    if (!query_text.trim()) {
      return jsonErrorResponse(validationToolError('query_text cannot be empty', 'query_text'));
    }
    if (metadata_filter) {
      const err = validateMetadataFilterDetailed(metadata_filter);
      if (err) {
        return jsonErrorResponse(validationToolError(err.message, err.field));
      }
    }
    const flowCheck = ctx ? ctx.requireSuggested(nsNorm) : requireSuggested(nsNorm);
    if (!flowCheck.ok) {
      return jsonErrorResponse(flowGateToolError(nsNorm, flowCheck.message));
    }
    const client = ctx ? ctx.getClient() : getPineconeClient();
    const { count, truncated } = await client.count({
      query: query_text.trim(),
      namespace: nsNorm,
      metadataFilter: metadata_filter,
    });
    const response: CountResponse = {
      status: 'success',
      count,
      truncated,
      namespace: nsNorm,
      metadata_filter,
    };
    return validatedJsonResponse(countResponseSchema, response);
  } catch (error) {
    logToolError('count', error);
    return jsonErrorResponse(classifyToolCatchError(error, 'Failed to get count'));
  }
}

/** Register the count tool on the MCP server. */
export function registerCountTool(server: McpServer, ctx?: ServerContext): void {
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
    async (params) => executeCount(params, ctx)
  );
}
