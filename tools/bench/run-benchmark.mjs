// UpdAPI benchmark runner (round 3): one run = one case x one condition,
// executed in a fresh temp workspace OUTSIDE the repository, with full
// provenance, deterministic timeout semantics, normalized artifact capture,
// and schema-validated manifest/result emission. No GitHub Actions; this is
// the local/portable entry point (spec section 14).
//
// Usage:
//   node tools/bench/run-benchmark.mjs --case <case-id>
//        --condition control_stale|control_current|agent_default
//        [--adapter none|claude-code] [--timeout-ms 600000]
//        [--benchmark-version dev] [--out runs/local] [--keep]
//
// Exit codes: 0 = run recorded as scored, 3 = run recorded as invalid,
// 2 = usage error. A scored FAILURE still exits 0 - the runner's job is to
// record outcomes, not to have opinions about them.
import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validators, assertValid, repoRoot } from './lib/schemas.mjs';
import { materializeWorkspace, overlayControl, workspaceDiff, sha256Text, sha256File } from './lib/workspace.mjs';

const args = process.argv.slice(2);
const opt = (flag, fallback = null) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : fallback; };
const caseId = opt('--case');
const condition = opt('--condition');
const adapterName = opt('--adapter', condition === 'agent_default' ? 'claude-code' : 'none');
const timeoutMs = Number(opt('--timeout-ms', 600000));
const benchmarkVersion = opt('--benchmark-version', 'dev');
const outRoot = path.resolve(repoRoot, opt('--out', 'runs/local'));
const keep = args.includes('--keep');

const CONDITIONS = ['control_stale', 'control_current', 'agent_default'];
if (!caseId || !CONDITIONS.includes(condition)) {
  console.error(`usage: node tools/bench/run-benchmark.mjs --case <id> --condition ${CONDITIONS.join('|')} [--adapter none|claude-code]`);
  process.exit(2);
}

const casesDir = process.env.UPDAPI_CASES_DIR ? path.resolve(process.env.UPDAPI_CASES_DIR) : path.join(repoRoot, 'cases');
const caseDir = path.join(casesDir, caseId);
const caseSpec = JSON.parse(fs.readFileSync(path.join(caseDir, 'case.json'), 'utf8'));
assertValid(validators.benchmarkCase, caseSpec, `case ${caseId}`);
const fixtureDir = path.join(caseDir, caseSpec.workspace_fixture);

const runId = `${caseId.replace(/^case-/, '')}-${condition}-${crypto.randomBytes(5).toString('hex')}`;
const startedAt = new Date();
const log = (line) => console.log(`[${runId}] ${line}`);

