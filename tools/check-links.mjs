/**
 * check-links.mjs — freshness engine for api-docs-urls.csv
 *
 * The dataset is a table of URLs, and URLs rot. This probes every URL in every
 * column, follows redirects, and reports what it found. With --fix it rewrites
 * rows whose URL now redirects elsewhere, so the table repairs itself.
 *
 * Deliberately dependency-light (csv-parse + csv-stringify, both already in
 * package.json) so CI does not have to install crawlee/playwright to run it.
 *
 *   node tools/check-links.mjs                 # probe, write reports
 *   node tools/check-links.mjs --fix           # also apply redirect corrections
 *   node tools/check-links.mjs --limit 50      # probe a sample (development)
 *   node tools/check-links.mjs --column "Rate Limiting Policy"
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV_PATH = path.join(ROOT, 'api-docs-urls.csv');
const DATASETS = path.join(ROOT, 'datasets');

const NAME_COLUMN = 'API_Name';
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/126.0.0.0 Safari/537.36 updAPI-link-checker/1.0 (+https://github.com/in-c0/updAPI)';

const REQUEST_TIMEOUT_MS = 15000;
const HOST_CONCURRENCY = 2;   // be a polite guest on any single doc site
const GLOBAL_CONCURRENCY = 12; // how many distinct hosts we talk to at once

/**
 * Outcomes are deliberately more granular than ok/broken. The distinction that
 * matters most is `blocked` vs `dead`: a 403 from a bot-detecting CDN says
 * nothing about whether the page exists, so it must never be treated as rot and
 * must never drive a correction. Conflating the two would let Cloudflare quietly
 * delete rows from the dataset.
 */
const OUTCOME = {
    OK: 'ok',           // 200, and the final URL is the one we stored
    MOVED: 'moved',     // 200, but only after redirecting somewhere else
    DEAD: 'dead',       // 404/410 — the page is gone
    BLOCKED: 'blocked', // 401/403/429 — we were refused, existence unknown
    ERROR: 'error',     // DNS failure, TLS failure, timeout
    OTHER: 'other',     // any other status
};

const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const flagValue = (f) => {
    const i = argv.indexOf(f);
    return i === -1 ? null : argv[i + 1];
};

const APPLY_FIXES = hasFlag('--fix');
const SAMPLE_LIMIT = flagValue('--limit') ? Number(flagValue('--limit')) : null;
const ONLY_COLUMN = flagValue('--column');

/** Trailing slashes and fragments are not meaningful differences. */
const normalise = (url) => {
    try {
        const u = new URL(url);
        u.hash = '';
        u.pathname = u.pathname.replace(/\/+$/, '') || '/';
        return u.toString();
    } catch {
        return url;
    }
};

const hostOf = (url) => {
    try {
        return new URL(url).host.toLowerCase();
    } catch {
        return '<invalid>';
    }
};

const isProbeableUrl = (value) => typeof value === 'string' && /^https?:\/\//i.test(value.trim());

/**
 * Rot is not this dataset's worst defect. Most rows omit fields rather than
 * leaving them empty, so every value after the gap shifts one column left and a
 * privacy-policy URL ends up sitting in the documentation column. Column
 * statistics computed over those rows would be measuring the wrong cells, so
 * they are tallied separately and these hints are used to flag the shift.
 */
const COLUMN_HINTS = {
    'Privacy Policy': /privacy/i,
    'Terms of Service': /(terms|tos|legal|conditions)/i,
    'Rate Limiting Policy': /(rate.?limit|throttl|quota|limits)/i,
    'Release Notes': /(release|changelog|change-log|whats-new|news)/i,
    'Security Policy': /(security|trust|vulnerab)/i,
    'Developer Community/Forum': /(community|forum|discuss|groups|stackoverflow|slack|discord)/i,
};

