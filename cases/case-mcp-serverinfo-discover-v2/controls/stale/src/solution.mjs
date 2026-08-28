// KNOWN-STALE CONTROL - connects the pre-2026-07-28 way.
// This is exactly the idiomatic 2025 client pattern: a default Client (no
// version negotiation) whose connect() runs the plain `initialize` handshake.
// Against a modern-only strict endpoint that handshake is rejected, so the
// connection hard-fails before any identity can be read.
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

export async function getServerIdentity({ url, fetch }) {
  const client = new Client({ name: 'updapi-case-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(url), { fetch });
  await client.connect(transport);
  const info = client.getServerVersion();
  await client.close();
  return { name: info.name, version: info.version };
}
