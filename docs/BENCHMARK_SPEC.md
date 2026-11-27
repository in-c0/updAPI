# UpdAPI Benchmark Specification

**Status:** design seed for UpdAPI's 2026 direction reset  
**Scope:** living API-evolution dataset + frontier coding-agent freshness benchmark  
**Normative intent:** this document defines the measurement contract. Implementations may evolve, but published benchmark versions must remain reproducible.

---

## 1. Research objective

UpdAPI measures how reliably and how quickly contemporary coding systems adapt to real API and SDK changes.

The primary research question is:

> **When an external software interface changes, can a frontier coding agent produce a verified working implementation using the tools it normally has available?**

Secondary questions include:

1. Which categories of API evolution remain difficult for frontier agents?
2. How much does web search improve freshness?
3. How much does authoritative current documentation improve freshness beyond normal agent tooling?
4. Does RAG/MCP still provide measurable benefit for public APIs?
5. How often does execution/retry recover from stale initial knowledge?
6. How does performance change as an API change ages?
7. How do cost, latency, and tool use trade off against verified correctness?
8. Are systems robust across repeated trials, or do they succeed only intermittently?

UpdAPI is explicitly allowed to discover that stale API knowledge has become a negligible problem. The benchmark is not designed to justify an UpdAPI retrieval product.

---

## 2. Unit of evidence: the change event

The fundamental dataset unit is a **verified API change event**, not an API-document URL and not an LLM prompt.

A change event represents a bounded transition between two externally meaningful interface states.

Examples:

- method renamed
- endpoint removed
- request parameter renamed
- positional arguments replaced by an options object
- return shape changed
- authentication method changed
- SDK namespace moved
- deprecated interface becomes invalid
- newly released feature creates a better/current implementation path
- documented behavior changes in a way that affects executable code

A URL move with no developer-visible interface consequence is historical metadata, not automatically a benchmark-worthy change event.

---

## 3. Evidence hierarchy

Every accepted event must have enough evidence to establish ground truth independently of a model's interpretation.

Preferred evidence, strongest first:

1. **Executable behavior** against version-pinned software or a safely testable public API.
2. **Versioned source/specification** such as an OpenAPI diff, SDK source diff, tagged release, or package type definitions.
3. **Official release notes/changelog/migration guide.**
4. **Official current documentation** with a trustworthy historical counterpart.
5. Maintainer statements or issue discussions, used only when the interface state cannot be established more directly.

Third-party tutorials, search snippets, generated summaries, and model claims are discovery aids only. They cannot by themselves define benchmark ground truth.

---

## 4. Change-event lifecycle

```text
discovered
   ↓
evidence_collected
   ↓
verified
   ↓
case_authored
   ↓
case_validated
   ↓
embargoed/live_holdout   (optional)
   ↓
published
   ↓
retired                  (only if no longer runnable/relevant)
```

Transitions must be auditable. Rejected candidates should retain a minimal rejection reason where useful so repeated rediscovery does not create needless work.

### 4.1 Discovery

A candidate may be discovered from changelogs, release feeds, package registries, repository diffs, specifications, documentation diffs, or manual observation.

Discovery is intentionally permissive.

### 4.2 Verification

Verification is intentionally strict. A candidate does not become benchmark ground truth merely because an official changelog sentence appears to describe a change.

Where practical, the verifier should demonstrate both sides:

- old usage succeeds under the old target state
- old usage fails or is obsolete under the new state
- new usage succeeds under the new state

### 4.3 Case validation

A benchmark case must be tested independently of any frontier agent. The harness itself must prove that its validator can distinguish the intended correct and stale behaviors.

A useful negative control is required for deterministic executable cases: deliberately provide the known-stale implementation and prove that validation rejects it.

---

## 5. Versioned data contracts

Schemas should live under `schemas/` and carry explicit schema versions once implementation begins.

The following fields describe the minimum semantic contract.

### 5.1 `change_event`

