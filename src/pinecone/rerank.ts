/**
 * Pinecone inference reranking and mapping to SearchResult.
 */

import type { Pinecone } from '@pinecone-database/pinecone';
import { error as logError } from '../logger.js';
import type { MergedHit, SearchResult } from '../types.js';

export type RerankOutcome = {
  results: SearchResult[];
  /** True when rerank was attempted and failed; results are unreranked slice. */
  degraded: boolean;
  /** Human-readable reason for MCP clients when {@link degraded} is true. */
  degradation_reason?: string;
};

/**
 * Rerank merged hits using Pinecone's reranking model; on failure returns unreranked slice.
 */
export async function rerankResults(
  pc: Pinecone,
  rerankModel: string,
  query: string,
  results: MergedHit[],
  topN: number
): Promise<RerankOutcome> {
  if (!results || results.length === 0) {
    return { results: [], degraded: false };
  }

  try {
    const rerankResult = await pc.inference.rerank({
      model: rerankModel,
      query,
      // The Pinecone SDK types constrain document values to `Record<string, string>`,
      // but the underlying HTTP API accepts any JSON value. We pass MergedHit objects
      // (metadata may contain number/boolean/string[]) and only `chunk_text` — which is
      // always a string — is accessed via rankFields. The double cast via `as unknown`
      // is intentional: it bypasses the SDK's over-narrow type without stringifying
      // metadata values that we need to read back from the returned documents.
      documents: results as unknown as (string | Record<string, string>)[],
      topN,
      rankFields: ['chunk_text'],
      returnDocuments: true,
      parameters: { truncate: 'END' },
    });

    const reranked: SearchResult[] = [];
    for (const item of rerankResult.data || []) {
      const document = (item.document || {}) as MergedHit;
      reranked.push({
        id: document['_id'] || '',
        content: document['chunk_text'] || '',
        score: parseFloat(String(item.score || 0)),
        metadata: document['metadata'] || {},
        reranked: true,
      });
    }
    return { results: reranked, degraded: false };
  } catch (error) {
    logError('Error reranking results', error);
    const msg = error instanceof Error ? error.message : String(error);
    return {
      results: results.slice(0, topN).map((result) => ({
        id: result._id || '',
        content: result.chunk_text || '',
        score: result._score || 0,
        metadata: result.metadata || {},
        reranked: false,
      })),
      degraded: true,
      degradation_reason: `rerank_failed: ${msg}`,
    };
  }
}
