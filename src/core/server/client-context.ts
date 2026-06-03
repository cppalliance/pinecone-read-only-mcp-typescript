import { PineconeClient } from '../pinecone-client.js';
import { getDefaultServerContext } from './server-context.js';

/** Return the shared Pinecone client; throws if setPineconeClient has not been called. */
export function getPineconeClient(): PineconeClient {
  return getDefaultServerContext().getClientIfSet();
}

/** Set the shared Pinecone client used by all MCP tools. */
export function setPineconeClient(client: PineconeClient): void {
  getDefaultServerContext().setClient(client);
}

/** Clear the shared client (used by {@link teardownServer} and tests). */
export function clearPineconeClient(): void {
  getDefaultServerContext().clearClient();
}
