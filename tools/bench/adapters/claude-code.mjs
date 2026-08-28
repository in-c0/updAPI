// Claude Code headless adapter.
//
// Invokes the locally installed `claude` CLI in print mode inside the run
// workspace, with the task prompt on stdin. Timeout kills the whole process
// tree deterministically (taskkill /T on Windows, negative-pid signal on
// POSIX); per the round-3 contract a timeout of a correctly invoked agent is
// a SCORED failure, never an invalid experiment.
import { spawn, spawnSync } from 'node:child_process';

export const name = 'claude-code';

export function describeAgent() {
  const probe = spawnSync('claude --version', { shell: true, encoding: 'utf8', timeout: 30000 });
  const version = probe.status === 0 ? probe.stdout.trim().split(/\r?\n/)[0] : null;
  return {
    product: 'claude-code',
    product_version: version ?? 'unknown',
    model: 'unknown',
    reasoning_setting: 'unknown',
    available: probe.status === 0
  };
}

function killTree(child) {
  try {
    if (process.platform === 'win32') {
      spawnSync(`taskkill /PID ${child.pid} /T /F`, { shell: true });
    } else {
      process.kill(-child.pid, 'SIGKILL');
    }
  } catch { /* already gone */ }
}

/**
 * Normalize the product's own result contract so infrastructure failures can
 * never be scored as model failures (round-3 review, blocker 2):
 *   completed               -> scored, judged by the case validator
 *   agent_budget_exhausted  -> scored failure (the product ran out of its own
 *                              turn/budget limits while correctly invoked)
 *   infrastructure_error    -> INVALID (auth/provider/CLI/internal execution
 *                              failure - the agent never got a fair attempt)
 *   malformed_output        -> INVALID (JSON was contractually requested and
 *                              not returned; not proven to be a completed task)
 */
export function classifyOutput(parsed, { timedOut = false, exitCode = null } = {}) {
  if (timedOut) return 'harness_timeout';
  if (!parsed || typeof parsed !== 'object') return 'malformed_output';
  const subtype = parsed.subtype ?? null;
  if (subtype === 'error_max_turns' || subtype === 'error_max_budget_usd') return 'agent_budget_exhausted';
  if (typeof subtype === 'string' && subtype.startsWith('error')) return 'infrastructure_error';
  if (parsed.is_error === true) return 'infrastructure_error';
  if (subtype === 'success' || parsed.is_error === false || parsed.terminal_reason === 'completed') return 'completed';
  if (exitCode !== null && exitCode !== 0) return 'infrastructure_error';
  return 'completed';
}

export function run({ workspaceDir, prompt, timeoutMs, log = () => {} }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn('claude -p --output-format json --dangerously-skip-permissions', {
      cwd: workspaceDir,
      shell: true,
      detached: process.platform !== 'win32',
      windowsHide: true
    });
    let out = '';
    let err = '';
    let timedOut = false;
    child.stdout.on('data', (c) => { out += c; if (out.length > 2_000_000) out = out.slice(-2_000_000); });
    child.stderr.on('data', (c) => { err += c; if (err.length > 200_000) err = err.slice(-200_000); });
    const timer = setTimeout(() => { timedOut = true; log('adapter timeout - killing process tree'); killTree(child); }, timeoutMs);
    child.on('error', (spawnErr) => {
      clearTimeout(timer);
      resolve({ invoked: false, spawnError: String(spawnErr), exitCode: null, timedOut: false, output: null, stderr: err, durationMs: Date.now() - started });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      let parsed = null;
      try { parsed = JSON.parse(out); } catch { /* non-JSON output is kept raw */ }
      resolve({
        invoked: true,
        exitCode: timedOut ? null : code,
        timedOut,
        classification: classifyOutput(parsed, { timedOut, exitCode: timedOut ? null : code }),
        output: parsed,
        rawOutput: parsed ? null : out.slice(-100_000),
        stderr: err.slice(-20_000),
        durationMs: Date.now() - started
      });
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}
