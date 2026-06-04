import { getDefaultServerContext, type NamespaceInfo } from './server-context.js';

export type { NamespaceInfo };

/**
 * Return namespace list with metadata; uses an in-memory cache whose TTL is
 * sourced from the active `ServerConfig.cacheTtlMs`.
 */
export async function getNamespacesWithCache(): Promise<{
  data: NamespaceInfo[];
  cache_hit: boolean;
  expires_at: number;
}> {
  return getDefaultServerContext().getNamespacesWithCache();
}

/** Clear the namespaces cache so the next call to getNamespacesWithCache refetches. */
export function invalidateNamespacesCache(): void {
  getDefaultServerContext().invalidateNamespacesCache();
}
