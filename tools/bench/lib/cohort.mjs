import { createHash } from 'node:crypto';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function sha256Canonical(value) {
  return sha256(canonicalJson(value));
}

export function assertCohortSemantics(plan) {
  const cells = new Map();
  for (const cell of plan.cells) {
    if (cells.has(cell.cell_id)) throw new Error(`duplicate cell_id: ${cell.cell_id}`);
    cells.set(cell.cell_id, cell);
  }

  const seenOrdinals = new Set();
  const counts = new Map([...cells.keys()].map((id) => [id, { primary: 0, invalid_replacement: 0 }]));

  plan.ordering.generated_schedule.forEach((slot, index) => {
    const expectedOrdinal = index + 1;
    if (slot.ordinal !== expectedOrdinal) {
      throw new Error(`schedule ordinal ${slot.ordinal} must equal contiguous position ${expectedOrdinal}`);
    }
    if (seenOrdinals.has(slot.ordinal)) throw new Error(`duplicate schedule ordinal: ${slot.ordinal}`);
    seenOrdinals.add(slot.ordinal);
    if (!cells.has(slot.cell_id)) throw new Error(`schedule references unknown cell_id: ${slot.cell_id}`);
    counts.get(slot.cell_id)[slot.slot_kind] += 1;
  });

  for (const [id, cell] of cells) {
    const count = counts.get(id);
    if (count.primary !== cell.target_scored_attempts) {
      throw new Error(`${id}: primary schedule slots ${count.primary} != target_scored_attempts ${cell.target_scored_attempts}`);
    }
    if (count.invalid_replacement !== cell.max_invalid_replacements) {
      throw new Error(`${id}: replacement schedule slots ${count.invalid_replacement} != max_invalid_replacements ${cell.max_invalid_replacements}`);
    }
  }

  if (plan.ordering.strategy === 'sequential' && plan.ordering.algorithm !== 'explicit_v1') {
    throw new Error('sequential ordering must use explicit_v1');
  }
  if (plan.ordering.strategy !== 'sequential' && plan.ordering.algorithm !== 'sha256_fisher_yates_v1') {
    throw new Error('randomized ordering must use sha256_fisher_yates_v1');
  }

  return true;
}

export function assertCanaryQualifiesCell(cell, evidence, evidenceBytes = null) {
  const mismatch = (label, expected, actual) => {
    if (expected !== actual) throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
  };

  mismatch('adapter.name', cell.adapter.name, evidence.adapter.name);
  mismatch('adapter.source_sha256', cell.adapter.source_sha256, evidence.adapter.source_sha256);
  mismatch('adapter.product', cell.adapter.expected_product, evidence.adapter.product);
  mismatch('adapter.product_version', cell.adapter.expected_product_version, evidence.adapter.product_version);
  mismatch('adapter.model_configuration', cell.adapter.model_configuration, evidence.adapter.model_configuration);
  mismatch('agent_context_mode', cell.agent_context_mode, evidence.agent_context_mode);
  mismatch(
    'context_profile_sha256',
    cell.execution_policy.context_profile_sha256,
    evidence.context_profile_sha256
  );
  mismatch(
    'execution_policy_sha256',
    sha256Canonical(cell.execution_policy),
    evidence.execution_policy_sha256
  );
  mismatch('isolation.mode', cell.isolation.mode, evidence.isolation.mode);
  mismatch('isolation.profile_sha256', cell.isolation.profile_sha256, evidence.isolation.profile_sha256);
  mismatch('canary_passed_at', cell.isolation.canary_passed_at, evidence.qualification.qualified_at);

  if (evidence.qualification.status !== 'passed') throw new Error('canary qualification is not passed');
  if (evidence.passes.length !== 2) throw new Error('canary qualification must contain exactly two passes');

  if (evidenceBytes !== null) {
    const observedEvidenceSha = sha256(evidenceBytes);
    mismatch('canary_evidence_sha256', cell.isolation.canary_evidence_sha256, observedEvidenceSha);
  }

  return true;
}
