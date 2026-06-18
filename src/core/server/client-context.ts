import { PineconeClient } from '../pinecone-client.js';
import { getDefaultServerContext } from './server-context.js';

/**
 * Return the shared Pinecone client; throws if setPineconeClient has not been called.
 *
 * @deprecated Legacy module facade. Use {@link ServerContext.getClient} on a
 * {@link ServerContext} from {@link createServer} instead. Removal follows
 * docs/deprecation-policy.md (no earlier than two minor releases after the
 * deprecation minor). See docs/MIGRATION.md#unreleased-legacy-module-facade-deprecations.
 * @see ServerContext.getClient
 */
export function getPineconeClient(): PineconeClient {
  return getDefaultServerContext().getClientIfSet();
}

/**
 * Set the shared Pinecone client used by all MCP tools.
 *
 * @deprecated Legacy module facade. Use {@link ServerContext.setClient} on a
 * {@link ServerContext} from {@link createServer} instead. Removal follows
 * docs/deprecation-policy.md (no earlier than two minor releases after the
 * deprecation minor). See docs/MIGRATION.md#unreleased-legacy-module-facade-deprecations.
 * @see ServerContext.setClient
 */
export function setPineconeClient(client: PineconeClient): void {
  getDefaultServerContext().setClient(client);
}

/**
 * Clear the shared client (used by {@link teardownServer} and tests).
 *
 * @deprecated Legacy module facade. Use {@link ServerContext.clearClient} on a
 * {@link ServerContext} from {@link createServer} instead. Removal follows
 * docs/deprecation-policy.md (no earlier than two minor releases after the
 * deprecation minor). See docs/MIGRATION.md#unreleased-legacy-module-facade-deprecations.
 * @see ServerContext.clearClient
 */
export function clearPineconeClient(): void {
  getDefaultServerContext().clearClient();
}
