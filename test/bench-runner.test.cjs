// Round-3 runner contract tests:
//   - materialization determinism: the same fixture materializes to the same
//     workspace hash, twice
//   - zero mutation leakage: a run that mutates workspace A leaves workspace B
//     and the source fixture byte-identical
//   - end-to-end pipeline on a synthetic case: manifest/result emitted and
//     schema-conformant, control_stale scored-failed, control_current
//     scored-passed, fixture untouched
//   - invalid-experiment path: a validator that cannot run yields
//     attempt_status=invalid, never a scored model failure
const { execFileSync } = require('node:child_process');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const runner = path.join(repoRoot, 'tools', 'bench', 'run-benchmark.mjs');

function runRunner(casesDir, outDir, args) {
  try {
    const stdout = execFileSync(process.execPath, [runner, ...args, '--out', outDir], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, UPDAPI_CASES_DIR: casesDir }
    });
    return { code: 0, output: stdout };
  } catch (err) {
    return { code: err.status, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

function writeSyntheticCase(root, { breakValidator = false } = {}) {
  const caseDir = path.join(root, 'case-synthetic-runner');
  fs.mkdirSync(path.join(caseDir, 'fixture', 'src'), { recursive: true });
  fs.mkdirSync(path.join(caseDir, 'controls', 'stale', 'src'), { recursive: true });
  fs.mkdirSync(path.join(caseDir, 'controls', 'current', 'src'), { recursive: true });
  fs.mkdirSync(path.join(caseDir, 'validator'), { recursive: true });

  fs.writeFileSync(path.join(caseDir, 'task.md'), '# Task\nWrite NEW into src/impl.txt.\n');
  fs.writeFileSync(path.join(caseDir, 'fixture', 'src', 'impl.txt'), 'STUB\n');
  fs.writeFileSync(path.join(caseDir, 'controls', 'stale', 'src', 'impl.txt'), 'OLD\n');
  fs.writeFileSync(path.join(caseDir, 'controls', 'current', 'src', 'impl.txt'), 'NEW\n');
  fs.writeFileSync(path.join(caseDir, 'validator', 'check.cjs'), `
    const fs = require('node:fs');
    const path = require('node:path');
    const ws = process.env.UPDAPI_WORKSPACE || path.join(__dirname, '..', 'fixture');
    const v = fs.readFileSync(path.join(ws, 'src', 'impl.txt'), 'utf8').trim();
    if (v === 'NEW') { console.log('RESULT PASS'); process.exit(0); }
    console.log('RESULT FAIL (saw ' + v + ')');
    process.exit(1);
  `);
  fs.writeFileSync(path.join(caseDir, 'case.json'), JSON.stringify({
    schema_version: '0.1.0',
    case_id: 'case-synthetic-runner',
    event_id: 'synthetic.synthetic.2026-01-01.runner-selftest',
    case_version: 1,
    task: 'Synthetic runner selftest case exercising workspace isolation and scoring.',
    workspace_fixture: 'fixture',
    solution_path: 'src/impl.txt',
    target_environment: { runtime: 'node', runtime_version: '>=22', dependencies: {} },
    setup: { install_command: 'node -e "process.exit(0)"' },
    validator: {
      kind: 'command',
      command: breakValidator ? 'node validator/does-not-exist.cjs' : 'node validator/check.cjs',
      timeout_ms: 30000
    },
    controls: { known_stale_fixture: 'controls/stale', known_current_fixture: 'controls/current' }
  }, null, 2));
  return caseDir;
}

function hashTree(dir) {
  const { createHash } = require('node:crypto');
  const h = createHash('sha256');
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
      else { h.update(path.relative(dir, p)); h.update(fs.readFileSync(p)); }
    }
  };
  walk(dir);
  return h.digest('hex');
}

