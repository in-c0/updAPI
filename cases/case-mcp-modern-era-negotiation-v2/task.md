# Task

This workspace pins `@modelcontextprotocol/client@2.0.0` and
`@modelcontextprotocol/server@2.0.0` (see `fixture/package.json`).

`fixture/src/server-harness.mjs` serves a local, current-generation MCP
endpoint entirely in-process, and exports:

- `SERVER_URL` — the endpoint URL
- `serverFetch` — a fetch implementation that reaches that endpoint

Nothing may touch a socket or the network; route all HTTP through the
provided fetch.

Implement `fixture/src/solution.mjs`:

```js
export async function getServerIdentity({ url, fetch }) { ... }
```

It must connect an MCP client to the endpoint, obtain the server's declared
identity from the connection exchange, close cleanly, and return
`{ name, version }`.

Acceptance: `node validator/validate.mjs` (run from the case directory) exits 0.
