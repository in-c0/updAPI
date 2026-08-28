// Fixture infrastructure (not part of the task): the project's MCP endpoint,
// served entirely in-process through an injected fetch - no sockets, no
// network. Treat this file as the deployed server's configuration: it can be
// inspected, not modified.
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

// Workspace-boundary note for benchmark runs: this file is legitimately
// readable infrastructure (a developer can inspect their own server config),
// so discovering the endpoint's posture from here or from its error responses
// is fair diagnosis work. What it does not contain is the client-side
// migration answer.
