// Fixture infrastructure (not part of the task): a local, modern-only MCP
// endpoint served entirely in-process.
//
// createMcpHandler serves the 2026-07-28 protocol revision from a per-request
// server factory; `legacy: 'reject'` makes the endpoint modern-only strict, so
// 2025-era traffic (the plain `initialize` handshake) is rejected rather than
// served. `handler.fetch` is the web-standard face, which means the whole
// exchange can run through an injected fetch with no sockets and no network.
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';

export const SERVER_NAME = 'updapi-fixture-server';
export const SERVER_VERSION = '1.2.3';
export const SERVER_URL = 'http://updapi-fixture.internal/mcp';

const handler = createMcpHandler(
  () => new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }),
  { legacy: 'reject' }
);

/** In-process fetch implementation routing every request to the endpoint. */
export const serverFetch = (input, init) => handler.fetch(new Request(input, init));
