// Control-condition adapter: no agent is invoked. The "implementation" is
// materialized by the runner from the case's known control files, so this
// adapter exists to make control runs first-class citizens of the same
// pipeline (manifest, workspace, validator, artifacts) as agent runs.
export const name = 'none';

export function describeAgent() {
  return { product: 'none', product_version: 'n/a', model: 'none' };
}

export async function run() {
  return { invoked: false, exitCode: null, timedOut: false, output: null };
}
