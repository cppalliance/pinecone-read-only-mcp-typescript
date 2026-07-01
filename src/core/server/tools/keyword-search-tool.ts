import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MAX_TOP_K, MIN_TOP_K } from '../../../constants.js';
import { formatQueryResultRows } from '../format-query-result.js';
import { metadataFilterSchema, validateMetadataFilterDetailed } from '../metadata-filter.js';
import type { ServerContext } from '../server-context.js';
import {
  getClientForResolvedSource,
  optionalSourceField,
  rejectSourceWithoutContext,
  resolveSourceForTool,
  sourceParamSchema,
  sourceValidationError,
} from '../source-tool-utils.js';
import {
  classifyToolCatchError,
  lifecycleToolError,
  logToolError,
  validationToolError,
  type ToolError,
} from '../tool-error.js';
import {
  keywordSearchSuccessResponseSchema,
  type KeywordSearchResponse,
  type KeywordSearchSuccessResponse,
} from '../response-schemas.js';
import { jsonErrorResponse, validatedJsonResponse } from '../tool-response.js';

/** @deprecated Import {@link KeywordSearchResponse} from `response-schemas` or package root. */
export type { KeywordSearchResponse };

type KeywordSearchExecResult =
  | { ok: true; body: KeywordSearchSuccessResponse }
  | { ok: false; error: ToolError };

async function executeKeywordSearch(
  params: {
    query_text: string;
    namespace: string;
    top_k: number;
    metadata_filter?: Record<string, unknown>;
    fields?: string[];
    source?: string;
  },
  ctx?: ServerContext
): Promise<KeywordSearchExecResult> {
  if (ctx?.disposed) {
    return { ok: false, error: lifecycleToolError('ServerContext has been disposed') };
  }
  const { query_text, namespace, top_k, metadata_filter, fields, source } = params;

  const normalizedQuery = query_text.trim();
  const normalizedNamespace = namespace?.trim() ?? '';

  if (!normalizedQuery) {
    return {
      ok: false,
      error: validationToolError('Query text cannot be empty', 'query_text'),
    };
  }

  if (!normalizedNamespace) {
    return {
      ok: false,
      error: validationToolError('Namespace cannot be empty', 'namespace'),
    };
  }

  if (metadata_filter) {
    const filterError = validateMetadataFilterDetailed(metadata_filter);
    if (filterError) {
      return {
        ok: false,
        error: validationToolError(filterError.message, filterError.field),
      };
    }
  }

  const sourceError = rejectSourceWithoutContext(source, ctx);
  if (sourceError) {
    return { ok: false, error: sourceError };
  }

  let activeCtx = ctx;
  let activeSource: string | undefined;
  if (ctx) {
    const resolved = await resolveSourceForTool(ctx, source, normalizedNamespace);
    if (!resolved.ok) {
      return {
        ok: false,
        error: sourceValidationError(resolved.code, resolved.message),
      };
    }
    activeCtx = resolved.ctx;
    activeSource = resolved.source;
  }

  const client = getClientForResolvedSource(activeCtx, activeSource, 'keyword_search');
  const results = await client.keywordSearch({
    query: normalizedQuery,
    namespace: normalizedNamespace,
    topK: top_k,
    metadataFilter: metadata_filter,
    fields: fields?.length ? fields : undefined,
  });

  const formattedResults = formatQueryResultRows(results, {
    ctx: activeCtx,
    namespace: normalizedNamespace,
    source: activeSource,
  });

  const response: KeywordSearchSuccessResponse = {
    status: 'success',
    query: normalizedQuery,
    namespace: normalizedNamespace,
    ...(activeCtx && activeSource ? optionalSourceField(activeCtx, activeSource) : {}),
    index: client.getSparseIndexName(),
    metadata_filter: metadata_filter,
    result_count: formattedResults.length,
    results: formattedResults,
  };
  if (fields?.length) {
    response.fields = fields;
  }
  return { ok: true, body: response };
}

/**
 * Registers `keyword_search` (lexical/sparse-only retrieval).
 * See "Retrieval tool decision matrix" in README.md for tool-selection guidance.
 */
export function registerKeywordSearchTool(server: McpServer, ctx?: ServerContext): void {
  server.registerTool(
    'keyword_search',
    {
      description:
        'Keyword (lexical/sparse-only) search over the Pinecone sparse index ({indexName}-sparse). ' +
        'Use for exact or keyword-style queries. Does not use semantic reranking. ' +
        'Call list_namespaces first to discover namespaces. Does not require suggest_query_params.',
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
        source: sourceParamSchema,
      },
    },
    async (params) => {
      try {
        const result = await executeKeywordSearch(
          {
            query_text: params.query_text,
            namespace: params.namespace,
            top_k: params.top_k,
            metadata_filter: params.metadata_filter,
            fields: params.fields,
            source: params.source,
          },
          ctx
        );
        if (!result.ok) {
          return jsonErrorResponse(result.error);
        }
        return validatedJsonResponse(keywordSearchSuccessResponseSchema, result.body);
      } catch (error) {
        logToolError('keyword_search', error);
        return jsonErrorResponse(classifyToolCatchError(error, 'Keyword search failed'));
      }
    }
  );
}
