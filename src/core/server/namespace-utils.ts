/**
 * Shared namespace string handling for the suggest-flow gate and Pinecone tool calls.
 */

/**
 * Trim surrounding whitespace. Returns `null` if the result is empty
 * (callers should map this to a VALIDATION tool error).
 */
export function normalizeNamespace(input: string): string | null {
  const trimmed = input.trim();
  return trimmed.length === 0 ? null : trimmed;
}
