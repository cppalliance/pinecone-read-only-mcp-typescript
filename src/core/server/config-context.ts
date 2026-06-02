import type { ServerConfig } from '../config.js';
import { resolveConfig } from '../config.js';

let activeConfig: ServerConfig | null = null;

/** Replace the process-global server config (called from setup with CLI/env-derived config). */
export function setServerConfig(config: ServerConfig): void {
  activeConfig = config;
}

/** Clear active config so the next `getServerConfig()` resolves again (used by {@link teardownServer}). */
export function resetServerConfig(): void {
  activeConfig = null;
}

/**
 * Active server config for modules that cannot receive `ServerConfig` through parameters
 * (namespace cache TTL, suggest-flow gate, etc.).
 *
 * When setup runs without an explicit config, falls back to `resolveConfig({})`
 * (requires `PINECONE_API_KEY` and `PINECONE_INDEX_NAME` or throws). Alliance apps should
 * pass config from `resolveAllianceConfig()` into `setupAllianceServer(config)`.
 */
export function getServerConfig(): ServerConfig {
  if (!activeConfig) {
    activeConfig = resolveConfig({});
  }
  return activeConfig;
}
