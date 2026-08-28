/**
 * verify-alignment.mjs — check that no column-shifted rows remain.
 *
 * A clean result from a detector proves nothing on its own: a detector that
 * always returns zero also reports zero. So this runs a **negative control**
 * first — it deliberately re-breaks a copy of the data the same way the old
 * cleaner did, and requires the detector to catch it. Only if the control fires
 * is a zero on the real data worth anything.
 *
 *   node tools/verify-alignment.mjs
 *
 * Exits non-zero if shifted rows remain, or if the control fails to fire.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { misalignedAs } from './check-links.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV_PATH = path.join(ROOT, 'api-docs-urls.csv');

const NAME_COLUMN = 'API_Name';

const load = () =>
    parse(fs.readFileSync(CSV_PATH, 'utf8'), {
        columns: true,
        skip_empty_lines: true,
        bom: true,
        relax_column_count: true,
        trim: true,
    });

const countShifted = (rows) => rows.filter((row) => misalignedAs(row)).length;

/**
 * Reproduce the original corruption: drop empty cells so later values slide left,
 * exactly as the old verify_and_clean_csv.py did when it skipped a broken URL.
 */
const reshift = (rows, columns) =>
    rows.map((row) => {
        const values = columns.map((column) => (row[column] || '').trim()).filter(Boolean);
        const broken = { [NAME_COLUMN]: row[NAME_COLUMN] };
        columns.forEach((column, i) => {
            broken[column] = values[i] || '';
        });
        return broken;
    });

const rows = load();
const columns = Object.keys(rows[0]).filter((c) => c !== NAME_COLUMN);

// Negative control first — if this does not fire, the real result is meaningless.
const control = countShifted(reshift(rows, columns));
const actual = countShifted(rows);

console.log(`negative control (data deliberately re-shifted): ${control} rows detected`);
console.log(`api-docs-urls.csv:                               ${actual} rows detected`);

const failures = [];
if (control === 0) {
    failures.push(
        'negative control did not fire — the detector cannot see the defect it is ' +
        'meant to catch, so a clean result on the real data proves nothing'
    );
}
if (actual > 0) {
    failures.push(`${actual} rows still have a URL filed under the wrong column`);
    for (const row of rows.filter((r) => misalignedAs(r)).slice(0, 10)) {
        failures.push(`    ${row[NAME_COLUMN]} — documentation cell looks like ${misalignedAs(row)}`);
    }
}

if (failures.length) {
    console.error(`\nFAILED:\n  ${failures.join('\n  ')}`);
    process.exit(1);
}
console.log('\nno column-shifted rows remain, and the control confirms the detector works');
