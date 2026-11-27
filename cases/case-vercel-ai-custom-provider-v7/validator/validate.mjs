// Deterministic validator for case-vercel-ai-custom-provider-v7.
// Exit 0 = verified success; non-zero = failure. No LLM involvement.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The workspace under validation: the case fixture by default, or an isolated
// copy when the benchmark runner sets UPDAPI_WORKSPACE.
const wsRoot = process.env.UPDAPI_WORKSPACE
  ? pathToFileURL(path.resolve(process.env.UPDAPI_WORKSPACE) + path.sep)
  : new URL('../fixture/', import.meta.url);

const failures = [];
const ok = (cond, label, detail) => {
  if (cond) console.log(`PASS ${label}`);
  else { console.log(`FAIL ${label}${detail ? ' - ' + detail : ''}`); failures.push(label); }
};

let solution = null;
let loadError = null;
try {
  solution = await import(new URL('src/solution.mjs', wsRoot));
} catch (err) {
  loadError = err;
}

if (loadError) {
  // A workspace whose solution cannot even load has not implemented the task.
  console.log(`FAIL solution-loads - ${loadError.constructor.name}: ${String(loadError.message).split('\n')[0]}`);
  console.log('RESULT FAIL (solution failed to load)');
  process.exit(1);
}
console.log('PASS solution-loads');

const { stubFastModel } = await import(new URL('src/stub-model.mjs', wsRoot));
const provider = solution.provider;

ok(provider != null && typeof provider === 'object', 'provider-exported', `got ${typeof provider}`);
ok(typeof provider?.languageModel === 'function', 'provider-has-languageModel');

if (typeof provider?.languageModel === 'function') {
  let resolved = null;
  let resolveError = null;
  try { resolved = provider.languageModel('fast'); } catch (err) { resolveError = err; }
  ok(resolveError === null, 'fast-resolves', resolveError && resolveError.message);
  // ai@7's registry may wrap a registered model in a compatibility shim
  // (observed: a v2-spec stub comes back wrapped, with an SDK warning), so
  // the behavioural contract is modelId preservation, not object identity.
  ok(resolved != null && resolved.modelId === stubFastModel.modelId, 'fast-preserves-modelId',
    `expected ${stubFastModel.modelId}, got ${resolved && resolved.modelId}`);
  // Do not read specificationVersion off the resolved model: ai@7's compat
  // wrapper is a Proxy that rewrites it ('v2' -> 'v4'), which violates the JS
  // proxy invariant against the frozen stub target and throws TypeError.
  if (resolved) console.log(`INFO resolved model: modelId=${resolved.modelId} wrapped=${resolved !== stubFastModel}`);

  let unknownThrew = false;
  let unknownErrName = '';
  try { provider.languageModel('model-that-does-not-exist'); }
  catch (err) { unknownThrew = true; unknownErrName = err?.name ?? ''; }
  ok(unknownThrew, 'unknown-id-throws', 'provider without fallback must not silently resolve unknown ids');
  if (unknownThrew) console.log(`INFO unknown-id error name: ${unknownErrName}`);
}

if (failures.length > 0) {
  console.log(`RESULT FAIL (${failures.length} failed)`);
  process.exit(1);
}
console.log('RESULT PASS');
