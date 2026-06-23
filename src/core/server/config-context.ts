import type { ServerConfig } from '../config.js';
import { warnLegacyFacade } from './legacy-facade-warn.js';
import {
  resolveDefaultServerContext,
  setDefaultServerContext,
  setPendingServerConfig,
} from './server-context.js';

/**
 * Replace the process-global server config (called from setup with CLI/env-derived config).
 *
 * @deprecated since 0.3.0 — removal no earlier than 0.5.0. Legacy module facade. Use
 * {@link ServerContext.setConfig} on a {@link ServerContext} from {@link createServer}
 * instead. See docs/MIGRATION.md#030-legacy-module-facade-deprecations.
 * @see ServerContext.setConfig
 */
export function setServerConfig(config: ServerConfig): void {
  warnLegacyFacade('setServerConfig');
  setPendingServerConfig(config);
}

/**
 * Clear active config so the next `getServerConfig()` resolves again (used by {@link teardownServer}).
 *
 * @deprecated since 0.3.0 — removal no earlier than 0.5.0. Legacy module facade. Use
 * {@link ServerContext.teardown} on a {@link ServerContext} from {@link createServer}
 * instead. See docs/MIGRATION.md#030-legacy-module-facade-deprecations.
 * @see ServerContext.teardown
 */
export function resetServerConfig(): void {
  warnLegacyFacade('resetServerConfig');
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
 * @deprecated since 0.3.0 — removal no earlier than 0.5.0. Legacy module facade. Use
 * {@link ServerContext.getConfig} on a {@link ServerContext} from {@link createServer}
 * instead. See docs/MIGRATION.md#030-legacy-module-facade-deprecations.
 * @see ServerContext.getConfig
 */
export function getServerConfig(): ServerConfig {
  warnLegacyFacade('getServerConfig');
  return resolveDefaultServerContext().getConfig();
}
