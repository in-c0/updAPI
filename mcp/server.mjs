/**
 * updAPI MCP server — serves the API resource index over stdio.
 *
 * The index is a table of URLs and URLs rot, so every response carries the
 * freshness of what it is handing back: when the URL was last verified and what
 * the verifier saw. A tool that returns a link without saying how old the claim
 * is invites the model to trust a 404, which is worse than returning nothing.
 * Freshness comes from datasets/link-health.json, refreshed by the weekly
 * workflow that runs tools/check-links.mjs.
 *
 *   node mcp/server.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV_PATH = path.join(ROOT, 'api-docs-urls.csv');
const HEALTH_PATH = path.join(ROOT, 'datasets', 'link-health.json');

const NAME_COLUMN = 'API_Name';

const loadRows = () => {
    const raw = fs.readFileSync(CSV_PATH, 'utf8');
    return parse(raw, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        relax_column_count: true,
        trim: true,
    });
};

/** Missing or unreadable health data must degrade to "unknown", never to a lie. */
const loadHealth = () => {
    try {
        const report = JSON.parse(fs.readFileSync(HEALTH_PATH, 'utf8'));
        const byUrl = new Map();
        for (const finding of report.findings || []) {
            byUrl.set(finding.url, finding);
        }
        return { generatedAt: report.generatedAt || null, byUrl };
    } catch {
        return { generatedAt: null, byUrl: new Map() };
    }
};

const ROWS = loadRows();
const HEALTH = loadHealth();
const COLUMNS = Object.keys(ROWS[0] || {}).filter((c) => c !== NAME_COLUMN);

/**
 * A URL absent from `findings` was verified OK at generatedAt — the report only
 * records departures from OK. With no report at all, everything is "unknown".
 */
const describeUrl = (url) => {
    if (!url) return null;
    if (!HEALTH.generatedAt) {
        return { url, verified: 'unknown', note: 'no link-health report present' };
    }
    const finding = HEALTH.byUrl.get(url);
    if (!finding) return { url, verified: HEALTH.generatedAt, status: 'ok' };
    return {
        url,
        verified: HEALTH.generatedAt,
        status: finding.outcome,
        httpStatus: finding.status,
        ...(finding.finalUrl && finding.finalUrl !== url ? { redirectsTo: finding.finalUrl } : {}),
    };
};

const resourcesFor = (row) => {
    const out = {};
    for (const column of COLUMNS) {
        const value = (row[column] || '').trim();
        if (value) out[column] = describeUrl(value);
    }
    return out;
};

const asText = (payload) => ({
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
});

const server = new McpServer({ name: 'updapi', version: '1.0.0' });

server.tool(
    'search_apis',
    'Find APIs in the updAPI index by name. Returns matching API names and their ' +
        'documentation URL with freshness metadata. Use this first when you know the ' +
        'product but not the exact index entry.',
    {
        query: z.string().min(1).describe('Substring of the API name, e.g. "stripe" or "zoom"'),
        limit: z.number().int().min(1).max(50).default(10).describe('Maximum results'),
    },
    async ({ query, limit }) => {
        const needle = query.toLowerCase();
        const matches = ROWS.filter((row) =>
            (row[NAME_COLUMN] || '').toLowerCase().includes(needle)
        ).slice(0, limit);

        return asText({
            query,
            matched: matches.length,
            indexVerified: HEALTH.generatedAt || 'unknown',
            results: matches.map((row) => ({
                api: row[NAME_COLUMN],
                documentation: describeUrl((row.Official_Documentation_URL || '').trim()),
            })),
        });
    }
);

server.tool(
    'get_api_resources',
    'Get every indexed resource for one API — documentation, privacy policy, terms of ' +
        'service, rate limiting policy, release notes, security policy and developer ' +
        'community — each with when it was last verified and whether it still resolves. ' +
        'The policy columns are the ones general web search covers worst.',
    {
        api: z.string().min(1).describe('API name, exact or substring, e.g. "Stripe API"'),
    },
    async ({ api }) => {
        const needle = api.toLowerCase();
        const row =
            ROWS.find((r) => (r[NAME_COLUMN] || '').toLowerCase() === needle) ||
            ROWS.find((r) => (r[NAME_COLUMN] || '').toLowerCase().includes(needle));

        if (!row) {
            return asText({
                api,
                found: false,
                hint: 'No entry matched. Try search_apis with a shorter query.',
            });
        }

        return asText({
            api: row[NAME_COLUMN],
            found: true,
            indexVerified: HEALTH.generatedAt || 'unknown',
            resources: resourcesFor(row),
        });
    }
);

server.tool(
    'index_health',
    'Report how fresh the updAPI index currently is: when it was last verified and how ' +
        'many URLs are OK, redirected, dead or blocked, per column. Call this to decide ' +
        'how much to trust the other tools, or to find entries needing repair.',
    {
        column: z
            .string()
            .optional()
            .describe('Restrict to one column, e.g. "Rate Limiting Policy"'),
    },
    async ({ column }) => {
        if (!HEALTH.generatedAt) {
            return asText({
                available: false,
                reason:
                    'datasets/link-health.json is missing — run `npm run check-links` or wait ' +
                    'for the weekly freshness workflow.',
            });
        }
        const report = JSON.parse(fs.readFileSync(HEALTH_PATH, 'utf8'));
        return asText({
            available: true,
            generatedAt: report.generatedAt,
            rows: report.rows,
            distinctUrls: report.distinctUrls,
            alignment: report.alignment,
            byColumn: column ? { [column]: report.byColumn?.[column] } : report.byColumn,
            llmsTxt: {
                hostsProbed: report.llmsTxt?.hostsProbed,
                hostsServing: report.llmsTxt?.hostsServing,
                share: report.llmsTxt?.share,
            },
        });
    }
);

const transport = new StdioServerTransport();
await server.connect(transport);
