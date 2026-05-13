import type { ServerConfig } from '../config.js';
import { resolveConfig } from '../config.js';

let activeConfig: ServerConfig | null = null;

/** Replace the process-global server config (called from `setupServer` with CLI/env-derived config). */
export function setServerConfig(config: ServerConfig): void {
  activeConfig = config;
}

/**
 * Active server config for modules that cannot receive `ServerConfig` through parameters
 * (namespace cache TTL, suggest-flow gate, etc.).
 *
 * When `setupServer()` runs without an explicit config, falls back to `resolveConfig({})`
 * so env defaults still apply. That requires `PINECONE_API_KEY` (or the call throws); embedders
 * should pass `config` into `setupServer(config)` when env is not set.
 */
export function getServerConfig(): ServerConfig {
  if (!activeConfig) {
    activeConfig = resolveConfig({});
  }
  return activeConfig;
}
