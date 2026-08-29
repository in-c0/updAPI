const assert = require('node:assert');
const { createHash } = require('node:crypto');

describe('bench cohort preregistration contract', function () {
  let validators;
  let assertValid;
  let assertCohortSemantics;
  let assertCanaryQualifiesCell;
  let sha256Canonical;

  before(async function () {
    ({ validators, assertValid } = await import('../tools/bench/lib/schemas.mjs'));
    ({ assertCohortSemantics, assertCanaryQualifiesCell, sha256Canonical } = await import('../tools/bench/lib/cohort.mjs'));
  });

  const h64 = (char) => char.repeat(64);
  const h40 = (char) => char.repeat(40);

  function makeCell() {
    return {
      cell_id: 'mcp-claude-default',
      case_id: 'case-mcp-modern-era-negotiation-v2',
      case_version: 1,
      condition: 'agent_default',
      adapter: {
        name: 'claude-code',
        source_sha256: h64('a'),
        expected_product: 'claude-code',
        expected_product_version: '1.2.3',
        model_configuration: 'claude-opus-5'
      },
      agent_context_mode: 'sterile_config',
      execution_policy: {
        invocation_template_sha256: h64('b'),
        context_profile_sha256: h64('c'),
        web_search: 'allowed',
        repository_access: 'allowed',
        execution: 'allowed',
        package_install: 'allowed',
        retrieval_mcp: 'denied',
        external_network: 'allowed',
        configured_mcp_sha256: 'none'
      },
      isolation: {
        mode: 'wsl2_claude_sandbox',
        profile_sha256: h64('d'),
        canary_evidence_sha256: h64('e'),
        canary_passed_at: '2026-08-29T08:00:00Z'
      },
      target_scored_attempts: 5,
      max_invalid_replacements: 2
    };
  }

  function makePlan(cell = makeCell()) {
    return {
      schema_version: '0.2.0',
      cohort_id: 'round4-mcp-claude',
      plan_version: 1,
      created_at: '2026-08-29T08:05:00Z',
      benchmark: {
        commit: h40('f'),
        clean_tree_required: true,
        benchmark_version: 'v0-dev'
      },
      cells: [cell],
      budgets: {
        timeout_ms: 300000,
        max_turns: 30,
        max_tokens: null,
        max_cost_usd: 5
      },
      ordering: {
        strategy: 'sequential',
        algorithm: 'explicit_v1',
        seed: 'round4-fixed-seed',
        generated_schedule: [
          { ordinal: 1, cell_id: cell.cell_id, slot_kind: 'primary', slot_index: 1 },
          { ordinal: 2, cell_id: cell.cell_id, slot_kind: 'primary', slot_index: 2 },
          { ordinal: 3, cell_id: cell.cell_id, slot_kind: 'primary', slot_index: 3 },
          { ordinal: 4, cell_id: cell.cell_id, slot_kind: 'primary', slot_index: 4 },
          { ordinal: 5, cell_id: cell.cell_id, slot_kind: 'primary', slot_index: 5 },
          { ordinal: 6, cell_id: cell.cell_id, slot_kind: 'invalid_replacement', slot_index: 1 },
          { ordinal: 7, cell_id: cell.cell_id, slot_kind: 'invalid_replacement', slot_index: 2 }
        ]
      },
      replacement_policy: {
        replace_apparatus_invalid: true,
        replace_scored_failure: false,
        retain_invalid_attempts: true,
        on_replacement_cap_exceeded: 'mark_cell_incomplete'
      },
      aggregation: {
        attempt_to_case: 'mean_verified_success_over_scored_attempts',
        case_to_event: 'mean_case_score',
        event_to_family: 'mean_event_score',
        family_to_overall: 'macro_mean_family_score',
        invalid_handling: 'exclude_from_capability_score_but_report',
        integrity_violation_handling: 'scored_failure_and_report'
      },
      planned_exclusions: ['apparatus_invalid'],
      freeze_policy: {
        immutable_before_first_agent_attempt: true,
        material_config_change_action: 'abort_or_new_cohort',
        posthoc_plan_edits: 'forbidden'
      }
    };
  }

  function makeCanary(cell) {
    return {
      schema_version: '0.1.0',
      canary_id: 'round4-isolation-canary',
      created_at: '2026-08-29T07:55:00Z',
      adapter: {
        name: cell.adapter.name,
        source_sha256: cell.adapter.source_sha256,
        product: cell.adapter.expected_product,
        product_version: cell.adapter.expected_product_version,
        model_configuration: cell.adapter.model_configuration
      },
      agent_context_mode: cell.agent_context_mode,
      context_profile_sha256: cell.execution_policy.context_profile_sha256,
      execution_policy_sha256: sha256Canonical(cell.execution_policy),
      isolation: {
        mode: cell.isolation.mode,
        profile_sha256: cell.isolation.profile_sha256,
        fail_closed: true
      },
      passes: [1, 2].map((n) => ({
        pass_id: `nonce-pass-${n}`,
        executed_at: `2026-08-29T07:5${n}:00Z`,
        allowed_nonce_sha256: n === 1 ? h64('1') : h64('4'),
        forbidden_nonce_sha256: n === 1 ? h64('2') : h64('5'),
        context_nonce_sha256: n === 1 ? h64('3') : h64('6'),
        checks: {
          allowed_builtin_read: true,
          allowed_shell_read: true,
          forbidden_builtin_read_denied: true,
          forbidden_shell_read_denied: true,
          context_nonce_absent: true,
          isolation_unavailable_fails_closed: true
        },
        artifact_index_sha256: n === 1 ? h64('7') : h64('8')
      })),
      qualification: {
        status: 'passed',
        qualified_at: cell.isolation.canary_passed_at
      }
    };
  }

  it('accepts a fully frozen N=5 + 2 replacement development plan', function () {
    const plan = makePlan();
    assertValid(validators.cohortPlan, plan, 'cohort plan');
    assert.strictEqual(assertCohortSemantics(plan), true);
  });

  it('rejects an omitted budget dimension instead of treating it as implicit', function () {
    const plan = makePlan();
    delete plan.budgets.max_cost_usd;
    assert.throws(() => assertValid(validators.cohortPlan, plan, 'cohort plan'), /max_cost_usd|required property/);
  });

  it('rejects a schedule whose primary count does not match the preregistered target', function () {
    const plan = makePlan();
    plan.ordering.generated_schedule = plan.ordering.generated_schedule.filter((slot) => !(slot.slot_kind === 'primary' && slot.slot_index === 5));
    plan.ordering.generated_schedule.forEach((slot, index) => { slot.ordinal = index + 1; });
    assertValid(validators.cohortPlan, plan, 'cohort plan');
    assert.throws(() => assertCohortSemantics(plan), /primary schedule slots 4 != target_scored_attempts 5/);
  });

  it('requires a standardized agent cell rather than host-context execution', function () {
    const plan = makePlan();
    plan.cells[0].agent_context_mode = 'host_context';
    assert.throws(() => assertValid(validators.cohortPlan, plan, 'cohort plan'), /agent_context_mode|allowed values/);
  });

  it('accepts two-pass machine-readable isolation evidence and binds it to the exact cell', function () {
    const cell = makeCell();
    const evidence = makeCanary(cell);
    const evidenceBytes = Buffer.from(JSON.stringify(evidence));
    cell.isolation.canary_evidence_sha256 = createHash('sha256').update(evidenceBytes).digest('hex');

    assertValid(validators.isolationCanaryEvidence, evidence, 'isolation canary evidence');
    assert.strictEqual(assertCanaryQualifiesCell(cell, evidence, evidenceBytes), true);
  });

  it('rejects canary evidence from a different execution policy even when both records are schema-valid', function () {
    const cell = makeCell();
    const evidence = makeCanary(cell);
    evidence.execution_policy_sha256 = h64('9');
    assertValid(validators.isolationCanaryEvidence, evidence, 'isolation canary evidence');
    assert.throws(() => assertCanaryQualifiesCell(cell, evidence), /execution_policy_sha256 mismatch/);
  });

  it('rejects canary evidence from a different CLI version', function () {
    const cell = makeCell();
    const evidence = makeCanary(cell);
    evidence.adapter.product_version = '1.2.4';
    assertValid(validators.isolationCanaryEvidence, evidence, 'isolation canary evidence');
    assert.throws(() => assertCanaryQualifiesCell(cell, evidence), /adapter.product_version mismatch/);
  });
});
