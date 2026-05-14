/**
 * Shared formatting of Pinecone SearchResult into QueryResponse result rows.
 * Used by query tool and guided_query to avoid duplicated identifier/title/author/url logic.
 */

import type { PineconeMetadataValue, SearchResult } from '../types.js';
import { warn as logWarn } from '../logger.js';
import { generateUrlForNamespace } from './url-generation.js';

const DEFAULT_CONTENT_MAX_LENGTH = 2000;

/**
 * One formatted query-result row.
 *
 * `document_id` is the canonical identifier. `paper_number` is a deprecated
 * alias kept for one minor cycle for backwards compatibility — it will be
 * removed in the next major release.
 */
export interface QueryResultRow {
  /** Canonical document identifier. Prefer this in new code. */
  document_id: string | null;
  /**
   * @deprecated Use `document_id`. Kept for one minor cycle and removed in
   * the next major release. The first time a row is emitted with this alias
   * during a session, a `WARN` log is fired so consumers see the deadline.
   */
  paper_number: string | null;
  title: string;
  author: string;
  url: string;
  content: string;
  score: number;
  reranked: boolean;
  metadata?: Record<string, PineconeMetadataValue>;
}

let deprecationWarnedThisSession = false;

/**
 * Reset the once-per-session deprecation latch. Test-only.
 *
 * Production code should never need this; the latch is intentionally process-
 * lived so noisy LLM clients only see the warning once.
 */
export function resetPaperNumberDeprecationLatchForTests(): void {
  deprecationWarnedThisSession = false;
}

/**
 * Format a single search result into a QueryResponse result row.
 * Optionally enrich url using the namespace URL generator when metadata.url is missing (if supported).
 */
export function formatSearchResultAsRow(
  doc: SearchResult,
  options?: {
    namespace?: string;
    enrichUrls?: boolean;
    contentMaxLength?: number;
  }
): QueryResultRow {
  const contentMaxLength = options?.contentMaxLength ?? DEFAULT_CONTENT_MAX_LENGTH;
  const metadata = { ...doc.metadata } as Record<string, PineconeMetadataValue>;

  if (options?.enrichUrls && options?.namespace) {
    const generated = generateUrlForNamespace(options.namespace, metadata);
    const existingUrl = metadata['url'];
    const urlIsBlank = typeof existingUrl !== 'string' || existingUrl.trim() === '';
    if (generated.url && urlIsBlank) {
      metadata['url'] = generated.url;
    }
  }

  const docNum = metadata['document_number'];
  const filename = metadata['filename'];
  const document_id =
    (typeof docNum === 'string' && docNum.length > 0 ? docNum : null) ??
    (typeof filename === 'string' && filename.length > 0
      ? filename.replace(/\.md$/i, '').toUpperCase()
      : null) ??
    null;

  if (document_id !== null && !deprecationWarnedThisSession) {
    deprecationWarnedThisSession = true;
    logWarn(
      'paper_number is deprecated and will be removed in the next major release; use document_id instead.'
    );
  }

  return {
    document_id,
    paper_number: document_id,
    title: String(metadata['title'] ?? ''),
    author: String(metadata['author'] ?? ''),
    url: String(metadata['url'] ?? ''),
    content: doc.content.substring(0, contentMaxLength),
    score: Math.round(doc.score * 10000) / 10000,
    reranked: doc.reranked,
    metadata,
  };
}

/**
 * Format an array of search results into QueryResponse result rows.
 */
export function formatQueryResultRows(
  results: SearchResult[],
  options?: {
    namespace?: string;
    enrichUrls?: boolean;
    contentMaxLength?: number;
  }
): QueryResultRow[] {
  return results.map((doc) => formatSearchResultAsRow(doc, options));
}