// ---- provenance ----
const git = spawnSync('git rev-parse HEAD', { cwd: repoRoot, shell: true, encoding: 'utf8' });
const benchmarkCommit = git.status === 0 ? git.stdout.trim() : 'unknown';
// A commit SHA cannot identify a dirty worktree: record dirtiness plus a hash
// of the uncommitted diff, and refuse scored agent runs on a dirty tree
// unless explicitly allowed for development.
const dirtyProbe = spawnSync('git status --porcelain', { cwd: repoRoot, shell: true, encoding: 'utf8' });
const benchmarkDirty = dirtyProbe.status === 0 ? dirtyProbe.stdout.trim().length > 0 : true;
let benchmarkDiffSha = null;
if (benchmarkDirty) {
  const diff = spawnSync('git diff HEAD', { cwd: repoRoot, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  benchmarkDiffSha = diff.status === 0 ? sha256Text(diff.stdout) : 'unhashable';
}
if (benchmarkDirty && condition === 'agent_default' && !args.includes('--allow-dirty')) {
  console.error('refusing an agent_default run from a dirty benchmark worktree (pass --allow-dirty for a development run)');
  process.exit(2);
}
const npmProbe = spawnSync('npm --version', { shell: true, encoding: 'utf8', timeout: 60000 });
const adapterDir = process.env.UPDAPI_ADAPTER_DIR
  ? path.resolve(process.env.UPDAPI_ADAPTER_DIR)
  : path.join(repoRoot, 'tools', 'bench', 'adapters');
const adapterPath = path.join(adapterDir, `${adapterName}.mjs`);
const adapter = await import(new URL(`file:///${adapterPath.replaceAll('\\', '/')}`));
const adapterHash = sha256File(adapterPath);
const agentInfo = adapter.describeAgent();

const taskText = fs.readFileSync(path.join(caseDir, 'task.md'), 'utf8');
const lockPath = path.join(fixtureDir, 'package-lock.json');
const dependencyLockHash = fs.existsSync(lockPath) ? sha256File(lockPath) : 'none';

// ---- run record scaffolding ----
const runDir = path.join(outRoot, benchmarkVersion, caseId, condition, runId);
const artifactsDir = path.join(runDir, 'artifacts');
fs.mkdirSync(artifactsDir, { recursive: true });

let attemptStatus = 'scored';
let invalidReason = null;
let failureClass = null;
let verifiedSuccess = false;
let validatorExit = null;
let adapterOutcome = null;
let workspace = null;
const artifacts = [];

const writeArtifact = (name, content) => {
  const p = path.join(artifactsDir, name);
  fs.writeFileSync(p, content);
  artifacts.push(`artifacts/${name}`);
  return p;
};

let setupOk = true;
try {
  // 1. Fresh isolated workspace (outside the repo, per contract).
  workspace = materializeWorkspace({ fixtureDir, runId });
  log(`workspace ${workspace.workspaceDir}`);
  log(`workspace_hash ${workspace.workspaceHash}`);
  writeArtifact('task-prompt.md', taskText);
  writeArtifact('starting-hashes.json', JSON.stringify(workspace.startingManifest, null, 2));

  // 1b. Execute the case's setup command INSIDE the workspace so the runnable
  // environment is realized deterministically (npm ci from the committed
  // lockfile for node fixtures), never inherited from host residue. Setup
  // failure is an INVALID experiment; the control/agent is never invoked.
  if (caseSpec.setup?.install_command) {
    log(`setup: ${caseSpec.setup.install_command}`);
    const setup = await runCommand(caseSpec.setup.install_command, workspace.workspaceDir, 900000, {});
    writeArtifact('setup.log', setup.output || '(no output)');
    if (setup.spawnError || setup.exitCode !== 0) {
      attemptStatus = 'invalid';
      invalidReason = `setup failed (exit ${setup.exitCode ?? 'spawn-error'}): ${setup.spawnError ?? 'see setup.log'}`;
      failureClass = 'environment_error';
      setupOk = false;
      log(`INVALID: ${invalidReason}`);
    }
  }

  // 2. Produce the implementation under test.
  if (!setupOk) {
    // setup failed - nothing else may run
  } else if (condition === 'control_stale' || condition === 'control_current') {
    const controlKey = condition === 'control_stale' ? 'known_stale_fixture' : 'known_current_fixture';
    overlayControl(path.join(caseDir, caseSpec.controls[controlKey]), workspace.workspaceDir);
    log(`overlaid ${condition} implementation`);
  } else {
    log(`invoking adapter ${adapterName} (timeout ${timeoutMs}ms)`);
    adapterOutcome = await adapter.run({ workspaceDir: workspace.workspaceDir, prompt: taskText, timeoutMs, log });
    writeArtifact('adapter-output.json', JSON.stringify(adapterOutcome, null, 2));
    if (adapterOutcome.spawnError || adapterOutcome.invoked === false) {
      attemptStatus = 'invalid';
      invalidReason = `adapter did not invoke: ${adapterOutcome.spawnError ?? 'unavailable'}`;
      failureClass = 'adapter_error';
    } else if (adapterOutcome.timedOut) {
      // Contract: a HARNESS timeout of a correctly invoked agent is a SCORED
      // failure, even if the partial workspace would subsequently validate.
      failureClass = 'budget_exhausted';
    } else {
      // Normalize the product's own result contract (round-3 review blocker
      // 2): infrastructure failures are invalid experiments, never scored.
      const classification = adapterOutcome.classification ?? 'completed';
      if (classification === 'infrastructure_error') {
        attemptStatus = 'invalid';
        invalidReason = `agent infrastructure failure (product reported ${adapterOutcome.output?.subtype ?? adapterOutcome.output?.terminal_reason ?? 'error'})`;
        failureClass = 'adapter_error';
      } else if (classification === 'malformed_output') {
        attemptStatus = 'invalid';
        invalidReason = 'agent produced no parseable result payload although JSON output was contractually requested';
        failureClass = 'adapter_error';
      } else if (classification === 'agent_budget_exhausted') {
        // The product exhausted its own turn/budget limits: scored failure.
        failureClass = 'budget_exhausted';
      }
    }
  }

  // 3. Deterministic validator, pointed at the isolated workspace.
  if (attemptStatus === 'scored') {
    const v = await runCommand(caseSpec.validator.command, caseDir, caseSpec.validator.timeout_ms ?? 120000, {
      UPDAPI_WORKSPACE: workspace.workspaceDir
    });
    writeArtifact('validator.log', v.output);
    validatorExit = v.exitCode;
    // Symmetric verdict-marker contract (round-3 review blocker 3): exactly
    // one internally consistent verdict is accepted.
    //   exit 0   + RESULT PASS (and not FAIL) -> scored pass
    //   non-zero + RESULT FAIL (and not PASS) -> scored fail
    //   anything else (either exit without its marker, contradictory
    //   exit/marker, both markers, timeout, spawn failure) -> INVALID
    //   validator malfunction, never a scored model outcome.
    const sawPass = /RESULT PASS/.test(v.output);
    const sawFail = /RESULT FAIL/.test(v.output);
    const consistentPass = v.exitCode === 0 && sawPass && !sawFail;
    const consistentFail = v.exitCode !== null && v.exitCode !== 0 && sawFail && !sawPass;
    if (v.spawnError) {
      attemptStatus = 'invalid';
      invalidReason = `validator could not run: ${v.spawnError}`;
      failureClass = 'validator_error';
    } else if (!consistentPass && !consistentFail) {
      attemptStatus = 'invalid';
      invalidReason = `validator rendered no consistent verdict (exit ${v.timedOut ? 'timeout' : v.exitCode}, RESULT PASS=${sawPass}, RESULT FAIL=${sawFail})`;
      failureClass = 'validator_error';
    } else {
      const timedOutAgent = adapterOutcome?.timedOut === true;
      verifiedSuccess = consistentPass && !timedOutAgent;
      if (timedOutAgent && consistentPass) log('validator passed AFTER agent timeout - scored as failure per contract');
      if (!verifiedSuccess && failureClass === null) {
        failureClass = condition === 'control_stale' ? 'stale_api_use' : 'unknown';
      }
    }
  }

  // 4. Final patch (authored files only).
  writeArtifact('final.patch', workspaceDiff(workspace.startingManifest, fixtureDir, workspace.workspaceDir));
} catch (err) {
  attemptStatus = 'invalid';
  invalidReason = invalidReason ?? `harness error: ${err.message}`;
  failureClass = failureClass ?? 'environment_error';
  verifiedSuccess = false;
  log(`INVALID: ${invalidReason}`);
}

const durationMs = Date.now() - startedAt.getTime();

// 5. Artifact integrity index (hash of every artifact written so far).
const index = {};
for (const rel of artifacts) index[rel] = sha256File(path.join(runDir, rel));
writeArtifact('artifact-index.json', JSON.stringify(index, null, 2));

// 6. Manifest + result, schema-validated BEFORE writing.
const manifest = {
  schema_version: '0.2.0',
  benchmark_version: benchmarkVersion,
  benchmark_commit: benchmarkCommit,
  benchmark_dirty: benchmarkDirty,
  benchmark_diff_sha256: benchmarkDiffSha,
  run_id: runId,
  case_id: caseSpec.case_id,
  case_version: caseSpec.case_version,
  started_at: startedAt.toISOString(),
  condition,
  agent: {
    product: agentInfo.product,
    product_version: agentInfo.product_version,
    // Prefer the model the product itself reported for this run over the
    // adapter's static description (recorded as unknown when not exposed).
    model: adapterOutcome?.output?.modelUsage
      ? Object.keys(adapterOutcome.output.modelUsage).join(',')
      : agentInfo.model,
    reasoning_setting: agentInfo.reasoning_setting ?? 'unknown'
  },
  adapter: { name: adapterName, hash: adapterHash },
  task_sha256: sha256Text(taskText),
  tools: condition === 'agent_default'
    ? { web_search: 'unknown', repository_access: 'allowed', execution: 'allowed', package_install: 'allowed', retrieval_mcp: 'unknown' }
    : { web_search: 'unavailable', repository_access: 'unavailable', execution: 'unavailable', retrieval_mcp: 'unavailable' },
  environment: {
    os: `${os.platform()} ${os.release()}`,
    runtime: `node ${process.version}`,
    package_manager: npmProbe.status === 0 ? `npm ${npmProbe.stdout.trim()}` : 'unknown',
    container: 'none'
  },
  workspace_hash: workspace?.workspaceHash ?? 'unmaterialized',
  dependency_lock_hash: dependencyLockHash,
  budgets: { timeout_ms: timeoutMs },
  harness_retries_allowed: 0,
  duration_ms: durationMs,
  usage: adapterOutcome?.output?.usage
    ? {
        tokens_in: adapterOutcome.output.usage.input_tokens ?? null,
        tokens_out: adapterOutcome.output.usage.output_tokens ?? null,
        cost_usd_estimate: adapterOutcome.output.total_cost_usd ?? null
      }
    : undefined
};
if (manifest.usage === undefined) delete manifest.usage;
if (condition === 'agent_default') {
  // Honest condition labeling until the read-isolation + clean-context
  // boundary lands (round-3 review, blocker 4): host-context runs are
  // development-only evidence.
  manifest.notes = 'host-context development run: OS-level read isolation and clean agent-context suppression are not yet enforced for this condition';
}
assertValid(validators.runManifest, manifest, 'run manifest');
fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

const result = {
  schema_version: '0.2.0',
  run_id: runId,
  case_id: caseSpec.case_id,
  attempt_status: attemptStatus,
  invalid_reason: invalidReason,
  verified_success: verifiedSuccess,
  validator_exit_code: validatorExit,
  initial_stale_use: condition === 'control_stale' ? true : condition === 'control_current' ? false : null,
  recovered: condition === 'control_stale' ? false : null,
  failure_class: verifiedSuccess ? null : failureClass,
  tool_trace_summary: {},
  duration_ms: durationMs,
  artifacts
};
assertValid(validators.runResult, result, 'run result');
fs.writeFileSync(path.join(runDir, 'result.json'), JSON.stringify(result, null, 2));

// 7. Cleanup (kept on --keep or invalid runs, for diagnosis).
if (workspace && !keep && attemptStatus === 'scored') {
  fs.rmSync(workspace.runRoot, { recursive: true, force: true });
} else if (workspace) {
  log(`workspace retained: ${workspace.runRoot}`);
}

log(`attempt_status=${attemptStatus} verified_success=${verifiedSuccess} validator_exit=${validatorExit} duration_ms=${durationMs}`);
log(`recorded: ${path.relative(repoRoot, runDir).replaceAll('\\', '/')}`);
process.exit(attemptStatus === 'scored' ? 0 : 3);

function runCommand(command, cwd, cmdTimeoutMs, extraEnv) {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, windowsHide: true, env: { ...process.env, ...extraEnv } });
    let out = '';
    let timedOut = false;
    const cap = (c) => { out += c; if (out.length > 500000) out = out.slice(-500000); };
    child.stdout.on('data', cap);
    child.stderr.on('data', cap);
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32') spawnSync(`taskkill /PID ${child.pid} /T /F`, { shell: true });
      else child.kill('SIGKILL');
    }, cmdTimeoutMs);
    child.on('error', (err) => { clearTimeout(timer); resolve({ spawnError: String(err), exitCode: null, output: out }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ exitCode: timedOut ? null : code, timedOut, output: out }); });
  });
}
