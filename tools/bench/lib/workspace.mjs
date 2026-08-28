// Workspace materialization for benchmark runs (round-3 reviewer contract):
//   - fresh temp workspace per run, OUTSIDE the benchmark repository
//   - the workspace receives ONLY the benchmark-authored starting tree
//     (fixture files; never controls, validators, answers, or prior outputs)
//   - workspace_hash covers exactly the tree the agent can see, minus
//     dependency directories (dependencies are attributed via the lockfile)
//   - a per-file SHA-256 starting manifest is produced so materialization can
//     be re-proven later
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function* walkFiles(dir, { skipNodeModules = true } = {}) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipNodeModules && entry.name === 'node_modules') continue;
      yield* walkFiles(p, { skipNodeModules });
    } else if (entry.isFile()) {
      yield p;
    }
  }
}

export function sha256File(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** Per-file hash manifest (relative POSIX paths -> sha256), node_modules excluded. */
export function hashManifest(dir) {
  const entries = {};
  for (const f of [...walkFiles(dir)].sort()) {
    entries[path.relative(dir, f).replaceAll('\\', '/')] = sha256File(f);
  }
  return entries;
}

/** Stable digest of a hash manifest. */
export function manifestDigest(entries) {
  const h = createHash('sha256');
  for (const [rel, digest] of Object.entries(entries).sort(([a], [b]) => (a < b ? -1 : 1))) {
    h.update(rel); h.update('\0'); h.update(digest); h.update('\0');
  }
  return h.digest('hex');
}

function copyTree(src, dest, { includeNodeModules }) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (!includeNodeModules && entry.name === 'node_modules') continue;
      copyTree(from, to, { includeNodeModules });
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

/**
 * Materialize a fresh run workspace from a case fixture: the authored tree
 * only. Dependencies are NOT copied from the fixture - the runner executes
 * the case's setup command inside the workspace so the runnable environment
 * is realized deterministically from the committed lockfile rather than
 * inherited from whatever node_modules the host happened to have.
 * Returns { workspaceDir, runRoot, startingManifest, workspaceHash }.
 */
export function materializeWorkspace({ fixtureDir, runId, baseDir }) {
  const runRoot = path.join(baseDir ?? path.join(os.tmpdir(), 'updapi-bench-runs'), runId);
  const workspaceDir = path.join(runRoot, 'workspace');
  if (fs.existsSync(workspaceDir)) throw new Error(`workspace already exists: ${workspaceDir}`);
  copyTree(fixtureDir, workspaceDir, { includeNodeModules: false });
  const startingManifest = hashManifest(workspaceDir);
  return { workspaceDir, runRoot, startingManifest, workspaceHash: manifestDigest(startingManifest) };
}

/** Overlay control files (same relative layout as the fixture) onto a workspace. */
export function overlayControl(controlDir, workspaceDir) {
  for (const src of walkFiles(controlDir)) {
    const dest = path.join(workspaceDir, path.relative(controlDir, src));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

/** Unified-diff of authored files between the starting manifest and the workspace now. */
export function workspaceDiff(startingManifest, fixtureDir, workspaceDir) {
  const lines = [];
  const current = hashManifest(workspaceDir);
  const all = new Set([...Object.keys(startingManifest), ...Object.keys(current)]);
  for (const rel of [...all].sort()) {
    const before = startingManifest[rel];
    const after = current[rel];
    if (before === after) continue;
    const beforeText = before ? safeRead(path.join(fixtureDir, rel)) : null;
    const afterText = after ? safeRead(path.join(workspaceDir, rel)) : null;
    lines.push(`--- a/${rel}`, `+++ b/${rel}`);
    if (beforeText !== null) for (const l of beforeText.split(/\r?\n/)) lines.push(`-${l}`);
    if (afterText !== null) for (const l of afterText.split(/\r?\n/)) lines.push(`+${l}`);
    lines.push('');
  }
  return lines.length ? lines.join('\n') : '(no authored-file changes)\n';
}

function safeRead(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
}
