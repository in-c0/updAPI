// UpdAPI control harness: proves each case's validator DISCRIMINATES.
//
// For every case (cases/*/case.json), overlays the known-stale control onto the
// fixture and requires the validator to REJECT it, then overlays the
// known-current control and requires the validator to ACCEPT it. No LLM is
// involved anywhere; this is BENCHMARK_SPEC.md section 4.3 made executable.
//
// A validator that cannot fail its stale control is not evidence of anything,
// so this harness exits non-zero unless every case shows BOTH outcomes.
//
// Usage:
//   node tools/bench/run-controls.mjs [--case <case-id>] [--json] [--skip-install]
//
// The fixture is mutated in place during a run and restored afterwards
// (including on crashes); a run leaves the working tree byte-identical.

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const casesRoot = path.join(repoRoot, 'cases');

const args = process.argv.slice(2);
const wantJson = args.includes('--json');
const skipInstall = args.includes('--skip-install');
const caseFilter = args.includes('--case') ? args[args.indexOf('--case') + 1] : null;
// Test hook: lets the harness selftest point at a synthetic cases directory.
const casesDir = process.env.UPDAPI_CASES_DIR ? path.resolve(process.env.UPDAPI_CASES_DIR) : casesRoot;

const log = (line) => { if (!wantJson) console.log(line); };

function listCases() {
  if (!fs.existsSync(casesDir)) return [];
  return fs.readdirSync(casesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(casesDir, d.name, 'case.json')))
    .map((d) => d.name)
    .sort();
}

function* walkFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      yield* walkFiles(p);
    } else if (entry.isFile()) {
      yield p;
    }
  }
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

// Overlay every file under controlDir into fixtureDir (same relative paths).
// Returns a restore() that puts the fixture back exactly as it was.
function overlay(controlDir, fixtureDir) {
  const saved = [];
  for (const src of walkFiles(controlDir)) {
    const rel = path.relative(controlDir, src);
    const dest = path.join(fixtureDir, rel);
    const existedBefore = fs.existsSync(dest);
    saved.push({
      dest,
      existedBefore,
      original: existedBefore ? fs.readFileSync(dest) : null
    });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
  return function restore() {
    for (const s of saved) {
      if (s.existedBefore) fs.writeFileSync(s.dest, s.original);
      else fs.rmSync(s.dest, { force: true });
    }
  };
}

function runCommand(command, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, { cwd, shell: true, windowsHide: true });
    let out = '';
    let timedOut = false;
    const cap = (chunk) => { out += chunk.toString(); if (out.length > 200000) out = out.slice(-200000); };
    child.stdout.on('data', cap);
    child.stderr.on('data', cap);
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exitCode: timedOut ? null : code, timedOut, output: out, durationMs: Date.now() - started });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ exitCode: null, timedOut: false, output: String(err), durationMs: Date.now() - started });
    });
  });
}

function hashDir(dir) {
  const h = createHash('sha256');
  const files = [...walkFiles(dir)].sort();
  for (const f of files) {
    h.update(path.relative(dir, f).replaceAll('\\', '/'));
    h.update('\0');
    h.update(fs.readFileSync(f));
    h.update('\0');
  }
  return h.digest('hex');
}

async function runCase(caseId) {
  const caseDir = path.join(casesDir, caseId);
  const spec = JSON.parse(fs.readFileSync(path.join(caseDir, 'case.json'), 'utf8'));
  const fixtureDir = path.join(caseDir, spec.workspace_fixture);
  const timeoutMs = spec.validator.timeout_ms ?? 120000;

  const result = {
    case_id: spec.case_id,
    event_id: spec.event_id,
    install: 'skipped',
    controls: {},
    fixture_restored: null,
    verdict: null
  };

  // Deterministic setup: install once per fixture when absent.
  if (!skipInstall && spec.setup?.install_command && fs.existsSync(path.join(fixtureDir, 'package.json'))
      && !fs.existsSync(path.join(fixtureDir, 'node_modules'))) {
    log(`  installing fixture deps: ${spec.setup.install_command}`);
    const inst = await runCommand(spec.setup.install_command, fixtureDir, 600000);
    result.install = inst.exitCode === 0 ? 'ok' : 'failed';
    if (inst.exitCode !== 0) {
      result.verdict = 'INSTALL_FAILED';
      log(`  INSTALL FAILED (exit ${inst.exitCode})\n${inst.output.slice(-2000)}`);
      return result;
    }
  } else if (fs.existsSync(path.join(fixtureDir, 'node_modules'))) {
    result.install = 'cached';
  }

  const preHash = hashDir(fixtureDir);

  const expectations = [
    { name: 'stale', dir: spec.controls.known_stale_fixture, expect: 'fail' },
    { name: 'current', dir: spec.controls.known_current_fixture, expect: 'pass' }
  ];

  for (const { name, dir, expect } of expectations) {
    const controlDir = path.join(caseDir, dir);
    const restore = overlay(controlDir, fixtureDir);
    let run;
    try {
      run = await runCommand(spec.validator.command, caseDir, timeoutMs);
    } finally {
      restore();
    }
    const passed = run.exitCode === 0;
    const asExpected = expect === 'pass' ? passed : !passed;
    result.controls[name] = {
      expected: expect,
      exit_code: run.exitCode,
      timed_out: run.timedOut,
      as_expected: asExpected,
      duration_ms: run.durationMs,
      output_tail: run.output.split(/\r?\n/).filter(Boolean).slice(-12)
    };
    log(`  control:${name} expected=${expect} exit=${run.exitCode}${run.timedOut ? ' (TIMEOUT)' : ''} -> ${asExpected ? 'AS EXPECTED' : 'VIOLATION'}`);
    if (!wantJson) for (const l of result.controls[name].output_tail) log(`    | ${l}`);
  }

  const postHash = hashDir(fixtureDir);
  result.fixture_restored = preHash === postHash;
  if (!result.fixture_restored) log('  WARNING: fixture hash changed across the run (restore incomplete)');

  const discriminates = result.controls.stale?.as_expected && result.controls.current?.as_expected;
  result.verdict = discriminates && result.fixture_restored ? 'DISCRIMINATES' : 'FAILED';
  return result;
}

const all = listCases();
const selected = caseFilter ? all.filter((c) => c === caseFilter) : all;
if (selected.length === 0) {
  console.error(caseFilter ? `no case named ${caseFilter} under ${casesDir}` : `no cases found under ${casesDir}`);
  process.exit(2);
}

const results = [];
for (const caseId of selected) {
  log(`case ${caseId}`);
  results.push(await runCase(caseId));
}

const failed = results.filter((r) => r.verdict !== 'DISCRIMINATES');
if (wantJson) {
  console.log(JSON.stringify({ ran_at: new Date().toISOString(), cases: results, all_discriminate: failed.length === 0 }, null, 2));
} else {
  console.log('');
  console.log('summary:');
  for (const r of results) console.log(`  ${r.verdict === 'DISCRIMINATES' ? 'OK  ' : 'FAIL'} ${r.case_id} (stale exit ${r.controls.stale?.exit_code ?? '-'}, current exit ${r.controls.current?.exit_code ?? '-'})`);
  console.log(failed.length === 0
    ? `all ${results.length} case validator(s) discriminate their controls`
    : `${failed.length} of ${results.length} case(s) FAILED to discriminate`);
}
process.exit(failed.length === 0 ? 0 : 1);
