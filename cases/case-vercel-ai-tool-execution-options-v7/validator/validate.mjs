// Deterministic validator for case-vercel-ai-tool-execution-options-v7:
// strict compilation by the TypeScript version pinned in the fixture.
// Resolves the pinned compiler's bin from the fixture's own node_modules so
// the validator keeps working across TS major layouts (5.x JS, 7.x native).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const caseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = path.join(caseDir, 'fixture');
const tsPkgDir = path.join(fixtureDir, 'node_modules', 'typescript');
const tsPkg = JSON.parse(fs.readFileSync(path.join(tsPkgDir, 'package.json'), 'utf8'));
const binRel = typeof tsPkg.bin === 'string' ? tsPkg.bin : tsPkg.bin?.tsc;
if (!binRel) {
  console.log('FAIL tsc-bin-not-found - typescript package exposes no tsc bin');
  process.exit(1);
}
const tscBin = path.join(tsPkgDir, binRel);

const run = spawnSync(process.execPath, [tscBin, '--noEmit', '-p', path.join(fixtureDir, 'tsconfig.json')], {
  encoding: 'utf8',
  timeout: 110000
});
const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim();
console.log(`INFO typescript ${tsPkg.version}`);
if (output) console.log(output.split(/\r?\n/).slice(0, 20).join('\n'));
if (run.status === 0) {
  console.log('RESULT PASS (strict compile clean)');
  process.exit(0);
}
console.log(`RESULT FAIL (tsc exit ${run.status})`);
process.exit(1);
