#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertValid, validators } from './lib/schemas.mjs';
import { assertCohortSemantics, assertCanaryQualifiesCell, sha256 } from './lib/cohort.mjs';

function usage() {
  console.error('Usage: node tools/bench/validate-cohort.mjs <plan.json> [--canary <evidence.json>]...');
  process.exit(2);
}

const args = process.argv.slice(2);
if (args.length < 1 || args[0].startsWith('-')) usage();

const planPath = path.resolve(args.shift());
const canaryPaths = [];
while (args.length) {
  const flag = args.shift();
  if (flag !== '--canary' || args.length === 0) usage();
  canaryPaths.push(path.resolve(args.shift()));
}

try {
  const planBytes = fs.readFileSync(planPath);
  const plan = JSON.parse(planBytes.toString('utf8'));
  assertValid(validators.cohortPlan, plan, 'cohort plan');
  assertCohortSemantics(plan);

  const canariesBySha = new Map();
  for (const canaryPath of canaryPaths) {
    const bytes = fs.readFileSync(canaryPath);
    const digest = sha256(bytes);
    if (canariesBySha.has(digest)) throw new Error(`duplicate canary evidence hash supplied: ${digest}`);
    const evidence = JSON.parse(bytes.toString('utf8'));
    assertValid(validators.isolationCanaryEvidence, evidence, `isolation canary ${canaryPath}`);
    canariesBySha.set(digest, { evidence, bytes, canaryPath });
  }

  const agentConditions = new Set([
    'agent_default',
    'no_web',
    'no_external_retrieval',
    'authoritative_docs_supplied',
    'updapi_mcp',
    'no_execution'
  ]);

  for (const cell of plan.cells) {
    if (!agentConditions.has(cell.condition)) continue;
    const digest = cell.isolation.canary_evidence_sha256;
    const found = canariesBySha.get(digest);
    if (!found) {
      throw new Error(`${cell.cell_id}: missing --canary evidence with preregistered SHA-256 ${digest}`);
    }
    assertCanaryQualifiesCell(cell, found.evidence, found.bytes);
  }

  const planSha = sha256(planBytes);
  console.log(`OK cohort ${plan.cohort_id} plan_sha256=${planSha} cells=${plan.cells.length} schedule_slots=${plan.ordering.generated_schedule.length} canaries=${canariesBySha.size}`);
} catch (error) {
  console.error(`INVALID cohort: ${error.message}`);
  process.exit(1);
}
