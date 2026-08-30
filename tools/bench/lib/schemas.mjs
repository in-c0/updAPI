// Shared compiled-schema access for the bench tooling. The runner validates
// its own emitted manifests/results against the committed schemas before
// writing them, so "runner outputs conform" is enforced, not asserted.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ajv = new Ajv2020.default({ allErrors: true, strict: true });
addFormats.default(ajv);

const compile = (name) =>
  ajv.compile(JSON.parse(fs.readFileSync(path.join(repoRoot, 'schemas', name), 'utf8')));

export const validators = {
  changeEvent: compile('change-event.schema.json'),
  benchmarkCase: compile('benchmark-case.schema.json'),
  runManifest: compile('run-manifest.schema.json'),
  runResult: compile('run-result.schema.json'),
  cohortPlan: compile('cohort-plan.schema.json'),
  isolationCanaryEvidence: compile('isolation-canary-evidence.schema.json')
};

export function assertValid(validator, data, label) {
  if (!validator(data)) {
    const details = validator.errors.map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');
    throw new Error(`${label} does not conform to its schema: ${details}`);
  }
}

export { repoRoot };