```json
{
  "schema_version": "0.1",
  "id": "provider.package.2026-08-01.signature-change",
  "provider": "provider",
  "ecosystem": "npm",
  "package": "package",
  "interface": "Client.create",
  "version_before": "3.8.0",
  "version_after": "4.0.0",
  "published_at": "2026-08-01T00:00:00Z",
  "first_observed_at": "2026-08-01T03:14:00Z",
  "change": {
    "type": "signature_change",
    "summary": "create() moved from positional arguments to an options object",
    "old": "client.create(name, options)",
    "new": "client.create({ name, ...options })"
  },
  "sources": [
    {
      "kind": "official_changelog",
      "url": "https://example.com/changelog",
      "retrieved_at": "2026-08-01T03:14:00Z"
    }
  ],
  "verification": {
    "kind": "executable_fixture",
    "fixture": "cases/provider-package-signature-change"
  }
}
```

### Required semantic properties

- IDs are stable once published.
- `published_at` refers to the best-supported public availability time of the changed interface, not the time UpdAPI noticed it.
- `first_observed_at` records UpdAPI observation and must never be backdated.
- old/new representations are explanatory, not substitutes for evidence.
- source records preserve retrieval time.
- material corrections create a revision record rather than silently rewriting published history.

### 5.2 `benchmark_case`

A benchmark case binds a verified event to a concrete developer task.

Minimum fields:

```json
{
  "schema_version": "0.1",
  "case_id": "case-provider-package-create-v4",
  "event_id": "provider.package.2026-08-01.signature-change",
  "case_version": 1,
  "task": "Implement ...",
  "workspace_fixture": "fixtures/...",
  "target_environment": {
    "runtime": "node",
    "runtime_version": "22.x",
    "dependencies": {
      "package": "4.0.0"
    }
  },
  "validator": {
    "kind": "command",
    "command": "npm test"
  },
  "controls": {
    "known_stale_fixture": "controls/stale/...",
    "known_current_fixture": "controls/current/..."
  }
}
```

The task should not gratuitously reveal the changed syntax. It should reproduce a plausible developer objective for which stale API knowledge can affect implementation.

### 5.3 `run_manifest`

Every result must be attributable to the exact system and environment that produced it.

Minimum fields:

- benchmark version
- case ID/version
- run ID
- timestamp
- agent/product name and version
- underlying model name/version when exposed
- reasoning/effort setting when exposed
- tool availability
- web access policy
- repository/filesystem access policy
- execution access
- retrieval/MCP configuration
- starting workspace hash
- dependency lock/hash
- environment/runtime/container identity
- timeout/turn/token budgets
- number of retries allowed by the product/harness
- geographic/provider endpoint when relevant
- measured wall-clock duration
- token/tool usage and estimated cost when available

Unknown product internals must be recorded as unknown rather than inferred.

### 5.4 `run_result`

Minimum fields:

```json
{
  "run_id": "...",
  "case_id": "...",
  "verified_success": true,
  "validator_exit_code": 0,
  "initial_stale_use": false,
  "recovered": false,
  "tool_trace_summary": {
    "web_search": 2,
    "docs_fetch": 1,
    "shell": 5
  },
  "duration_ms": 93241,
  "artifacts": ["final.patch", "validator.log"]
}
```

Full trajectories may contain sensitive provider/tool information and should be stored/released according to licensing and product terms. The public scoring record must remain sufficient to reproduce the outcome where possible.

---

## 6. Change taxonomy

Initial taxonomy:

### Surface changes

- `endpoint_rename`
- `method_rename`
- `namespace_move`
- `signature_change`
- `parameter_add`
- `parameter_remove`
- `parameter_rename`
- `parameter_type_change`
- `return_shape_change`
- `authentication_change`
- `configuration_change`

### Lifecycle changes

- `new_api`
- `deprecation`
- `removal`
- `default_change`
- `version_migration`
- `runtime_requirement_change` — a supported-runtime/platform floor change
  (e.g. an SDK major dropping a Node.js version) that is not itself an
  interface rename. Added in v0 implementation for the openai-node 7.0 Node-22
  floor event; measures ecosystem freshness rather than API-call freshness, so
  events of this type are taxonomy-diversity events rather than headline cases.

### Behavioral changes

- `semantic_behavior_change`
- `error_behavior_change`
- `rate_limit_change`
- `capability_change`

Taxonomy labels may be multi-valued when a migration spans several mechanisms, but one primary label should identify the dominant failure mode being evaluated.

---

## 7. Evaluation conditions

### 7.1 Primary condition: product-realistic agent

The headline leaderboard should evaluate each coding agent substantially as developers normally use it.

If the product normally has:

- web search
- shell access
- repository inspection
- package installation
- documentation tools
- automatic retries

those capabilities belong in the primary condition and must be recorded.