/** Does this row's documentation cell actually look like some other column? */
const misalignedAs = (row) => {
    const value = (row.Official_Documentation_URL || '').trim();
    if (!isProbeableUrl(value)) return null;
    for (const [column, pattern] of Object.entries(COLUMN_HINTS)) {
        if (pattern.test(value)) return column;
    }
    return null;
};

const classify = (status, requestedUrl, finalUrl) => {
    if (status === 404 || status === 410) return OUTCOME.DEAD;
    if (status === 401 || status === 403 || status === 429) return OUTCOME.BLOCKED;
    if (status >= 200 && status < 300) {
        return normalise(requestedUrl) === normalise(finalUrl) ? OUTCOME.OK : OUTCOME.MOVED;
    }
    return OUTCOME.OTHER;
};

/** One GET, redirects followed, with a single retry for transient failures. */
const probe = async (url, attempt = 0) => {
    try {
        const response = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*' },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        // Drain the body so the socket is released promptly; we only need headers.
        await response.arrayBuffer().catch(() => {});

        if (response.status === 429 && attempt === 0) {
            await new Promise((r) => setTimeout(r, 3000));
            return probe(url, attempt + 1);
        }

        return {
            url,
            status: response.status,
            finalUrl: response.url || url,
            outcome: classify(response.status, url, response.url || url),
        };
    } catch (err) {
        if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 1500));
            return probe(url, attempt + 1);
        }
        return {
            url,
            status: 0,
            finalUrl: null,
            outcome: OUTCOME.ERROR,
            error: err?.name === 'TimeoutError' ? 'timeout' : String(err?.message || err),
        };
    }
};

