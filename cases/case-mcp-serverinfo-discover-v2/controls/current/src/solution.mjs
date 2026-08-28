// KNOWN-CURRENT CONTROL - connects the post-2026-07-28 way.
// Version negotiation is opt-in on the v2 client (default stays legacy), so
// current code enables it; `auto` probes with server/discover and adopts the
// modern era on definitive evidence. Identity then comes from the negotiated
// connection (the SDK reads it from result _meta under
// 'io.modelcontextprotocol/serverInfo'; getServerVersion() is the helper).
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

export async function getServerIdentity({ url, fetch }) {
  const client = new Client(
    { name: 'updapi-case-client', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } }
  );
  const transport = new StreamableHTTPClientTransport(new URL(url), { fetch });
  await client.connect(transport);
  const info = client.getServerVersion();
  await client.close();
  return { name: info.name, version: info.version };
}
