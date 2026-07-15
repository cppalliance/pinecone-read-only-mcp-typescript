import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { LATEST_PROTOCOL_VERSION, type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { SERVER_NAME, SERVER_VERSION } from '../constants.js';
import { setupCoreServer, teardownServer, type ServerHandle } from '../core/setup.js';
import { setupAllianceServer } from '../alliance/setup.js';
import { resolveAllianceConfig } from '../alliance/config.js';
import { createIsolatedContext } from '../core/server/server-context.js';
import {
  createTestServerContext,
  isolateFromDefaultContext,
  makeMockPineconeClient,
} from '../core/server/tools/test-helpers.js';

/**
 * End-to-end MCP verification harness (#202).
 *
 * Drives the real `McpServer` over an in-memory transport with the SDK's own
 * `Client`, so a future SDK bump (the 2026-07-28 RC protocol revision, once it
 * ships) is verified in one place: the initialize handshake and protocol
 * negotiation, the full registered tool surface, and a round-trip tool call.
 * The protocol assertions key off the SDK's `LATEST_PROTOCOL_VERSION`, so when
 * the RC SDK is pinned they re-check the server against the new revision with no
 * edits here. If the RC is not published in time, this still guards the current
 * pinned SDK.
 */

const CORE_TOOLS = [
  'list_namespaces',
  'namespace_router',
  'count',
  'query',
  'keyword_search',
  'query_documents',
  'generate_urls',
  'guided_query',
  'suggest_query_params',
].sort();

/** A fresh, isolated core server (own context + mock client) so several can coexist. */
async function freshCoreServer(namespaces: string[] = ['ns']): Promise<ServerHandle> {
  const ctx = createTestServerContext({ client: makeMockPineconeClient(namespaces) as never });
  return setupCoreServer({ context: ctx });
}

/** Link the SDK Client to a live server over paired in-memory transports. */
async function connectClient(server: ServerHandle): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'rc-readiness-harness', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}

/** Send a raw JSON-RPC initialize and return the negotiated result. */
async function rawInitialize(
  server: ServerHandle,
  requestedProtocolVersion: string
): Promise<{ protocolVersion: string; serverInfo: { name: string; version: string } }> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  try {
    return await new Promise<{
      protocolVersion: string;
      serverInfo: { name: string; version: string };
    }>((resolve, reject) => {
      clientTransport.onmessage = (message: JSONRPCMessage) => {
        if (!('id' in message) || message.id !== 1) return;
        if ('error' in message) {
          reject(new Error(message.error.message));
        } else if ('result' in message) {
          resolve(
            message.result as {
              protocolVersion: string;
              serverInfo: { name: string; version: string };
            }
          );
        }
      };
      void clientTransport
        .start()
        .then(() =>
          clientTransport.send({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: requestedProtocolVersion,
              capabilities: {},
              clientInfo: { name: 'raw-harness', version: '0.0.0' },
            },
          })
        )
        .catch(reject);
    });
  } finally {
    await clientTransport.close();
  }
}

describe('MCP RC-readiness harness (#202)', () => {
  afterEach(() => {
    teardownServer();
    isolateFromDefaultContext();
  });

  it('initializes over the transport and round-trips server metadata', async () => {
    const server = await freshCoreServer();
    const client = await connectClient(server);

    // A resolved connect proves the initialize handshake and protocol
    // negotiation succeeded: the SDK Client throws if the server answers with a
    // protocolVersion outside SUPPORTED_PROTOCOL_VERSIONS.
    expect(client.getServerVersion()).toEqual({ name: SERVER_NAME, version: SERVER_VERSION });
    expect(client.getServerCapabilities()?.tools).toBeDefined();
    expect(client.getInstructions()).toBeTruthy();

    await client.close();
  });

  it('exposes the full core tool surface through tools/list', async () => {
    const server = await freshCoreServer();
    const client = await connectClient(server);

    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(CORE_TOOLS);

    await client.close();
  });

  it('registers the Alliance suggest_query_params tool on top of the core surface', async () => {
    const ctx = createIsolatedContext(
      resolveAllianceConfig({ apiKey: 'sk-test', indexName: 'test-index' }),
      { client: makeMockPineconeClient(['ns']) as never }
    );
    const server = await setupAllianceServer({ context: ctx });
    const client = await connectClient(server);

    const names = (await client.listTools()).tools.map((t) => t.name);
    for (const core of CORE_TOOLS) expect(names).toContain(core);
    expect(names).toContain('suggest_query_params');

    await client.close();
  });

  it('round-trips a tool call over the transport', async () => {
    const server = await freshCoreServer(['alpha', 'beta']);
    const client = await connectClient(server);

    const res = await client.callTool({ name: 'list_namespaces', arguments: {} });
    expect(res.isError ?? false).toBe(false);
    // The seeded namespaces must round-trip through the handler and transport,
    // not just any array, so a regression returning empty/garbage content fails.
    const text = (res.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    expect(text).toContain('alpha');
    expect(text).toContain('beta');

    await client.close();
  });

  it('core server executes suggest_query_params over the transport (#221)', async () => {
    // Proves the tool is not just listed but callable on a core-initialized
    // server, so a broken registration can't pass by only being enumerated.
    const server = await freshCoreServer(['wg21']);
    const client = await connectClient(server);

    const res = await client.callTool({
      name: 'suggest_query_params',
      arguments: { namespace: 'wg21', user_query: 'list papers' },
    });
    expect(res.isError ?? false).toBe(false);
    const text = (res.content as Array<{ type: string; text: string }>)[0]?.text ?? '';
    const body = JSON.parse(text) as { status?: string; namespace_found?: boolean };
    expect(body.status).toBe('success');
    expect(body.namespace_found).toBe(true);

    await client.close();
  });

  it('negotiates the SDK latest protocol version and falls back for an unknown request', async () => {
    // A server connects to one transport for its lifetime, so use a fresh one per probe.
    const negotiated = await rawInitialize(await freshCoreServer(), LATEST_PROTOCOL_VERSION);
    expect(negotiated.protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
    expect(negotiated.serverInfo).toMatchObject({ name: SERVER_NAME, version: SERVER_VERSION });

    // An unsupported request must not error; the server falls back to its latest.
    const fallback = await rawInitialize(await freshCoreServer(), 'not-a-real-protocol-version');
    expect(fallback.protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
  });
});
