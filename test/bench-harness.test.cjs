// Control-harness selftest. The harness's whole job is to refuse validators
// that cannot discriminate, so the first assertion here is the negative
// control: a case whose validator passes BOTH controls must make the harness
// exit non-zero. Then a genuinely discriminating case must pass.
const { execFileSync } = require('node:child_process');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const harness = path.join(repoRoot, 'tools', 'bench', 'run-controls.mjs');

function runHarness(casesDir, extraArgs = []) {
  try {
    const stdout = execFileSync(process.execPath, [harness, '--json', ...extraArgs], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, UPDAPI_CASES_DIR: casesDir }
    });
    return { code: 0, output: stdout };
  } catch (err) {
    return { code: err.status, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

function writeSyntheticCase(root, { discriminating }) {
  const caseDir = path.join(root, 'case-synthetic');
  fs.mkdirSync(path.join(caseDir, 'fixture'), { recursive: true });
  fs.mkdirSync(path.join(caseDir, 'controls', 'stale'), { recursive: true });
  fs.mkdirSync(path.join(caseDir, 'controls', 'current'), { recursive: true });
  fs.mkdirSync(path.join(caseDir, 'validator'), { recursive: true });

  fs.writeFileSync(path.join(caseDir, 'fixture', 'impl.txt'), 'STUB\n');
  fs.writeFileSync(path.join(caseDir, 'controls', 'stale', 'impl.txt'), 'OLD\n');
  fs.writeFileSync(path.join(caseDir, 'controls', 'current', 'impl.txt'), 'NEW\n');

  const validator = discriminating
    ? `const fs = require('node:fs');
       const path = require('node:path');
       const v = fs.readFileSync(path.join(__dirname, '..', 'fixture', 'impl.txt'), 'utf8').trim();
       process.exit(v === 'NEW' ? 0 : 1);`
    : `process.exit(0); // accepts everything - must be refused by the harness`;
  fs.writeFileSync(path.join(caseDir, 'validator', 'check.cjs'), validator);

  fs.writeFileSync(path.join(caseDir, 'case.json'), JSON.stringify({
    schema_version: '0.1.0',
    case_id: 'case-synthetic',
    event_id: 'synthetic.synthetic.2026-01-01.selftest',
    case_version: 1,
    task: 'Synthetic selftest case exercising the harness overlay/restore/expectation machinery.',
    workspace_fixture: 'fixture',
    solution_path: 'impl.txt',
    target_environment: { runtime: 'node', runtime_version: '>=22', dependencies: {} },
    setup: { install_command: 'node -e "process.exit(0)"' },
    validator: { kind: 'command', command: 'node validator/check.cjs', timeout_ms: 30000 },
    controls: { known_stale_fixture: 'controls/stale', known_current_fixture: 'controls/current' }
  }, null, 2));
  return caseDir;
}

describe('bench control harness', function () {
  this.timeout(60000);

  it('negative control: refuses a validator that passes both controls', function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'updapi-harness-nc-'));
    try {
      writeSyntheticCase(root, { discriminating: false });
      const r = runHarness(root);
      assert.notStrictEqual(r.code, 0, `harness accepted a non-discriminating validator:\n${r.output}`);
      const report = JSON.parse(r.output);
      assert.strictEqual(report.all_discriminate, false);
      assert.strictEqual(report.cases[0].controls.stale.as_expected, false, 'stale control should be flagged');
      assert.strictEqual(report.cases[0].controls.current.as_expected, true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts a discriminating case and restores the fixture byte-identically', function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'updapi-harness-ok-'));
    try {
      const caseDir = writeSyntheticCase(root, { discriminating: true });
      const before = fs.readFileSync(path.join(caseDir, 'fixture', 'impl.txt'), 'utf8');
      const r = runHarness(root);
      assert.strictEqual(r.code, 0, `expected exit 0:\n${r.output}`);
      const report = JSON.parse(r.output);
      assert.strictEqual(report.all_discriminate, true);
      assert.strictEqual(report.cases[0].verdict, 'DISCRIMINATES');
      assert.strictEqual(report.cases[0].fixture_restored, true);
      const after = fs.readFileSync(path.join(caseDir, 'fixture', 'impl.txt'), 'utf8');
      assert.strictEqual(after, before, 'fixture must be restored after the run');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
