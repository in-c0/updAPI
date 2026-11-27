/**
 * realign-columns.mjs — repair rows whose columns are shifted left.
 *
 * utils/verify_and_clean_csv.py used to *drop* a URL it judged broken instead of
 * blanking it, which shortened the row and shifted every later value one column
 * left. The result is rows that are not stale but mislabelled: a privacy policy
 * filed as the documentation URL, a community forum filed as the terms of service.
 *
 * The damage is recoverable because dropping preserves order. The surviving URLs
 * are still in their original relative sequence, just compressed toward the left,
 * so repair is an order-preserving assignment of the observed URLs back onto the
 * column slots — solved exactly here with dynamic programming, scored on what each
 * URL looks like.
 *
 *   node tools/realign-columns.mjs            # dry run: report what would change
 *   node tools/realign-columns.mjs --apply    # write the repaired CSV
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { COLUMN_HINTS, hintMatches, isProbeableUrl } from './check-links.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV_PATH = path.join(ROOT, 'api-docs-urls.csv');
const DATASETS = path.join(ROOT, 'datasets');

const NAME_COLUMN = 'API_Name';
const DOC_COLUMN = 'Official_Documentation_URL';

/** Looks like reference material rather than a policy or a forum. */
const DOC_PATTERN = /(\/docs?|documentation|developer|\/reference|\/api|\/guide)/i;

const APPLY = process.argv.includes('--apply');

/**
 * How well does `url` fit `column`?
 *
 * Positive only on real evidence. A URL with no recognisable signal scores zero
 * everywhere, so it is placed by order alone and never drags a row into a
 * rearrangement on its own.
 */
const score = (url, column, apiName = '') => {
    if (hintMatches(column, url, apiName)) return 4;

    // Belongs somewhere else, clearly.
    const foreign = Object.keys(COLUMN_HINTS).find(
        (other) => other !== column && hintMatches(other, url, apiName)
    );
    if (foreign) return -3;

    if (column === DOC_COLUMN && DOC_PATTERN.test(url)) return 3;
    return 0;
};

/**
 * Assign `urls` (in order) to `columns` (in order), leaving gaps where a value is
 * missing, maximising total score. Every URL must be placed; a column may be left
 * empty. Returns { total, placement } where placement[i] is the column index for
 * urls[i], or null when no valid assignment exists (more URLs than columns).
 */
const bestAssignment = (urls, columns, apiName = '') => {
    const m = urls.length;
    const n = columns.length;
    if (m > n) return { total: -Infinity, placement: null };

    const NEG = -Infinity;
    // dp[i][j] = best score placing urls[i..] into columns[j..]
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(NEG));
    const takeHere = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(false));

    for (let j = 0; j <= n; j += 1) dp[m][j] = 0; // everything placed

    for (let i = m - 1; i >= 0; i -= 1) {
        for (let j = n - 1; j >= 0; j -= 1) {
            const skip = dp[i][j + 1]; // leave column j empty
            const place = dp[i + 1][j + 1] === NEG
                ? NEG
                : score(urls[i], columns[j], apiName) + dp[i + 1][j + 1];
            if (place >= skip) {
                dp[i][j] = place;
                takeHere[i][j] = true;
            } else {
                dp[i][j] = skip;
            }
        }
    }

    if (dp[0][0] === NEG) return { total: NEG, placement: null };

    const placement = new Array(m);
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
        if (takeHere[i][j]) {
            placement[i] = j;
            i += 1;
        }
        j += 1;
    }
    return { total: dp[0][0], placement };
};

const main = () => {
    const raw = fs.readFileSync(CSV_PATH, 'utf8');
    const rows = parse(raw, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        relax_column_count: true,
        trim: true,
    });

    const allColumns = Object.keys(rows[0]);
    const urlColumns = allColumns.filter((c) => c !== NAME_COLUMN);

    const changes = [];
    let unrepairable = 0;
    let leftAlone = 0;

    for (const row of rows) {
        const observed = urlColumns
            .map((column) => (row[column] || '').trim())
            .filter((value) => isProbeableUrl(value));

        // A row carrying every column lost nothing, so nothing shifted.
        if (observed.length === urlColumns.length) {
            leftAlone += 1;
            continue;
        }

        const apiName = row[NAME_COLUMN] || '';
        const { total, placement } = bestAssignment(observed, urlColumns, apiName);
        if (!placement) {
            unrepairable += 1;
            continue;
        }

        // The status quo is left-packed: urls[i] currently sits in column i.
        const identity = observed.reduce((sum, url, i) => sum + score(url, urlColumns[i], apiName), 0);

        // Only move on strict evidence. Equal scores mean the content tells us
        // nothing the current order does not, so the row is left as found.
        if (total <= identity) {
            leftAlone += 1;
            continue;
        }

        const moved = [];
        const dropped = [];
        const next = {};
        for (const column of urlColumns) next[column] = '';
        observed.forEach((url, i) => {
            const column = urlColumns[placement[i]];

            // The DP places every URL somewhere, but sometimes the only slot left
            // is one the URL plainly contradicts — two community links competing
            // for one community column, say. Filing it anyway would recreate the
            // exact defect this tool exists to repair, and a mislabelled URL is
            // worse than a missing one: the cell is left blank and the URL is
            // recorded in the report for a human to place.
            if (score(url, column, apiName) < 0) {
                dropped.push({ url, from: urlColumns[i], contradicts: column });
                return;
            }

            next[column] = url;
            if (urlColumns[i] !== column) {
                moved.push({ url, from: urlColumns[i], to: column });
            }
        });

        if (moved.length === 0 && dropped.length === 0) {
            leftAlone += 1;
            continue;
        }

        changes.push({
            api: row[NAME_COLUMN],
            scoreBefore: identity,
            scoreAfter: total,
            moved,
            ...(dropped.length ? { dropped } : {}),
        });
        for (const column of urlColumns) row[column] = next[column];
    }

    const urlsMoved = changes.reduce((sum, change) => sum + change.moved.length, 0);
    const urlsBlanked = changes.reduce((sum, change) => sum + (change.dropped?.length || 0), 0);

    console.error(`rows            ${rows.length}`);
    console.error(`  realigned     ${changes.length} (${urlsMoved} URLs moved)`);
    console.error(`  blanked       ${urlsBlanked} URLs that contradicted every free column`);
    console.error(`  left as found ${leftAlone}`);
    console.error(`  unrepairable  ${unrepairable}`);

    for (const change of changes.slice(0, 8)) {
        console.error(`\n  ${change.api}  (${change.scoreBefore} -> ${change.scoreAfter})`);
        for (const move of change.moved) {
            console.error(`    ${move.from} -> ${move.to}`);
            console.error(`      ${move.url}`);
        }
    }
    if (changes.length > 8) console.error(`\n  ... and ${changes.length - 8} more rows`);

    fs.mkdirSync(DATASETS, { recursive: true });
    fs.writeFileSync(
        path.join(DATASETS, 'realignment.json'),
        `${JSON.stringify(
            {
                rows: rows.length,
                realigned: changes.length,
                urlsMoved,
                urlsBlanked,
                leftAlone,
                unrepairable,
                changes,
            },
            null,
            2
        )}\n`
    );

    if (APPLY) {
        fs.writeFileSync(
            CSV_PATH,
            stringify(rows, { header: true, columns: allColumns, record_delimiter: '\r\n' })
        );
        console.error(`\napplied to ${path.basename(CSV_PATH)}`);
    } else {
        console.error('\ndry run — pass --apply to write the changes');
    }
};

export { score, bestAssignment };

if (process.argv[1]?.endsWith('realign-columns.mjs')) main();
