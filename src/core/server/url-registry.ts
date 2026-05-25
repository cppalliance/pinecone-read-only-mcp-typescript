/**
 * Per-namespace URL generation registry (generic API).
 *
 * Domain-specific built-in generators live in `src/alliance/url-builtins.ts`.
 * Library consumers can plug in their own with `registerUrlGenerator(namespace, generator)`.
 */

/** Outcome of a URL-generation attempt. */
export type UrlGenerationResult = {
  url: string | null;
  method:
    | 'metadata.url'
    | 'metadata.source'
    | 'generated.mailing'
    | 'generated.slack'
    | 'generated.custom'
    | 'unavailable';
  reason?: string;
};

/**
 * Function that builds a URL for a record's metadata.
 *
 * Custom generators may return any of the standard `method` values, plus
 * `'generated.custom'` for namespace-specific generators registered by
 * library consumers.
 */
export type UrlGenerator = (metadata: Record<string, unknown>) => UrlGenerationResult;

/**
 * Alias for {@link UrlGenerator} (issue / API naming: `UrlGeneratorFn`).
 * Use either type when implementing custom URL synthesis.
 */
export type UrlGeneratorFn = UrlGenerator;

/** Registry of namespace -> URL generator. */
const urlGenerators = new Map<string, UrlGeneratorFn>();

/** Return a trimmed non-empty string or null for empty/missing values. */
function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Clear all URL generators.
 * Used by {@link teardownServer} so a subsequent setup can reinstall generators.
 */
export function resetUrlGenerationRegistry(): void {
  urlGenerators.clear();
}

/**
 * Register a URL generator for a namespace, replacing any existing entry.
 *
 * @param namespace exact namespace name (matches the value returned by `list_namespaces`).
 * @param generator function that turns a record's metadata into a URL ({@link UrlGeneratorFn}).
 */
export function registerUrlGenerator(namespace: string, generator: UrlGeneratorFn): void {
  const normalizedNamespace = namespace.trim();
  if (normalizedNamespace.length === 0) {
    throw new TypeError('namespace must be a non-empty string');
  }
  if (typeof generator !== 'function') {
    throw new TypeError('generator must be a function');
  }
  urlGenerators.set(normalizedNamespace, generator);
}

/** Remove a namespace's URL generator. Returns true if a generator was removed. */
export function unregisterUrlGenerator(namespace: string): boolean {
  return urlGenerators.delete(namespace);
}

/** True when the namespace has a registered URL generator (does not consider `metadata.url`). */
export function hasUrlGenerator(namespace: string): boolean {
  return urlGenerators.has(namespace);
}

/**
 * Generate a URL for a record in the given namespace when metadata.url is missing.
 * Uses the registry of URL generators; returns unavailable for namespaces without a generator.
 */
export function generateUrlForNamespace(
  namespace: string,
  metadata: Record<string, unknown>
): UrlGenerationResult {
  const existingUrl = asString(metadata['url']);
  if (existingUrl) {
    return { url: existingUrl, method: 'metadata.url' };
  }

  const generator = urlGenerators.get(namespace);
  if (generator) {
    return generator(metadata);
  }

  return {
    url: null,
    method: 'unavailable',
    reason: `URL generation is not supported for namespace "${namespace}"`,
  };
}
