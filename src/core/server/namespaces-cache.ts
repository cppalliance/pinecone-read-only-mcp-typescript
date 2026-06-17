import { getDefaultServerContext, type NamespaceInfo } from './server-context.js';

export type { NamespaceInfo };

/**
 * Return namespace list with metadata; uses an in-memory cache whose TTL is
 * sourced from the active `ServerConfig.cacheTtlMs`.
 *
 * @deprecated Legacy module facade. Use {@link ServerContext.getNamespacesWithCache} on a
 * {@link ServerContext} from {@link createServer} instead. Removal follows
 * docs/deprecation-policy.md (no earlier than two minor releases after the
 * deprecation minor). See docs/MIGRATION.md#unreleased-legacy-module-facade-deprecations.
 * @see ServerContext.getNamespacesWithCache
 */
export async function getNamespacesWithCache(): Promise<{
  data: NamespaceInfo[];
  cache_hit: boolean;
  expires_at: number;
}> {
  return getDefaultServerContext().getNamespacesWithCache();
}

/**
 * Clear the namespaces cache so the next call to getNamespacesWithCache refetches.
 *
 * @deprecated Legacy module facade. Use {@link ServerContext.invalidateNamespacesCache} on a
 * {@link ServerContext} from {@link createServer} instead. Removal follows
 * docs/deprecation-policy.md (no earlier than two minor releases after the
 * deprecation minor). See docs/MIGRATION.md#unreleased-legacy-module-facade-deprecations.
 * @see ServerContext.invalidateNamespacesCache
 */
export function invalidateNamespacesCache(): void {
  getDefaultServerContext().invalidateNamespacesCache();
}
