/**
 * Reassemble chunk-level search results into document-level results.
 * Groups by document identity (document_number / doc_id / url) and merges chunk content
 * for content analysis (summarization, full-document Q&A, etc.).
 */

import type { PineconeMetadataValue, SearchResult } from '../../types.js';
import { warn as logWarn } from '../../logger.js';

/** Default metadata keys tried for chunk ordering (RecursiveCharacterTextSplitter often adds these). */
const CHUNK_ORDER_KEYS = ['chunk_index', 'start_index', 'loc'] as const;

/** Max vector ids listed in the one-per-call skip warning (for grep-friendly debugging). */
const SKIP_WARN_SAMPLE_IDS = 3;

/** Derive a stable document key from hit metadata: document_number → url → doc_id → hit.id. */
function getDocumentKey(hit: SearchResult): string {
  const m = hit.metadata || {};
  const docNumber = m['document_number'];
  const url = m['url'];
  const docId = m['doc_id'];
  const nonEmpty = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() !== '' ? v : undefined;

  return nonEmpty(docNumber) ?? nonEmpty(url) ?? nonEmpty(docId) ?? nonEmpty(hit.id) ?? '';
}

/** Return a numeric order for sorting chunks from metadata (chunk_index, start_index, or loc). */
function getChunkOrder(metadata: Record<string, PineconeMetadataValue>): number {
  for (const key of CHUNK_ORDER_KEYS) {
    const v = metadata[key];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && /^\d+$/.test(v)) return parseInt(v, 10);
  }
  return -1;
}

export interface ReassembledDocument {
  /** Document identity (document_number, doc_id, or url). */
  document_id: string;
  /** Merged content from all chunks (ordered by chunk_index when available). */
  merged_content: string;
  /** Metadata from the first chunk (title, author, url, etc.). */
  metadata: Record<string, PineconeMetadataValue>;
  /** Number of chunks merged. */
  chunk_count: number;
  /** Best score among chunks (for ranking documents). */
  best_score: number;
}

/**
 * Group search results by document and merge chunk content.
 * Chunks are ordered by metadata chunk_index (or similar) when present; otherwise retrieval order.
 *
 * Document identity is derived in priority order: document_number → url → doc_id → hit.id.
 * Chunks whose metadata contains none of the first three keys are grouped by their raw vector ID,
 * so each such chunk becomes its own single-chunk "document" in the output.
 */
export function reassembleByDocument(
  results: SearchResult[],
  options?: {
    /** Max chunks to merge per document (avoids huge payloads). Default 200. */
    maxChunksPerDocument?: number;
    /** Separator between chunk contents. Default double newline. */
    contentSeparator?: string;
  }
): ReassembledDocument[] {
  const maxChunks = Math.max(1, options?.maxChunksPerDocument ?? 200);
  const separator = options?.contentSeparator ?? '\n\n';

  const byDoc = new Map<string, SearchResult[]>();
  let skippedHits = 0;
  const sampleIdsForWarn: string[] = [];

  for (const hit of results) {
    const key = getDocumentKey(hit);
    if (!key) {
      skippedHits++;
      if (sampleIdsForWarn.length < SKIP_WARN_SAMPLE_IDS) {
        sampleIdsForWarn.push(hit.id.trim() === '' ? '<empty>' : hit.id);
      }
      continue;
    }
    let list = byDoc.get(key);
    if (!list) {
      list = [];
      byDoc.set(key, list);
    }
    list.push(hit);
  }

  if (skippedHits > 0) {
    const sample = sampleIdsForWarn.length > 0 ? ` sample_ids=${sampleIdsForWarn.join(',')}` : '';
    logWarn(
      `reassembleByDocument: skipped ${skippedHits} hit(s) with no document key (document_number, url, doc_id, or non-empty vector id).${sample}`
    );
  }

  const out: ReassembledDocument[] = [];

  for (const [docId, chunks] of byDoc) {
    const sorted = [...chunks].sort((a, b) => {
      const orderA = getChunkOrder(a.metadata ?? {});
      const orderB = getChunkOrder(b.metadata ?? {});
      if (orderA >= 0 && orderB >= 0) return orderA - orderB;
      if (orderA >= 0) return -1;
      if (orderB >= 0) return 1;
      return 0;
    });

    const toMerge = sorted.slice(0, maxChunks);
    const merged_content = toMerge
      .map((c) => c.content.trim())
      .filter(Boolean)
      .join(separator);
    const first = toMerge[0];
    const best_score = Math.max(...toMerge.map((c) => c.score));

    out.push({
      document_id: docId,
      merged_content,
      metadata: (first?.metadata ?? {}) as Record<string, PineconeMetadataValue>,
      chunk_count: toMerge.length,
      best_score: Math.round(best_score * 10000) / 10000,
    });
  }

  return out;
}
