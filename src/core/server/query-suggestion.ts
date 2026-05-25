import { COUNT_FIELDS } from '../../constants.js';

/** Values returned by `suggest_query_params` / suggestion flow; align with `query` tool `preset`. */
export type RecommendedTool = 'count' | 'fast' | 'detailed' | 'full';

/** Suggested query params from namespace schema and user query. */
export type SuggestQueryParamsResult = {
  suggested_fields: string[];
  use_count_tool: boolean;
  recommended_tool: RecommendedTool;
  explanation: string;
  namespace_found: boolean;
};

/**
 * Suggests which fields to request and whether to use the count tool,
 * based on the namespace's available metadata fields (from list_namespaces) and the user's natural language query.
 */
export function suggestQueryParams(
  namespaceMetadataFields: Record<string, string> | null,
  userQuery: string
): SuggestQueryParamsResult {
  const q = userQuery.toLowerCase().trim();
  const available = namespaceMetadataFields ? Object.keys(namespaceMetadataFields) : [];
  const keepOnlyAvailable = (fields: string[]) => fields.filter((f) => available.includes(f));

  if (!namespaceMetadataFields) {
    return {
      suggested_fields: [],
      use_count_tool: false,
      recommended_tool: 'fast',
      explanation:
        'Namespace not found or has no metadata fields. Call list_namespaces first, then pass a valid namespace.',
      namespace_found: false,
    };
  }
  if (available.length === 0) {
    return {
      suggested_fields: [],
      use_count_tool: false,
      recommended_tool: 'fast',
      explanation:
        'Namespace has no metadata fields. Use list_namespaces to verify the namespace is correct.',
      namespace_found: true,
    };
  }

  // Count intent: "how many", "count", "number of", etc.
  if (/\b(how many|count|number of|total number|documents? count|records? count)\b/.test(q)) {
    const fields = keepOnlyAvailable([...COUNT_FIELDS]);
    return {
      suggested_fields: fields.length ? fields : available.slice(0, 5),
      use_count_tool: true,
      recommended_tool: 'count',
      explanation:
        'User asked for a count. Use the count tool for this. If using query instead, use minimal fields (no chunk_text).',
      namespace_found: true,
    };
  }

  // Content intent: user wants to read/summarize content
  if (
    /\b(content|summarize|summarise|what does|excerpt|text|say|details?|full text|body)\b/.test(q)
  ) {
    const fields = keepOnlyAvailable(['document_number', 'title', 'url', 'author', 'chunk_text']);
    return {
      suggested_fields: fields.length ? fields : available,
      use_count_tool: false,
      recommended_tool: 'detailed',
      explanation: 'User asked for content or details; include chunk_text for snippets.',
      namespace_found: true,
    };
  }

  // List/browse intent: titles, links, list (minimal fields, no content)
  const listFields = keepOnlyAvailable(['document_number', 'title', 'url', 'author']);
  return {
    suggested_fields: listFields.length ? listFields : available.slice(0, 5),
    use_count_tool: false,
    recommended_tool: 'fast',
    explanation:
      'User asked for a list or browse; use minimal fields (no chunk_text) for smaller payload and cost.',
    namespace_found: true,
  };
}