function findRunDirs(outDir) {
  const found = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (!e.isDirectory()) continue;
      if (fs.existsSync(path.join(p, 'result.json'))) found.push(p);
      else walk(p);
    }
  };
  if (fs.existsSync(outDir)) walk(outDir);
  return found;
}

describe('bench benchmark runner', function () {
  this.timeout(120000);

  it('materializes deterministically and leaks no mutation into the fixture', function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'updapi-runner-mat-'));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'updapi-runner-out-'));
    try {
      const caseDir = writeSyntheticCase(root);
      const fixtureBefore = hashTree(path.join(caseDir, 'fixture'));

      const r1 = runRunner(root, outDir, ['--case', 'case-synthetic-runner', '--condition', 'control_current']);
      assert.strictEqual(r1.code, 0, r1.output);
      const r2 = runRunner(root, outDir, ['--case', 'case-synthetic-runner', '--condition', 'control_current']);
      assert.strictEqual(r2.code, 0, r2.output);

      const runs = findRunDirs(outDir);
      assert.strictEqual(runs.length, 2);
      const manifests = runs.map((d) => JSON.parse(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8')));
      assert.strictEqual(manifests[0].workspace_hash, manifests[1].workspace_hash,
        'identical fixtures must materialize to identical workspace hashes');

      assert.strictEqual(hashTree(path.join(caseDir, 'fixture')), fixtureBefore,
        'runs must never mutate the source fixture');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('scores stale as failure and current as success, with conformant records', function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'updapi-runner-e2e-'));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'updapi-runner-out2-'));
    try {
      writeSyntheticCase(root);
      const stale = runRunner(root, outDir, ['--case', 'case-synthetic-runner', '--condition', 'control_stale']);
      assert.strictEqual(stale.code, 0, stale.output);
      const current = runRunner(root, outDir, ['--case', 'case-synthetic-runner', '--condition', 'control_current']);
      assert.strictEqual(current.code, 0, current.output);

      const runs = findRunDirs(outDir);
      const byCondition = {};
      for (const d of runs) {
        const res = JSON.parse(fs.readFileSync(path.join(d, 'result.json'), 'utf8'));
        const man = JSON.parse(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8'));
        byCondition[man.condition] = { res, man, dir: d };
      }
      assert.strictEqual(byCondition.control_stale.res.attempt_status, 'scored');
      assert.strictEqual(byCondition.control_stale.res.verified_success, false);
      assert.strictEqual(byCondition.control_stale.res.failure_class, 'stale_api_use');
      assert.strictEqual(byCondition.control_current.res.attempt_status, 'scored');
      assert.strictEqual(byCondition.control_current.res.verified_success, true);
      assert.strictEqual(byCondition.control_current.res.failure_class, null);

      for (const { res, dir } of Object.values(byCondition)) {
        for (const rel of ['artifacts/task-prompt.md', 'artifacts/starting-hashes.json', 'artifacts/final.patch', 'artifacts/validator.log', 'artifacts/artifact-index.json']) {
          assert.ok(res.artifacts.includes(rel), `missing artifact listing ${rel}`);
          assert.ok(fs.existsSync(path.join(dir, rel)), `missing artifact file ${rel}`);
        }
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('records a broken validator as an INVALID experiment, not a model failure', function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'updapi-runner-inv-'));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'updapi-runner-out3-'));
    try {
      writeSyntheticCase(root, { breakValidator: true });
      const r = runRunner(root, outDir, ['--case', 'case-synthetic-runner', '--condition', 'control_current']);
      assert.strictEqual(r.code, 3, `expected invalid exit 3:\n${r.output}`);
      const runs = findRunDirs(outDir);
      assert.strictEqual(runs.length, 1);
      const res = JSON.parse(fs.readFileSync(path.join(runs[0], 'result.json'), 'utf8'));
      assert.strictEqual(res.attempt_status, 'invalid');
      assert.strictEqual(res.verified_success, false);
      assert.match(res.invalid_reason ?? '', /validator/i);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});
