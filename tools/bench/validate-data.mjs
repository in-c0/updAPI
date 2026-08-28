// Validates the benchmark dataset against its versioned schemas, plus the
// cross-file invariants a JSON Schema cannot see:
//   - every case references an existing event, and vice versa for
//     executable_fixture verification
//   - referenced fixture/control/solution paths exist
//   - ids are unique
// Exit 0 only when everything holds. Used by `npm run bench:validate` and the
// mocha suite; deliberately dependency-light (ajv + ajv-formats only).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const argv = process.argv.slice(2);
const rootFlag = argv.indexOf('--root');
// --root <dir>: validate a different tree (the mocha negative control uses this
// to prove the validator can actually reject a broken dataset).
const repoRoot = rootFlag >= 0
  ? path.resolve(argv[rootFlag + 1])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const problems = [];
const note = (file, msg) => problems.push({ file: path.relative(repoRoot, file).replaceAll('\\', '/'), msg });

const ajv = new Ajv2020.default({ allErrors: true, strict: true });
addFormats.default(ajv);

const loadSchema = (name) => {
  const p = path.join(repoRoot, 'schemas', name);
  return ajv.compile(JSON.parse(fs.readFileSync(p, 'utf8')));
};

const validateEvent = loadSchema('change-event.schema.json');
const validateCase = loadSchema('benchmark-case.schema.json');
// Compiled for their own syntax validity even though v0 has no run data yet.
loadSchema('run-manifest.schema.json');
loadSchema('run-result.schema.json');

function* jsonFilesUnder(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* jsonFilesUnder(p);
    else if (entry.isFile() && entry.name.endsWith('.json')) yield p;
  }
}

// ---- events ----
const events = new Map();
for (const file of jsonFilesUnder(path.join(repoRoot, 'events'))) {
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (err) { note(file, `unparseable JSON: ${err.message}`); continue; }
  if (!validateEvent(data)) {
    for (const e of validateEvent.errors) note(file, `schema: ${e.instancePath || '/'} ${e.message}`);
    continue;
  }
  if (events.has(data.id)) note(file, `duplicate event id ${data.id} (also in ${events.get(data.id).file})`);
  events.set(data.id, { file, data });
  const expectedBasename = `${data.id}.json`;
  if (path.basename(file) !== expectedBasename) note(file, `filename should be ${expectedBasename}`);
}

// ---- cases ----
const casesRoot = path.join(repoRoot, 'cases');
const cases = new Map();
if (fs.existsSync(casesRoot)) {
  for (const dirent of fs.readdirSync(casesRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const caseDir = path.join(casesRoot, dirent.name);
    const caseFile = path.join(caseDir, 'case.json');
    if (!fs.existsSync(caseFile)) { note(caseDir, 'missing case.json'); continue; }
    let data;
    try { data = JSON.parse(fs.readFileSync(caseFile, 'utf8')); }
    catch (err) { note(caseFile, `unparseable JSON: ${err.message}`); continue; }
    if (!validateCase(data)) {
      for (const e of validateCase.errors) note(caseFile, `schema: ${e.instancePath || '/'} ${e.message}`);
      continue;
    }
    if (data.case_id !== dirent.name) note(caseFile, `case_id ${data.case_id} != directory name ${dirent.name}`);
    if (cases.has(data.case_id)) note(caseFile, `duplicate case id ${data.case_id}`);
    cases.set(data.case_id, { file: caseFile, data });

    if (!events.has(data.event_id)) note(caseFile, `event_id ${data.event_id} does not match any event`);

    const fixtureDir = path.join(caseDir, data.workspace_fixture);
    if (!fs.existsSync(fixtureDir)) note(caseFile, `workspace_fixture missing: ${data.workspace_fixture}`);
    if (data.solution_path && !fs.existsSync(path.join(fixtureDir, data.solution_path))) {
      note(caseFile, `solution_path missing in fixture: ${data.solution_path}`);
    }
    for (const key of ['known_stale_fixture', 'known_current_fixture']) {
      const p = path.join(caseDir, data.controls[key]);
      if (!fs.existsSync(p)) { note(caseFile, `${key} missing: ${data.controls[key]}`); continue; }
      if (data.solution_path && !fs.existsSync(path.join(p, data.solution_path))) {
        note(caseFile, `${key} does not provide solution_path ${data.solution_path}`);
      }
    }
  }
}

// ---- event -> case back-references ----
for (const { file, data } of events.values()) {
  if (data.verification.kind !== 'executable_fixture') continue;
  const fixture = data.verification.fixture; // e.g. cases/case-x
  const caseName = path.basename(fixture);
  const entry = cases.get(caseName);
  if (!entry) { note(file, `verification.fixture ${fixture} does not match any case directory`); continue; }
  if (entry.data.event_id !== data.id) {
    note(file, `verification.fixture case ${caseName} references event ${entry.data.event_id}, not ${data.id}`);
  }
}

// ---- report ----
if (problems.length === 0) {
  console.log(`bench:validate OK - ${events.size} event(s), ${cases.size} case(s), 4 schemas compile, all cross-references hold`);
  process.exit(0);
}
console.error(`bench:validate FAILED - ${problems.length} problem(s):`);
for (const p of problems) console.error(`  ${p.file}: ${p.msg}`);
process.exit(1);
