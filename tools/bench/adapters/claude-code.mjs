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
