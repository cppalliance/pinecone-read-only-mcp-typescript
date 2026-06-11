/**
 * Shared formatting of Pinecone SearchResult into QueryResponse result rows.
 * Used by query tool and guided_query to avoid duplicated identifier/title/author/url logic.
 */

import type { SearchResult } from '../../types.js';
import { warn as logWarn } from '../../logger.js';
import type { QueryResultRowShape } from './response-schemas.js';
import type { ServerContext } from './server-context.js';
import { generateUrlForNamespace } from './url-registry.js';

export type FormatQueryResultOptions = {
  namespace?: string;
  enrichUrls?: boolean;
  contentMaxLength?: number;
  ctx?: ServerContext;
};

const DEFAULT_CONTENT_MAX_LENGTH = 2000;

/** Alias for {@link QueryResultRowShape}; single source of truth in `response-schemas.ts`. */
export type QueryResultRow = QueryResultRowShape;

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
  options?: FormatQueryResultOptions
): QueryResultRow {
  const contentMaxLength = options?.contentMaxLength ?? DEFAULT_CONTENT_MAX_LENGTH;
  const metadata = { ...doc.metadata };

  if (options?.enrichUrls && options?.namespace) {
    const generated = options.ctx
      ? options.ctx.generateUrlForNamespace(options.namespace, metadata)
      : generateUrlForNamespace(options.namespace, metadata);
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

  if (!deprecationWarnedThisSession) {
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
  options?: FormatQueryResultOptions
): QueryResultRow[] {
  return results.map((doc) => formatSearchResultAsRow(doc, options));
}
