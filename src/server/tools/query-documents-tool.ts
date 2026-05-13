import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  DEFAULT_QUERY_DOCUMENTS_TOP_K,
  MAX_QUERY_DOCUMENTS_TOP_K,
  QUERY_DOCUMENTS_MAX_CHUNKS,
} from '../../constants.js';
import { getPineconeClient } from '../client-context.js';
import { metadataFilterSchema, validateMetadataFilter } from '../metadata-filter.js';
import { reassembleByDocument } from '../reassemble-documents.js';
import { requireSuggested } from '../suggestion-flow.js';
import { getToolErrorMessage, logToolError } from '../tool-error.js';
import { jsonErrorResponse, jsonResponse } from '../tool-response.js';

/**
 * Heuristic multiplier: chunks fetched = top_k × CHUNKS_PER_DOCUMENT, capped by
 * QUERY_DOCUMENTS_MAX_CHUNKS. Set to 50 as a balance between recall and performance —
 * documents with more than ~50 chunks may be truncated unless the caller passes a
 * higher `max_chunks_per_document` (default 200, max 500). Increasing this constant
 * raises Pinecone fetch latency and memory usage during reassembly.
 */
const CHUNKS_PER_DOCUMENT = 50;

/** Register the query_documents tool (reassemble chunks into full documents) on the MCP server. */
export function registerQueryDocumentsTool(server: McpServer): void {
  server.registerTool(
    'query_documents',
    {
      description:
        'Run a semantic query and return whole documents (reassembled from chunks). ' +
        'Always uses semantic reranking for document-level relevance (higher latency/cost than chunk-only query). ' +
        'Use for content analysis, summarization, or when you need full-document context. ' +
        'Chunks are grouped by document_number/doc_id/url, ordered by chunk_index when present (e.g. from RecursiveCharacterTextSplitter), and merged into one content per document. ' +
        'Mandatory flow: call suggest_query_params first. Use list_namespaces to discover namespaces.',
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
      },
    },
    async (params) => {
      try {
        const {
          query_text,
          namespace,
          top_k = DEFAULT_QUERY_DOCUMENTS_TOP_K,
          metadata_filter,
          max_chunks_per_document,
        } = params;

        if (!query_text?.trim()) {
          return jsonErrorResponse({
            status: 'error',
            message: 'query_text cannot be empty',
          });
        }

        if (metadata_filter) {
          const err = validateMetadataFilter(metadata_filter);
          if (err) return jsonErrorResponse({ status: 'error', message: err });
        }

        const flowCheck = requireSuggested(namespace);
        if (!flowCheck.ok) {
          return jsonErrorResponse({ status: 'error', message: flowCheck.message });
        }

        const chunkLimit = Math.min(QUERY_DOCUMENTS_MAX_CHUNKS, top_k * CHUNKS_PER_DOCUMENT);
        const client = getPineconeClient();
        const results = await client.query({
          query: query_text.trim(),
          topK: chunkLimit,
          namespace,
          useReranking: true,
          metadataFilter: metadata_filter,
          fields: undefined,
        });

        const reassembled = reassembleByDocument(results, {
          maxChunksPerDocument: max_chunks_per_document ?? 200,
        });

        const topDocuments = reassembled
          .sort((a, b) => b.best_score - a.best_score)
          .slice(0, top_k);

        return jsonResponse({
          status: 'success',
          query: query_text.trim(),
          namespace,
          metadata_filter,
          result_count: topDocuments.length,
          documents: topDocuments.map((doc) => ({
            document_id: doc.document_id,
            merged_content: doc.merged_content,
            metadata: doc.metadata,
            chunk_count: doc.chunk_count,
            best_score: doc.best_score,
          })),
        });
      } catch (error) {
        logToolError('query_documents', error);
        return jsonErrorResponse({
          status: 'error',
          message: getToolErrorMessage(error, 'Failed to query and reassemble documents'),
        });
      }
    }
  );
}