/** Run `fn` over `items` with at most `limit` in flight. */
const mapPool = async (items, limit, fn) => {
    const results = new Array(items.length);
    let cursor = 0;
    const worker = async () => {
        while (cursor < items.length) {
            const index = cursor++;
            results[index] = await fn(items[index], index);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
};

/**
 * Probe a set of URLs grouped by host, so no single documentation site sees more
 * than HOST_CONCURRENCY requests at a time however many rows reference it.
 */
const probeAll = async (urls, onProgress) => {
    const byHost = new Map();
    for (const url of urls) {
        const host = hostOf(url);
        if (!byHost.has(host)) byHost.set(host, []);
        byHost.get(host).push(url);
    }

    const results = new Map();
    let done = 0;
    const hosts = [...byHost.keys()];

    await mapPool(hosts, GLOBAL_CONCURRENCY, async (host) => {
        await mapPool(byHost.get(host), HOST_CONCURRENCY, async (url) => {
            const result = await probe(url);
            results.set(url, result);
            done += 1;
            if (onProgress && done % 100 === 0) onProgress(done, urls.length);
        });
    });

    return results;
};

/** Probe https://<host>/llms.txt once per host. */
const probeLlmsTxt = async (hosts) => {
    const results = {};
    await mapPool(hosts, GLOBAL_CONCURRENCY, async (host) => {
        const { status, outcome } = await probe(`https://${host}/llms.txt`);
        results[host] = { status, serves: status >= 200 && status < 300, outcome };
    });
    return results;
};

const emptyTally = () => ({
    checked: 0,
    [OUTCOME.OK]: 0,
    [OUTCOME.MOVED]: 0,
    [OUTCOME.DEAD]: 0,
    [OUTCOME.BLOCKED]: 0,
    [OUTCOME.ERROR]: 0,
    [OUTCOME.OTHER]: 0,
});

const main = async () => {
    const raw = fs.readFileSync(CSV_PATH, 'utf8');
    // relax_column_count: the dataset contains rows with missing trailing
    // columns. Refusing to parse would make the checker unable to report on the
    // very rows most likely to be wrong, so short rows are tolerated and counted.
    const rows = parse(raw, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        relax_column_count: true,
        trim: true,
    });
    if (rows.length === 0) throw new Error(`${CSV_PATH} parsed to zero rows`);

    const allColumns = Object.keys(rows[0]);
    const urlColumns = allColumns
        .filter((c) => c !== NAME_COLUMN)
        .filter((c) => !ONLY_COLUMN || c === ONLY_COLUMN);

    if (urlColumns.length === 0) {
        throw new Error(`no URL columns selected (--column ${ONLY_COLUMN} matched nothing)`);
    }

    const sample = SAMPLE_LIMIT ? rows.slice(0, SAMPLE_LIMIT) : rows;

    // Structural completeness, assessed before anything is probed. A row missing
    // any column cannot be trusted to be column-aligned, so it is excluded from
    // per-column statistics rather than quietly corrupting them.
    const isComplete = (row) => allColumns.every((column) => row[column] !== undefined);
    const completeRows = rows.filter(isComplete);
    const incompleteRows = rows.filter((row) => !isComplete(row));

    const fieldCountHistogram = {};
    for (const row of rows) {
        const filled = allColumns.filter((column) => row[column] !== undefined).length;
        fieldCountHistogram[filled] = (fieldCountHistogram[filled] || 0) + 1;
    }

    const shifted = incompleteRows
        .map((row) => ({ api: row[NAME_COLUMN], looksLike: misalignedAs(row) }))
        .filter((entry) => entry.looksLike);

    // One probe per distinct URL, however many rows share it.
    const distinct = new Set();
    for (const row of sample) {
        for (const column of urlColumns) {
            if (isProbeableUrl(row[column])) distinct.add(row[column].trim());
        }
    }
    const urls = [...distinct];

    console.error(
        `updAPI link check — ${sample.length} rows x ${urlColumns.length} columns ` +
        `= ${urls.length} distinct URLs across ${new Set(urls.map(hostOf)).size} hosts`
    );

    const started = new Date().toISOString();
    const results = await probeAll(urls, (done, total) =>
        console.error(`  ${done}/${total} probed`)
    );

    // Per-column tallies, computed over rows (so a URL shared by ten rows counts
    // ten times) — that is the number a consumer of the dataset actually feels.
    const byColumn = {};
    const findings = [];
    for (const column of urlColumns) byColumn[column] = emptyTally();

    for (const row of sample) {
        const rowIsComplete = isComplete(row);
        for (const column of urlColumns) {
            const value = (row[column] || '').trim();
            if (!isProbeableUrl(value)) continue;
            const result = results.get(value);
            if (!result) continue;

            // Findings are collected for every row, but only aligned rows are
            // counted — otherwise "43% of documentation URLs are OK" would be
            // partly a statement about privacy-policy URLs.
            if (rowIsComplete) {
                byColumn[column].checked += 1;
                byColumn[column][result.outcome] += 1;
            }

            if (result.outcome !== OUTCOME.OK) {
                findings.push({
                    api: row[NAME_COLUMN],
                    column,
                    ...(rowIsComplete ? {} : { rowIncomplete: true }),
                    url: value,
                    outcome: result.outcome,
                    status: result.status,
                    finalUrl: result.finalUrl,
                    ...(result.error ? { error: result.error } : {}),
                });
            }
        }
    }

    const totals = emptyTally();
    for (const tally of Object.values(byColumn)) {
        for (const key of Object.keys(totals)) totals[key] += tally[key];
    }

    const hosts = [...new Set(urls.map(hostOf))].filter((h) => h !== '<invalid>');
    console.error(`probing /llms.txt on ${hosts.length} hosts`);
    const llmsTxt = await probeLlmsTxt(hosts);
    const llmsServing = Object.values(llmsTxt).filter((h) => h.serves).length;

    fs.mkdirSync(DATASETS, { recursive: true });

    const report = {
        generatedAt: started,
        csv: path.basename(CSV_PATH),
        rows: sample.length,
        columns: urlColumns,
        distinctUrls: urls.length,
        alignment: {
            rowsComplete: completeRows.length,
            rowsIncomplete: incompleteRows.length,
            shareComplete: rows.length ? Number((completeRows.length / rows.length).toFixed(4)) : 0,
            fieldCountHistogram,
            documentationCellLooksLikeAnotherColumn: shifted.length,
            shiftedExamples: shifted.slice(0, 25),
            note:
                'Per-column statistics cover structurally complete rows only. Incomplete ' +
                'rows omit fields rather than blanking them, so their columns are shifted ' +
                'and cannot be attributed to a named column.',
        },
        totals,
        byColumn,
        llmsTxt: {
            hostsProbed: hosts.length,
            hostsServing: llmsServing,
            share: hosts.length ? Number((llmsServing / hosts.length).toFixed(4)) : 0,
            byHost: llmsTxt,
        },
        findings: findings.sort((a, b) => a.api.localeCompare(b.api)),
    };
    fs.writeFileSync(
        path.join(DATASETS, 'link-health.json'),
        `${JSON.stringify(report, null, 2)}\n`
    );

    // Append one row per column per run. This file is the point of the exercise:
    // a single snapshot is a curiosity, the series is the finding.
    const historyPath = path.join(DATASETS, 'link-health-history.csv');
    const historyHeader =
        'date,column,checked,ok,moved,dead,blocked,error,other,llms_txt_hosts,llms_txt_serving,rows_complete,rows_total\n';
    if (!fs.existsSync(historyPath)) fs.writeFileSync(historyPath, historyHeader);
    const date = started.slice(0, 10);
    const historyRows = urlColumns.map((column) => {
        const t = byColumn[column];
        return [
            date, column, t.checked, t[OUTCOME.OK], t[OUTCOME.MOVED], t[OUTCOME.DEAD],
            t[OUTCOME.BLOCKED], t[OUTCOME.ERROR], t[OUTCOME.OTHER],
            hosts.length, llmsServing, completeRows.length, rows.length,
        ];
    });
    fs.appendFileSync(historyPath, stringify(historyRows));

    // --fix rewrites only `moved` rows. A dead URL has no known replacement, so
    // guessing one would put a fabrication in the dataset; those stay in the
    // report for a human (or a search) to resolve.
    let corrections = 0;
    if (APPLY_FIXES) {
        for (const row of rows) {
            for (const column of urlColumns) {
                const value = (row[column] || '').trim();
                if (!isProbeableUrl(value)) continue;
                const result = results.get(value);
                if (result?.outcome === OUTCOME.MOVED && result.finalUrl) {
                    row[column] = result.finalUrl;
                    corrections += 1;
                }
            }
        }
        if (corrections > 0) {
            fs.writeFileSync(
                CSV_PATH,
                stringify(rows, { header: true, columns: allColumns, record_delimiter: '\r\n' })
            );
        }
    }

    const pct = (n) => (totals.checked ? `${((n / totals.checked) * 100).toFixed(1)}%` : '—');
    console.error('');
    console.error(`checked      ${totals.checked}`);
    console.error(`  ok         ${totals.ok} (${pct(totals.ok)})`);
    console.error(`  moved      ${totals.moved} (${pct(totals.moved)})`);
    console.error(`  dead       ${totals.dead} (${pct(totals.dead)})`);
    console.error(`  blocked    ${totals.blocked} (${pct(totals.blocked)})`);
    console.error(`  error      ${totals.error} (${pct(totals.error)})`);
    console.error(`  other      ${totals.other} (${pct(totals.other)})`);
    console.error(`llms.txt     ${llmsServing}/${hosts.length} hosts serve one`);
    console.error(
        `alignment    ${completeRows.length}/${rows.length} rows carry all columns; ` +
        `${shifted.length} have a non-doc URL in the documentation column`
    );
    if (APPLY_FIXES) console.error(`corrections  ${corrections} applied to ${path.basename(CSV_PATH)}`);

    // Non-zero exit would fail the weekly workflow on a dataset that is merely
    // stale, which is the normal state. Rot is reported, not treated as an error.
    process.exitCode = 0;
};

export { classify, normalise, isProbeableUrl, OUTCOME };

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('check-links.mjs')) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
