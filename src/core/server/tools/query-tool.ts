import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FAST_QUERY_FIELDS, MAX_TOP_K, MIN_TOP_K } from '../../../constants.js';
import { formatQueryResultRows } from '../format-query-result.js';
import { metadataFilterSchema, validateMetadataFilterDetailed } from '../metadata-filter.js';
import { normalizeNamespace } from '../namespace-utils.js';
import type { ServerContext } from '../server-context.js';
import { requireSuggested } from '../suggestion-flow.js';
import {
  getClientForResolvedSource,
  optionalSourceField,
  resolveSourceForTool,
  sourceParamSchema,
  sourceValidationError,
} from '../source-tool-utils.js';
import {
  classifyToolCatchError,
  flowGateToolError,
  lifecycleToolError,
  logToolError,
  validationToolError,
} from '../tool-error.js';
import {
  buildQueryExperimental,
  querySuccessResponseSchema,
  type QuerySuccessResponse,
} from '../response-schemas.js';
import { jsonErrorResponse, validatedJsonResponse } from '../tool-response.js';

type QueryMode = 'query' | 'query_fast' | 'query_detailed';

type QueryExecParams = {
  query_text: string;
  namespace: string;
  top_k: number;
  use_reranking: boolean;
  metadata_filter?: Record<string, unknown>;
  fields?: string[];
  mode: QueryMode;
  source?: string;
};

/** Run the query tool: validate flow, call Pinecone, format and return results. */
async function executeQuery(params: QueryExecParams, ctx?: ServerContext) {
  const { query_text, namespace, top_k, use_reranking, metadata_filter, fields, mode, source } =
    params;
  try {
    if (ctx?.disposed) {
      return jsonErrorResponse(lifecycleToolError('ServerContext has been disposed'));
    }
    if (!query_text.trim()) {
      return jsonErrorResponse(validationToolError('Query text cannot be empty', 'query_text'));
    }

    if (metadata_filter) {
      const filterValidationError = validateMetadataFilterDetailed(metadata_filter);
      if (filterValidationError) {
        return jsonErrorResponse(
          validationToolError(filterValidationError.message, filterValidationError.field)
        );
      }
    }

    const nsNorm = normalizeNamespace(namespace);
    if (!nsNorm) {
      return jsonErrorResponse(
        validationToolError('namespace cannot be empty', 'namespace', {
          suggestion: 'Use a namespace name from list_namespaces (trimmed).',
        })
      );
    }

    let activeCtx = ctx;
    let activeSource: string | undefined;
    if (ctx) {
      const resolved = await resolveSourceForTool(ctx, source, nsNorm);
      if (!resolved.ok) {
        return jsonErrorResponse(sourceValidationError(resolved.code, resolved.message));
      }
      activeCtx = resolved.ctx;
      activeSource = resolved.source;
    }

    const flowCheck = activeCtx
      ? activeCtx.requireSuggested(nsNorm, activeSource)
      : requireSuggested(nsNorm);
    if (!flowCheck.ok) {
      return jsonErrorResponse(flowGateToolError(nsNorm, flowCheck.message));
    }

    const client = getClientForResolvedSource(activeCtx, activeSource, 'query');
    const queryOutcome = await client.query({
      query: query_text.trim(),
      topK: top_k,
      namespace: nsNorm,
      useReranking: use_reranking,
      metadataFilter: metadata_filter,
      fields: fields?.length ? fields : undefined,
    });

    const formattedResults = formatQueryResultRows(queryOutcome.results, {
      ctx: activeCtx,
      namespace: nsNorm,
      source: activeSource,
    });

    const response: QuerySuccessResponse = {
      status: 'success',
      mode,
      query: query_text,
      namespace: nsNorm,
      ...optionalSourceField(activeCtx, activeSource ?? ''),
      metadata_filter: metadata_filter,
      result_count: formattedResults.length,
      results: formattedResults,
      ...(fields?.length ? { fields } : {}),
      ...buildQueryExperimental(queryOutcome),
    };
    return validatedJsonResponse(querySuccessResponseSchema, response);
  } catch (error) {
    logToolError(mode, error);
    return jsonErrorResponse(
      classifyToolCatchError(error, 'An error occurred while processing your query')
    );
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
  source: sourceParamSchema,
};

/**
 * Registers semantic chunk query via one preset-driven `query` tool.
 * See "Retrieval tool decision matrix" in README.md for tool-selection guidance.
 */
export function registerQueryTool(server: McpServer, ctx?: ServerContext): void {
  server.registerTool(
    'query',
    {
      description:
        'Hybrid semantic search (dense + sparse) with optional reranking. Requires suggest_query_params to be called first for the target namespace. ' +
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

      return executeQuery(
        {
          query_text: params.query_text,
          namespace: params.namespace,
          top_k: params.top_k,
          use_reranking,
          metadata_filter: params.metadata_filter,
          fields,
          mode,
          source: params.source,
        },
        ctx
      );
    }
  );
}
