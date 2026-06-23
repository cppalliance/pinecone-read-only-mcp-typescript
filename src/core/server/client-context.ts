import { PineconeClient } from '../pinecone-client.js';
import { warnLegacyFacade } from './legacy-facade-warn.js';
import { resolveDefaultServerContext } from './server-context.js';

/**
 * Return the shared Pinecone client; throws if setPineconeClient has not been called.
 *
 * @deprecated since 0.3.0 — removal no earlier than 0.5.0. Legacy module facade. Use
 * {@link ServerContext.getClient} on a {@link ServerContext} from {@link createServer}
 * instead. See docs/MIGRATION.md#030-legacy-module-facade-deprecations.
 * @see ServerContext.getClient
 */
export function getPineconeClient(): PineconeClient {
  warnLegacyFacade('getPineconeClient');
  return resolveDefaultServerContext().getClientIfSet();
}

/**
 * Set the shared Pinecone client used by all MCP tools.
 *
 * @deprecated since 0.3.0 — removal no earlier than 0.5.0. Legacy module facade. Use
 * {@link ServerContext.setClient} on a {@link ServerContext} from {@link createServer}
 * instead. See docs/MIGRATION.md#030-legacy-module-facade-deprecations.
 * @see ServerContext.setClient
 */
export function setPineconeClient(client: PineconeClient): void {
  warnLegacyFacade('setPineconeClient');
  resolveDefaultServerContext().setClient(client);
}

/**
 * Clear the shared client (used by {@link teardownServer} and tests).
 *
 * @deprecated since 0.3.0 — removal no earlier than 0.5.0. Legacy module facade. Use
 * {@link ServerContext.clearClient} on a {@link ServerContext} from {@link createServer}
 * instead. See docs/MIGRATION.md#030-legacy-module-facade-deprecations.
 * @see ServerContext.clearClient
 */
export function clearPineconeClient(): void {
  warnLegacyFacade('clearPineconeClient');
  resolveDefaultServerContext().clearClient();
}
