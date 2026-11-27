// Dataset validation: the real tree must validate, and — the part that makes
// the first assertion meaningful — a deliberately broken tree must be REJECTED.
// A validator that cannot fail is not evidence (see verify-alignment.mjs for
// the same discipline on the legacy dataset).
const { execFileSync } = require('node:child_process');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const tool = path.join(repoRoot, 'tools', 'bench', 'validate-data.mjs');

function runValidator(args) {
  try {
    const stdout = execFileSync(process.execPath, [tool, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, output: stdout };
  } catch (err) {
    return { code: err.status, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

describe('bench dataset validation', function () {
  this.timeout(30000);

  it('accepts the committed events and cases', function () {
    const r = runValidator([]);
    assert.strictEqual(r.code, 0, `expected exit 0, got ${r.code}:\n${r.output}`);
    assert.match(r.output, /bench:validate OK/);
  });

  it('negative control: rejects a tree with an invalid event and a dangling case reference', function () {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'updapi-validate-nc-'));
    try {
      // Real schemas, broken data.
      fs.cpSync(path.join(repoRoot, 'schemas'), path.join(root, 'schemas'), { recursive: true });
      const eventsDir = path.join(root, 'events', 'x', 'y');
      fs.mkdirSync(eventsDir, { recursive: true });
      const goodEvent = JSON.parse(fs.readFileSync(
        path.join(repoRoot, 'events', 'openai', 'openai', 'openai.openai.2026-07-27.node22-runtime-floor.json'), 'utf8'));
      const broken = { ...goodEvent, change: { ...goodEvent.change, type: 'not-a-real-change-type' } };
      fs.writeFileSync(path.join(eventsDir, `${broken.id}.json`), JSON.stringify(broken));

      // Second broken event: claims verified status while carrying no verified_at.
      const broken2 = { ...goodEvent, id: 'openai.openai.2026-07-27.no-verified-at', status: 'verified' };
      delete broken2.verified_at;
      fs.writeFileSync(path.join(eventsDir, `${broken2.id}.json`), JSON.stringify(broken2));

      // Third broken event: schema-valid but future-dated verified_at, so the
      // temporal-integrity check (not the schema) must be what rejects it.
      const broken3 = {
        ...goodEvent,
        id: 'openai.openai.2026-07-27.future-verified-at',
        verified_at: new Date(Date.now() + 86_400_000).toISOString()
      };
      fs.writeFileSync(path.join(eventsDir, `${broken3.id}.json`), JSON.stringify(broken3));

      const caseDir = path.join(root, 'cases', 'case-dangling');
      fs.mkdirSync(caseDir, { recursive: true });
      fs.writeFileSync(path.join(caseDir, 'case.json'), JSON.stringify({
        schema_version: '0.1.0',
        case_id: 'case-dangling',
        event_id: 'nobody.nothing.2026-01-01.missing',
        case_version: 1,
        task: 'A task string long enough to satisfy the schema minimum length requirement.',
        workspace_fixture: 'fixture',
        target_environment: { runtime: 'node', runtime_version: '>=22', dependencies: {} },
        setup: { install_command: 'true' },
        validator: { kind: 'command', command: 'node -e "process.exit(0)"' },
        controls: { known_stale_fixture: 'controls/stale', known_current_fixture: 'controls/current' }
      }));

      const r = runValidator(['--root', root]);
      assert.notStrictEqual(r.code, 0, `validator accepted a broken tree:\n${r.output}`);
      assert.match(r.output, /not-a-real-change-type|must be equal to one of the allowed values/);
      assert.match(r.output, /does not match any event/);
      assert.match(r.output, /workspace_fixture missing/);
      assert.match(r.output, /verified_at is future-dated/);
      assert.match(r.output, /status verified requires verified_at/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
