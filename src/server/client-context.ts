import { PineconeClient } from '../pinecone-client.js';

// Global Pinecone client (initialized lazily)
let pineconeClient: PineconeClient | null = null;

/** Return the shared Pinecone client; throws if setPineconeClient has not been called. */
export function getPineconeClient(): PineconeClient {
  if (!pineconeClient) {
    throw new Error('Pinecone client not initialized. Call setPineconeClient first.');
  }
  return pineconeClient;
}

/** Set the shared Pinecone client used by all MCP tools. */
export function setPineconeClient(client: PineconeClient): void {
  pineconeClient = client;
}

/** Clear the shared client (used by {@link teardownServer} and tests). */
export function clearPineconeClient(): void {
  pineconeClient = null;
}
