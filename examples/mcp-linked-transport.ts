/**
 * Minimal in-memory MCP transport pair for examples (no subprocess / stdio).
 * Each `send` delivers the JSON-RPC message to the peer's `onmessage` on a microtask.
 */

import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

export function createLinkedTransports(): {
  clientTransport: Transport;
  serverTransport: Transport;
} {
  let closed = false;
  const clientTransport: Transport = {
    onmessage: undefined,
    onclose: undefined,
    onerror: undefined,
    async start() {},
    async send(message: JSONRPCMessage) {
      if (closed) return;
      queueMicrotask(() => {
        serverTransport.onmessage?.(message);
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      clientTransport.onclose?.();
      serverTransport.onclose?.();
    },
  };

  const serverTransport: Transport = {
    onmessage: undefined,
    onclose: undefined,
    onerror: undefined,
    async start() {},
    async send(message: JSONRPCMessage) {
      if (closed) return;
      queueMicrotask(() => {
        clientTransport.onmessage?.(message);
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      clientTransport.onclose?.();
      serverTransport.onclose?.();
    },
  };

  return { clientTransport, serverTransport };
}
