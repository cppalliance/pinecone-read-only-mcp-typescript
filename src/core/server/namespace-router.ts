import type { NamespaceInfo } from './namespaces-cache.js';

export type RankedNamespace = {
  namespace: string;
  score: number;
  record_count: number;
  reasons: string[];
};

/**
 * Score a namespace for relevance to the query using only:
 * - Query containing the namespace name (normalized)
 * - Query containing any of the namespace's metadata field names
 * No hardcoded namespace names or keyword lists; works for any index/namespace.
 */
function scoreNamespace(
  query: string,
  namespace: string,
  fields: string[]
): { score: number; reasons: string[] } {
  const q = query.toLowerCase();
  const name = namespace.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  const normalizedName = name.replace(/[^a-z0-9]/g, ' ').trim();
  if (normalizedName && q.includes(normalizedName)) {
    score += 3;
    reasons.push('query mentions namespace name');
  } else {
    const nameTokens = [...new Set(normalizedName.split(/\s+/).filter(Boolean))];
    for (const token of nameTokens) {
      if (token.length >= 2 && q.includes(token)) {
        score += 2;
        reasons.push(`query matches namespace token: ${token}`);
      }
    }
  }

  for (const field of fields) {
    if (q.includes(field.toLowerCase())) {
      score += 1;
      reasons.push(`field hint: ${field}`);
    }
  }

  return { score, reasons: Array.from(new Set(reasons)) };
}

/**
 * Rank namespaces by relevance to the query and return the top N.
 * Uses name and metadata-field matching; on equal score, prefers smaller (more-specific) namespaces.
 */
export function rankNamespacesByQuery(
  query: string,
  namespaces: NamespaceInfo[],
  topN: number
): RankedNamespace[] {
  const limit = Number.isFinite(topN) ? Math.max(1, Math.floor(topN)) : 1;
  return namespaces
    .map((ns) => {
      const fields = Object.keys(ns.metadata ?? {});
      const { score, reasons } = scoreNamespace(query.trim(), ns.namespace, fields);
      return {
        namespace: ns.namespace,
        score,
        record_count: ns.recordCount,
        reasons,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // On equal score, prefer the smaller (more-specific) namespace so that
      // targeted namespaces are chosen over large catch-all ones.
      return a.record_count - b.record_count;
    })
    .slice(0, limit);
}
