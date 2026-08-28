# case-mcp-modern-era-negotiation-v2

**Event:** [`modelcontextprotocol.client.2026-07-27.opt-in-version-negotiation`](../../events/modelcontextprotocol/client/modelcontextprotocol.client.2026-07-27.opt-in-version-negotiation.json) —
entering the MCP 2026-07-28 protocol era is opt-in on the GA v2 client
(`ClientOptions.versionNegotiation`; the default remains the plain 2025
`initialize` handshake), and modern-only strict endpoints reject that default
handshake outright.

*(Renamed from `case-mcp-serverinfo-discover-v2` and rebound in PR #25 round 1:
the fixture discriminates protocol-era negotiation, which is a distinct causal
intervention from the serverInfo field relocation. The
[`serverinfo-into-result-meta`](../../events/modelcontextprotocol/server/modelcontextprotocol.server.2026-07-27.serverinfo-into-result-meta.json)
event is retained as a verified historical event awaiting its own clean
discriminating oracle.)*

**What the case measures.** Protocol-era adaptation with an executable local
oracle: a real client against a real **modern-only strict** endpoint
(`createMcpHandler(factory, { legacy: 'reject' })`), served entirely
in-process through an injected fetch — no sockets, no credentials. The task is
a plausible developer objective: connect and report the server's identity.

**Empirical grounding** (observed against the GA 2.0.0 packages, not taken
from documentation):

- The high-level `McpServer` over a raw in-memory transport still serves the
  **legacy** era: a default client connects via `initialize`, receives
  `serverInfo` in the result body, and `server/discover` answers `-32601`.
  The modern 2026-07-28 wire lives on the `createMcpHandler` HTTP surface.
- The v2 `Client` **defaults to legacy negotiation**; current code must opt in
  (`versionNegotiation: { mode: 'auto' }` or a pinned revision).
- Stale code (the idiomatic 2025 pattern: default client + `initialize`)
  against this endpoint **hard-fails at connect** with JSON-RPC `-32022`
  `Unsupported protocol version: 2025-11-25` (`supported: ['2026-07-28']`) —
  precisely the failure mode the SDK release notes warn about for modern-only
  peers.
- The migration guide's "graceful anonymous identity" statement applies to a
  different layer (identity-read within an established modern connection).
  The two sources are consistent once separated by layer; this fixture is the
  ground truth for the layer it exercises.

**Validator:** `node validator/validate.mjs` from this directory — behavioural:
the solution must return the identity the fixture server actually declares.

**Controls:** `controls/stale` (default client, 2025 handshake) must be
rejected; `controls/current` (opt-in negotiation) must pass. Run
`npm run bench:controls -- --case case-mcp-modern-era-negotiation-v2` from the
repo root to prove both directions.