We are testing the usefulness of the deployed system, not artificially reproducing a 2024-era chat completion.

### 7.2 Controlled ablations

Ablations answer narrower causal questions and should not replace the primary condition.

Canonical labels:

- `agent_default`
- `no_web`
- `no_external_retrieval`
- `authoritative_docs_supplied`
- `updapi_mcp`
- `no_execution`

Not every agent/product will support every ablation without distortion. Unsupported conditions are omitted rather than simulated inaccurately.

---

## 8. Scoring

### 8.1 Primary metric: Verified Task Success

Binary per attempt:

```text
1 = deterministic validator accepts the final state
0 = validator rejects it, run errors, or budget expires
```

The validator—not an LLM judge—should determine correctness whenever executable verification is possible.

For cases that cannot be executed safely or deterministically, scoring must use an explicit case-specific rubric with human validation before public use.

### 8.2 Reliability

For stochastic agents, report the distribution across repeated attempts rather than only best-of-N.

For public v1, target **five attempts per case/system/condition** where economics permit. During development, three attempts may be used to diagnose harness behavior but should be labeled pre-release.

Recommended reported values:

- pass rate
- pass^5: probability/observed fraction represented by success on all five attempts at the aggregate task level where appropriate
- 95% confidence intervals for aggregate comparisons

Never use hidden retries to transform a failed attempt into a nominal first-attempt success. Agent-native retries inside one product run are part of the trajectory; harness-level reruns are separate attempts.

### 8.3 Stale API Error Rate

A run counts as a stale-API error only when evidence in the produced implementation/trajectory shows use of the pre-change or otherwise obsolete interface relevant to the case.

General coding mistakes are not stale-API errors.

This metric requires a case-specific classifier or deterministic marker and must not be guessed from failure alone.

### 8.4 Recovery Rate

Among runs that demonstrably enter a stale state, measure the fraction that subsequently produce a verified current implementation before the run ends.

This captures the value of execution, search, diagnostics, and repair loops.

### 8.5 Retrieval Lift

For compatible controlled conditions:

```text
retrieval_lift = success_rate(with_retrieval) - success_rate(control)
```

Always show absolute rates alongside the delta.

### 8.6 API Knowledge Lag (system adoption lag)

Knowledge lag is a longitudinal system/event statistic, not a one-shot score.
Because the unit under test is the deployed system (agent + model + tools),
not isolated model weights, the concept is equally correctly called **system
adoption lag**; a change in the metric can come from a model update, a tool
change, or a product change, and the run manifest must carry enough
provenance to attribute which.

Provisional definition:

> elapsed time between `published_at` and the earliest evaluation window in which the system reaches the benchmark's reliability threshold on that event, subject to confirmation by a subsequent evaluation window.

The reliability threshold and confirmation rule must be fixed per benchmark version before public reporting. Until the sampling cadence is dense enough, report observations as intervals (for example, `2–5 days`) rather than fabricated point precision.

### 8.7 Cost and latency

Where observable, record:

- wall-clock time
- model tokens
- search/tool calls
- provider-reported cost
- benchmark-run infrastructure cost

Costs should be normalized carefully and never mixed with unknown estimates as if they were equivalent.

---

## 9. Temporal integrity and contamination

API freshness benchmarks are unusually vulnerable to aging into the training distribution.

UpdAPI uses several defenses.

### 9.1 Recent-event cohorts

Continuously introduce newly verified change events. Report results by event age, for example:

- 0–7 days
- 8–30 days
- 31–90 days
- 91–365 days
- historical

Exact buckets may change before v1 but must be versioned afterward.

### 9.2 Embargoed live holdouts

For high-value cases, metadata may be retained privately for a bounded live-evaluation period before full case fixtures are published.

After the holdout window, release enough information for independent reproduction unless licensing/security constraints prohibit it.

### 9.3 No secret benchmark-specific hints

The benchmark harness must not give one system private knowledge of the target change unless that condition explicitly evaluates supplied documentation/retrieval.

### 9.4 Immutable published cohorts

Once a cohort is published, its membership and ground truth are frozen. Corrections are versioned and disclosed.

---

## 10. Reproducibility

A benchmark result is publishable only when UpdAPI can answer:

1. What exact case was run?
2. What interface/version constituted ground truth?
3. What evidence established that ground truth?
4. What exact agent/model/product version ran?
5. What tools could it use?
6. What environment did it start from?
7. What validator decided success?
8. What artifacts prove the claimed result?
9. Can the case be rerun later within reasonable external-service constraints?

Published tables without this provenance are marketing charts, not benchmark results.

---

## 11. Benchmark artifact layout

Proposed repository shape:

```text
schemas/
  change-event.schema.json
  benchmark-case.schema.json
  run-manifest.schema.json
  run-result.schema.json

events/
  <provider>/<package>/<event-id>.json

cases/
  <case-id>/
    case.json
    README.md
    fixture/
    controls/
      stale/
      current/
    validator/

runs/
  <benchmark-version>/<system>/<run-id>/
    manifest.json
    result.json
    artifacts/

docs/
  BENCHMARK_SPEC.md
  METHODOLOGY.md
  RELATED_WORK.md
```

Large generated artifacts should not automatically be committed to Git. Storage strategy should preserve hashes and provenance without turning the repository into an unbounded binary archive.

---

## 12. MVP acceptance gate

The first credible benchmark release should not be declared complete until all of the following are true.

### Dataset

- at least **30 verified change events**
- at least **5 distinct ecosystems/provider families**
- at least **20 executable benchmark cases**
- each executable case has stale and current controls
- validators reject their stale negative control and accept their current positive control
- all published events have authoritative provenance

### Runners

- at least **3 materially distinct frontier coding systems**
- runner adapters produce the same normalized manifest/result contract
- tool capabilities are recorded, not assumed
- local rerun command exists
- no dependency on GitHub Actions

### Evaluation

- development runs demonstrate repeatability
- public v1 policy fixes trial count before results are revealed
- primary leaderboard uses verified task success
- failures are categorized without conflating general coding errors with stale API errors
- at least one controlled retrieval experiment is included

### Publication

- methodology is public
- benchmark version is immutable
- per-system configuration is public to the extent allowed by provider products
- downloadable machine-readable results exist
- per-case evidence is inspectable after any holdout period
- methodology/version history is maintained

---

## 13. Initial implementation sequence

Implementation should proceed in this order unless evidence justifies a change:

1. Add JSON Schemas for event/case/run/result.
2. Author 3–5 gold change events manually.
3. Build validators and stale/current controls for those cases.
4. Build a local benchmark runner that runs a **human-authored fixed implementation** first; prove scoring works without any LLM.
5. Add one coding-agent adapter.
6. Add normalized artifact capture.
7. Add two more agent adapters.
8. Add repeated-trial orchestration.
9. Add change discovery/ingestion automation only after the ground-truth workflow is trustworthy.
10. Build public visualization only after real benchmark results exist.

The sequence deliberately puts **ground truth before automation and visualization**.

---

## 14. Execution and scheduler policy

GitHub Actions is not part of the UpdAPI operating architecture.

All collection, validation, and benchmark jobs must have explicit local/portable entry points. They may run under a workstation process, container, server, or later a persistent supervisory system such as XUXI, but the scheduler must be separable from benchmark semantics.

A future autonomous operator may:

- notice new releases
- propose candidate events
- gather evidence
- run deterministic verification
- schedule benchmark cohorts
- retry infrastructure failures
- publish validated results

It must not silently promote uncertain discovery into benchmark ground truth or rewrite published history.

---

## 15. Public-product direction

The public interface should behave more like an independent measurement site than a documentation service.

Likely top-level views:

- **Leaderboard** — agent freshness, reliability, recovery, cost, latency
- **Live changes** — newest verified API-evolution cohort
- **Agents** — per-system drill-down and tool configuration
- **APIs / ecosystems** — failure rates and change types by ecosystem
- **Change explorer** — before/after evidence and benchmark case
- **Trends** — knowledge-lag and stale-error trajectories over time
- **Methodology** — benchmark versions, scoring, caveats, corrections
- **Data** — downloadable machine-readable events and results

Visual polish matters, but no public dashboard should precede credible measured data.

---

## 16. Independence principle

UpdAPI should not optimize the benchmark to demonstrate that UpdAPI retrieval improves agent performance.

If `updapi_mcp` produces no statistically meaningful lift over normal agent web search, publish that result.

If frontier agents converge on near-perfect freshness, publish that result.

If one vendor consistently adapts faster than another, publish the evidence and methodology regardless of provider.

The benchmark's durable asset is **trust**.
