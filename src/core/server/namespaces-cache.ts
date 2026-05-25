import { getServerConfig } from './config-context.js';
import { getPineconeClient } from './client-context.js';

export type NamespaceInfo = {
  namespace: string;
  recordCount: number;
  metadata: Record<string, string>;
};

type CacheEntry = {
  data: NamespaceInfo[];
  expiresAt: number;
};

let namespacesCache: CacheEntry | null = null;

/**
 * Return namespace list with metadata; uses an in-memory cache whose TTL is
 * sourced from the active `ServerConfig.cacheTtlMs`.
 */
export async function getNamespacesWithCache(): Promise<{
  data: NamespaceInfo[];
  cache_hit: boolean;
  expires_at: number;
}> {
  const now = Date.now();
  if (namespacesCache && now < namespacesCache.expiresAt) {
    return {
      data: namespacesCache.data,
      cache_hit: true,
      expires_at: namespacesCache.expiresAt,
    };
  }

  const client = getPineconeClient();
  const data = await client.listNamespacesWithMetadata();
  const ttlMs = getServerConfig().cacheTtlMs;
  const expiresAt = now + ttlMs;
  namespacesCache = { data, expiresAt };
  return { data, cache_hit: false, expires_at: expiresAt };
}

/** Clear the namespaces cache so the next call to getNamespacesWithCache refetches. */
export function invalidateNamespacesCache(): void {
  namespacesCache = null;
}
