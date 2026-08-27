/**
 * verify-mcp.mjs — end-to-end check that mcp/server.mjs actually speaks MCP.
 *
 * Spawns the server over stdio as a real client would, lists its tools and calls
 * each one. Run it after changing the server: a server that starts cleanly can
 * still fail to register a tool or return a malformed result.
 *
 *   node tools/verify-mcp.mjs
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(ROOT, 'mcp', 'server.mjs')],
});

const client = new Client({ name: 'updapi-verify', version: '1.0.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`tools: ${tools.map((t) => t.name).join(', ')}`);

const show = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content?.[0]?.text ?? '';
    console.log(`\n--- ${name}(${JSON.stringify(args)})`);
    console.log(text.length > 900 ? `${text.slice(0, 900)}\n  ...` : text);
    return JSON.parse(text);
};

const search = await show('search_apis', { query: 'stripe', limit: 3 });
const resources = await show('get_api_resources', { api: 'Stripe' });
const health = await show('index_health', {});

const failures = [];
if (!tools.some((t) => t.name === 'search_apis')) failures.push('search_apis not registered');
if (search.matched === 0) failures.push('search_apis found nothing for "stripe"');
if (!resources.found) failures.push('get_api_resources found no Stripe entry');
if (!resources.resources || Object.keys(resources.resources).length === 0) {
    failures.push('get_api_resources returned no resources');
}
if (health.available !== true) failures.push('index_health reports no report available');

await client.close();

if (failures.length) {
    console.error(`\nFAILED:\n  ${failures.join('\n  ')}`);
    process.exit(1);
}
console.log('\nall MCP checks passed');
