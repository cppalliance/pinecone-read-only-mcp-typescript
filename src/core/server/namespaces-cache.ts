import { warnLegacyFacade } from './legacy-facade-warn.js';
import { resolveDefaultServerContext, type NamespaceInfo } from './server-context.js';

export type { NamespaceInfo };

/**
 * Return namespace list with metadata; uses an in-memory cache whose TTL is
 * sourced from the active `ServerConfig.cacheTtlMs`.
 *
 * @deprecated since 0.3.0 — removal no earlier than 0.5.0. Legacy module facade. Use
 * {@link ServerContext.getNamespacesWithCache} on a {@link ServerContext} from
 * {@link createServer} instead. See docs/MIGRATION.md#030-legacy-module-facade-deprecations.
 * @see ServerContext.getNamespacesWithCache
 */
export async function getNamespacesWithCache(): Promise<{
  data: NamespaceInfo[];
  cache_hit: boolean;
  expires_at: number;
}> {
  warnLegacyFacade('getNamespacesWithCache');
  return resolveDefaultServerContext().getNamespacesWithCache();
}

/**
 * Clear the namespaces cache so the next call to getNamespacesWithCache refetches.
 *
 * @deprecated since 0.3.0 — removal no earlier than 0.5.0. Legacy module facade. Use
 * {@link ServerContext.invalidateNamespacesCache} on a {@link ServerContext} from
 * {@link createServer} instead. See docs/MIGRATION.md#030-legacy-module-facade-deprecations.
 * @see ServerContext.invalidateNamespacesCache
 */
export function invalidateNamespacesCache(): void {
  warnLegacyFacade('invalidateNamespacesCache');
  resolveDefaultServerContext().invalidateNamespacesCache();
}
