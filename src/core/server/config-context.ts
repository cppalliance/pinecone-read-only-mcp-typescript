import type { ServerConfig } from '../config.js';
import {
  getDefaultServerContext,
  setDefaultServerContext,
  setPendingServerConfig,
} from './server-context.js';

/**
 * Replace the process-global server config (called from setup with CLI/env-derived config).
 *
 * @deprecated Legacy module facade. Use {@link ServerContext.setConfig} on a
 * {@link ServerContext} from {@link createServer} instead. Removal follows
 * docs/deprecation-policy.md (no earlier than two minor releases after the
 * deprecation minor). See docs/MIGRATION.md#unreleased-legacy-module-facade-deprecations.
 * @see ServerContext.setConfig
 */
export function setServerConfig(config: ServerConfig): void {
  setPendingServerConfig(config);
}

/**
 * Clear active config so the next `getServerConfig()` resolves again (used by {@link teardownServer}).
 *
 * @deprecated Legacy module facade. Use {@link ServerContext.teardown} on a
 * {@link ServerContext} from {@link createServer} instead. Removal follows
 * docs/deprecation-policy.md (no earlier than two minor releases after the
 * deprecation minor). See docs/MIGRATION.md#unreleased-legacy-module-facade-deprecations.
 * @see ServerContext.teardown
 */
export function resetServerConfig(): void {
  setDefaultServerContext(null);
}

/**
 * Active server config for modules that cannot receive `ServerConfig` through parameters
 * (namespace cache TTL, suggest-flow gate, etc.).
 *
 * When setup runs without an explicit config, falls back to `resolveConfig({})`
 * (requires `PINECONE_API_KEY` and `PINECONE_INDEX_NAME` or throws). Alliance apps should
 * pass config from `resolveAllianceConfig()` into `setupAllianceServer(config)`.
 *
 * @deprecated Legacy module facade. Use {@link ServerContext.getConfig} on a
 * {@link ServerContext} from {@link createServer} instead. Removal follows
 * docs/deprecation-policy.md (no earlier than two minor releases after the
 * deprecation minor). See docs/MIGRATION.md#unreleased-legacy-module-facade-deprecations.
 * @see ServerContext.getConfig
 */
export function getServerConfig(): ServerConfig {
  return getDefaultServerContext().getConfig();
}
