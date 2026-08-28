// Deterministic validator for case-mcp-serverinfo-discover-v2.
// Exit 0 = verified success; non-zero = failure. No LLM involvement.
// The oracle is behavioural: the solution must return the identity the
// fixture server actually declares, over a real (in-process) MCP exchange.
const failures = [];
const ok = (cond, label, detail) => {
  if (cond) console.log(`PASS ${label}`);
  else { console.log(`FAIL ${label}${detail ? ' - ' + detail : ''}`); failures.push(label); }
};

const { SERVER_NAME, SERVER_VERSION, SERVER_URL, serverFetch } =
  await import(new URL('../fixture/src/server-harness.mjs', import.meta.url));

let solution = null;
try {
  solution = await import(new URL('../fixture/src/solution.mjs', import.meta.url));
} catch (err) {
  console.log(`FAIL solution-loads - ${err.constructor.name}: ${String(err.message).split('\n')[0]}`);
  process.exit(1);
}
console.log('PASS solution-loads');
ok(typeof solution.getServerIdentity === 'function', 'exports-getServerIdentity');

if (typeof solution.getServerIdentity === 'function') {
  let identity = null;
  let callError = null;
  const guard = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timed out after 45s')), 45000).unref?.());
  try {
    identity = await Promise.race([
      solution.getServerIdentity({ url: SERVER_URL, fetch: serverFetch }),
      guard
    ]);
  } catch (err) {
    callError = err;
  }
  ok(callError === null, 'connects-and-returns',
    callError && `${callError.name ?? 'Error'}: ${String(callError.message).split('\n')[0]}`);
  if (callError === null) {
    ok(identity != null && typeof identity === 'object', 'identity-is-object', `got ${typeof identity}`);
    ok(identity?.name === SERVER_NAME, 'identity-name', `got ${JSON.stringify(identity?.name)}`);
    ok(identity?.version === SERVER_VERSION, 'identity-version', `got ${JSON.stringify(identity?.version)}`);
  }
}

if (failures.length > 0) {
  console.log(`RESULT FAIL (${failures.length} failed)`);
  process.exit(1);
}
console.log('RESULT PASS');
process.exit(0);
