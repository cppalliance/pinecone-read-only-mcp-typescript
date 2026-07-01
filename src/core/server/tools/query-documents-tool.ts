import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  DEFAULT_QUERY_DOCUMENTS_TOP_K,
  MAX_QUERY_DOCUMENTS_TOP_K,
  QUERY_DOCUMENTS_MAX_CHUNKS,
} from '../../../constants.js';
import { metadataFilterSchema, validateMetadataFilterDetailed } from '../metadata-filter.js';
import { normalizeNamespace } from '../namespace-utils.js';
import { reassembleByDocument } from '../reassemble-documents.js';
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
  queryDocumentsResponseSchema,
  type QueryDocumentsResponse,
} from '../response-schemas.js';
import { jsonErrorResponse, validatedJsonResponse } from '../tool-response.js';

/**
 * Heuristic multiplier: chunks fetched = top_k × CHUNKS_PER_DOCUMENT, capped by
 * QUERY_DOCUMENTS_MAX_CHUNKS. Set to 50 as a balance between recall and performance —
 * documents with more than ~50 chunks may be truncated unless the caller passes a
 * higher `max_chunks_per_document` (default 200, max 500). Increasing this constant
 * raises Pinecone fetch latency and memory usage during reassembly.
 */
const CHUNKS_PER_DOCUMENT = 50;

/**
 * Registers `query_documents` (reassemble chunks into full documents).
 * See "Retrieval tool decision matrix" in README.md for tool-selection guidance.
 */
export function registerQueryDocumentsTool(server: McpServer, ctx?: ServerContext): void {
  server.registerTool(
    'query_documents',
    {
      description:
        'Run a semantic query and return whole documents (reassembled from chunks). ' +
        'Reranks for document-level relevance when a rerank model is configured (higher latency/cost than chunk-only query). ' +
        'Use for content analysis, summarization, or when you need full-document context. ' +
        'Chunks are grouped by document_number/doc_id/url, ordered by chunk_index when present (e.g. from RecursiveCharacterTextSplitter), and merged into one content per document. ' +
        'Requires suggest_query_params to be called first for the target namespace. Use list_namespaces to discover namespaces.',
      inputSchema: {
        query_text: z.string().describe('Search query text. Be specific for better results.'),
        namespace: z
          .string()
          .describe(
            'Namespace to search. Use list_namespaces/namespace_router first, then suggest_query_params.'
          ),
        top_k: z
          .number()
          .int()
          .min(1)
          .max(MAX_QUERY_DOCUMENTS_TOP_K)
          .default(DEFAULT_QUERY_DOCUMENTS_TOP_K)
          .describe(
            `Number of documents to return (1-${MAX_QUERY_DOCUMENTS_TOP_K}). Each document is reassembled from its chunks. Default: ${DEFAULT_QUERY_DOCUMENTS_TOP_K}.`
          ),
        metadata_filter: metadataFilterSchema
          .optional()
          .describe('Optional metadata filter to narrow search.'),
        max_chunks_per_document: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe(
            'Max chunks to merge per document (default 200). Lower for shorter merged_content.'
          ),
        source: sourceParamSchema,
      },
    },
    async (params) => {
      try {
        if (ctx?.disposed) {
          return jsonErrorResponse(lifecycleToolError('ServerContext has been disposed'));
        }
        const {
          query_text,
          namespace,
          top_k = DEFAULT_QUERY_DOCUMENTS_TOP_K,
          metadata_filter,
          max_chunks_per_document,
          source,
        } = params;

        if (!query_text?.trim()) {
          return jsonErrorResponse(validationToolError('query_text cannot be empty', 'query_text'));
        }

        if (metadata_filter) {
          const err = validateMetadataFilterDetailed(metadata_filter);
          if (err) {
            return jsonErrorResponse(validationToolError(err.message, err.field));
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

        const chunkLimit = Math.min(QUERY_DOCUMENTS_MAX_CHUNKS, top_k * CHUNKS_PER_DOCUMENT);
        const client = getClientForResolvedSource(activeCtx, activeSource, 'query_documents');
        const queryOutcome = await client.query({
          query: query_text.trim(),
          topK: chunkLimit,
          namespace: nsNorm,
          useReranking: true,
          metadataFilter: metadata_filter,
          fields: undefined,
        });

        const reassembled = reassembleByDocument(queryOutcome.results, {
          maxChunksPerDocument: max_chunks_per_document ?? 200,
        });

        const topDocuments = reassembled
          .sort((a, b) => b.best_score - a.best_score)
          .slice(0, top_k);

        const response: QueryDocumentsResponse = {
          status: 'success',
          query: query_text.trim(),
          namespace: nsNorm,
          ...optionalSourceField(activeCtx, activeSource ?? ''),
          metadata_filter,
          result_count: topDocuments.length,
          ...buildQueryExperimental(queryOutcome),
          documents: topDocuments.map((doc) => ({
            document_id: doc.document_id,
            merged_content: doc.merged_content,
            metadata: doc.metadata,
            chunk_count: doc.chunk_count,
            best_score: doc.best_score,
          })),
        };
        return validatedJsonResponse(queryDocumentsResponseSchema, response);
      } catch (error) {
        logToolError('query_documents', error);
        return jsonErrorResponse(
          classifyToolCatchError(error, 'Failed to query and reassemble documents')
        );
      }
    }
  );
}
