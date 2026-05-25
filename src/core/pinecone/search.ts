/**
 * Pinecone search pipeline: single-index text query and dense/sparse merge.
 */

import { COUNT_FIELDS, COUNT_TOP_K } from '../../constants.js';
import { debug as logDebug, warn as logWarn } from '../../logger.js';
import type {
  CountResult,
  MergedHit,
  PineconeHit,
  PineconeMetadataValue,
  SearchResult,
  SearchableIndex,
} from '../../types.js';

/**
 * Search a Pinecone index using text query with optional metadata filtering.
 * When options.fields is set, only those fields are requested (e.g. for count: no chunk_text).
 */
export async function searchIndex(
  index: SearchableIndex,
  query: string,
  topK: number,
  namespace?: string,
  metadataFilter?: Record<string, unknown>,
  options?: { fields?: string[] }
): Promise<PineconeHit[]> {
  // Build query payload in the same shape as Python implementation.
  const queryPayload: Record<string, unknown> = {
    top_k: topK,
    inputs: { text: query },
  };

  // Include filter when explicitly provided (matches Python behavior).
  if (metadataFilter !== undefined) {
    queryPayload['filter'] = metadataFilter;
    logDebug('Applying metadata filter', metadataFilter);
  }

  try {
    // Preferred path: Pinecone search API.
    if (typeof index.search === 'function') {
      const searchOpts: {
        namespace?: string;
        query: Record<string, unknown>;
        fields?: string[];
      } = {
        namespace,
        query: queryPayload,
      };
      if (options?.fields?.length) {
        searchOpts.fields = options.fields;
      }
      const result = await index.search(searchOpts);
      return result?.result?.hits || [];
    }

    // Backward-compatible fallback for older API shapes.
    const target = namespace && index.namespace ? index.namespace(namespace) : index;
    const queryParams: { query: Record<string, unknown>; fields?: string[] } = {
      query: {
        topK,
        inputs: { text: query },
      },
    };
    if (metadataFilter !== undefined) {
      queryParams.query['filter'] = metadataFilter;
    }
    if (options?.fields?.length) {
      queryParams.fields = options.fields;
    }
    const result = target.searchRecords
      ? await target.searchRecords(queryParams)
      : { result: { hits: [] as PineconeHit[] } };
    return result?.result?.hits || [];
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Pinecone search failed for namespace "${namespace ?? 'default'}": ${errorMessage}`
    );
  }
}

/**
 * Merge and deduplicate results from dense and sparse searches
 *
 * Uses the higher score when duplicates are found.
 */
export function mergeResults(denseHits: PineconeHit[], sparseHits: PineconeHit[]): MergedHit[] {
  const deduped: Record<string, MergedHit> = {};

  for (const hit of [...denseHits, ...sparseHits]) {
    const hitId = hit._id || '';
    const hitScore = hit._score || 0;

    const existing = deduped[hitId];
    if (existing !== undefined && (existing._score || 0) >= hitScore) {
      continue;
    }

    const hitMetadata: Record<string, PineconeMetadataValue> = {};
    let content = '';

    for (const [key, value] of Object.entries(hit.fields || {})) {
      if (key === 'chunk_text') {
        content = typeof value === 'string' ? value : '';
      } else {
        hitMetadata[key] = value as PineconeMetadataValue;
      }
    }

    deduped[hitId] = {
      _id: hitId,
      _score: hitScore,
      chunk_text: content,
      metadata: hitMetadata,
    };
  }

  return Object.values(deduped).sort((a, b) => (b._score || 0) - (a._score || 0));
}

/** Top merged hits as SearchResult without calling rerank API. */
export function sliceMergedHitsToSearchResults(merged: MergedHit[], topK: number): SearchResult[] {
  return merged.slice(0, topK).map((result) => ({
    id: result._id || '',
    content: result.chunk_text || '',
    score: result._score || 0,
    metadata: result.metadata || {},
    reranked: false,
  }));
}

/** Map sparse-index hits to SearchResult rows (keyword search; no reranking). */
export function mapSparseHitsToSearchResults(hits: PineconeHit[]): SearchResult[] {
  return hits.map((hit) => {
    const fields = hit.fields || {};
    let content = '';
    const metadata: Record<string, PineconeMetadataValue> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (key === 'chunk_text') {
        content = typeof value === 'string' ? value : '';
      } else {
        metadata[key] = value as PineconeMetadataValue;
      }
    }
    return {
      id: hit._id || '',
      content,
      score: hit._score || 0,
      metadata,
      reranked: false,
    };
  });
}

/** Deduplicate semantic search hits by document identifiers for count(). */
export function countUniqueDocumentsFromHits(
  hits: PineconeHit[],
  namespace: string | undefined
): CountResult {
  const docKeys = new Set<string>();
  let idFallbackCount = 0;
  for (const hit of hits) {
    const fields = hit.fields || {};
    const docNumber = fields['document_number'];
    const url = fields['url'];
    const docId = fields['doc_id'];
    const docKey =
      (typeof docNumber === 'string' ? docNumber : undefined) ??
      (typeof url === 'string' ? url : undefined) ??
      (typeof docId === 'string' ? docId : undefined);
    if (docKey !== undefined) {
      docKeys.add(docKey);
    } else {
      // Fall back to chunk ID — this yields a chunk count, not a document count
      idFallbackCount++;
      docKeys.add(hit._id ?? '');
    }
  }
  if (idFallbackCount > 0) {
    logWarn(
      `count(): ${idFallbackCount} hit(s) in namespace "${namespace}" had none of the ` +
        `identifier fields (${COUNT_FIELDS.join(', ')}); fell back to chunk ID — result may overcount documents`
    );
  }
  return {
    count: docKeys.size,
    truncated: hits.length >= COUNT_TOP_K,
  };
}
