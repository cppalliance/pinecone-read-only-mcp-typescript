/**
 * Per-namespace URL generation registry (generic API).
 *
 * Domain-specific built-in generators live in `src/alliance/url-builtins.ts`.
 * Library consumers can plug in their own with `registerUrlGenerator(namespace, generator)`.
 */

import { getDefaultServerContext } from './server-context.js';

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

/**
 * Clear all URL generators.
 * Used by {@link teardownServer} so a subsequent setup can reinstall generators.
 *
 * @deprecated Legacy module facade. Use {@link ServerContext.resetUrlGenerators} on a
 * {@link ServerContext} from {@link createServer} instead. Removal follows
 * docs/deprecation-policy.md (no earlier than two minor releases after the
 * deprecation minor). See docs/MIGRATION.md#unreleased-legacy-module-facade-deprecations.
 * @see ServerContext.resetUrlGenerators
 */
export function resetUrlGenerationRegistry(): void {
  getDefaultServerContext().resetUrlGenerators();
}

/**
 * Register a URL generator for a namespace, replacing any existing entry.
 *
 * @param namespace exact namespace name (matches the value returned by `list_namespaces`).
 * @param generator function that turns a record's metadata into a URL ({@link UrlGeneratorFn}).
 * @deprecated Legacy module facade. Use {@link ServerContext.registerUrlGenerator} on a
 * {@link ServerContext} from {@link createServer} instead. Removal follows
 * docs/deprecation-policy.md (no earlier than two minor releases after the
 * deprecation minor). See docs/MIGRATION.md#unreleased-legacy-module-facade-deprecations.
 * @see ServerContext.registerUrlGenerator
 */
export function registerUrlGenerator(namespace: string, generator: UrlGeneratorFn): void {
  getDefaultServerContext().registerUrlGenerator(namespace, generator);
}

/**
 * Remove a namespace's URL generator. Returns true if a generator was removed.
 *
 * @deprecated Legacy module facade. Use {@link ServerContext.unregisterUrlGenerator} on a
 * {@link ServerContext} from {@link createServer} instead. Removal follows
 * docs/deprecation-policy.md (no earlier than two minor releases after the
 * deprecation minor). See docs/MIGRATION.md#unreleased-legacy-module-facade-deprecations.
 * @see ServerContext.unregisterUrlGenerator
 */
export function unregisterUrlGenerator(namespace: string): boolean {
  return getDefaultServerContext().unregisterUrlGenerator(namespace);
}

/**
 * True when the namespace has a registered URL generator (does not consider `metadata.url`).
 *
 * @deprecated Legacy module facade. Use {@link ServerContext.hasUrlGenerator} on a
 * {@link ServerContext} from {@link createServer} instead. Removal follows
 * docs/deprecation-policy.md (no earlier than two minor releases after the
 * deprecation minor). See docs/MIGRATION.md#unreleased-legacy-module-facade-deprecations.
 * @see ServerContext.hasUrlGenerator
 */
export function hasUrlGenerator(namespace: string): boolean {
  return getDefaultServerContext().hasUrlGenerator(namespace);
}

/**
 * Generate a URL for a record in the given namespace when metadata.url is missing.
 * Uses the registry of URL generators; returns unavailable for namespaces without a generator.
 *
 * @deprecated Legacy module facade. Use {@link ServerContext.generateUrlForNamespace} on a
 * {@link ServerContext} from {@link createServer} instead. Removal follows
 * docs/deprecation-policy.md (no earlier than two minor releases after the
 * deprecation minor). See docs/MIGRATION.md#unreleased-legacy-module-facade-deprecations.
 * @see ServerContext.generateUrlForNamespace
 */
export function generateUrlForNamespace(
  namespace: string,
  metadata: Record<string, unknown>
): UrlGenerationResult {
  return getDefaultServerContext().generateUrlForNamespace(namespace, metadata);
}
