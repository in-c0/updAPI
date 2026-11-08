# UpdAPI Cohort Protocol

This document defines the pre-result contract for repeated benchmark trials. The machine-readable plan authority is `schemas/cohort-plan.schema.json`; standardized isolation qualification is recorded with `schemas/isolation-canary-evidence.schema.json`.

## Why this exists

Repeated trials are only credible if the trial count, exact execution condition, budgets, replacement policy, exclusions, ordering and aggregation are fixed before seeing model outcomes. A cohort plan therefore acts as a preregistration record for one bounded evaluation campaign.

## Freeze point

The cohort plan must be schema-valid, semantically cross-validated, byte-preserved and hash-addressed before the first real agent attempt in that cohort. After that point:

- scored failures are never replaced;
- apparatus-invalid attempts remain visible and may be replaced only within the predeclared cap;
- material product/model/tool/network/context/isolation changes abort the cohort or create a new cohort;
- post-hoc exclusions, schedule edits or aggregation changes are forbidden.

The orchestrator must copy the exact frozen plan bytes and SHA-256 into cohort evidence. A later file with the same logical fields but different bytes is not the frozen plan.

## Standardized agent cells

Every real-agent cell must bind to:

- the exact benchmark commit and clean-tree requirement;
- adapter source hash;
- exact expected product/CLI version and requested model configuration;
- case ID/version and declared condition;
- sterile agent context mode (`bare` or `sterile_config`);
- normalized invocation-template hash;
- normalized context/settings-profile hash;
- explicit web, repository, execution, package-install, retrieval-MCP and external-network capabilities;
- normalized configured-MCP hash (or `none`);
- OS-enforced isolation profile hash;
- retained isolation-canary evidence hash and pass timestamp;
- explicit timeout, turn, token and cost budgets (`null` means deliberately unsupported/unbounded; omission is forbidden);
- target scored-attempt count and invalid-replacement cap.

A host-context development run cannot satisfy the standardized cell contract.

## Isolation qualification

The machine-readable canary record must contain exactly two fresh-nonce passes. Each pass must prove:

1. built-in file tools can read an allowed workspace nonce;
2. shell/subprocess tools can read an allowed workspace nonce;
3. built-in file tools cannot reveal a forbidden answer-bearing nonce;
4. shell/subprocess tools cannot reveal that forbidden nonce;
5. a context nonce placed in throwaway host configuration is absent from the standardized launch;
6. deliberate isolation-unavailable startup fails closed rather than silently running unsandboxed.

The plaintext nonces need not be retained after qualification; their SHA-256 values and raw tool-evidence artifact hashes are retained.

### Required cross-file equality

JSON Schema validates document shape, but the orchestrator must additionally reject a cohort plan unless its referenced canary evidence matches the cell exactly on:

- adapter name and source SHA-256;
- expected product/CLI version;
- model configuration;
- `agent_context_mode`;
- `execution_policy.context_profile_sha256`;
- the SHA-256 of the normalized execution policy;
- isolation mode and isolation profile SHA-256;
- qualification status `passed` with two valid fresh-nonce passes.

A canary produced under a different adapter, CLI version, model configuration, context profile, tool/network policy or sandbox profile cannot qualify the cohort merely because its evidence file has a valid hash.

## Execution-policy normalization

Secrets must never enter the plan or hashes. The implementation should create a deterministic non-secret execution-policy record and hash canonical bytes. It must cover at least:

- exact CLI/invocation template, replacing per-run workspace paths/IDs with documented placeholders;
- requested model/configuration flags;
- permission/tool flags;
- web/network policy;
- MCP server identities/configuration with secret values removed;
- normalized context/settings profile.

The run manifest remains observed provenance. The orchestrator must compare each observed run against the frozen cell and classify a material mismatch as apparatus-invalid / cohort-aborting according to the committed policy rather than silently mixing configurations.

## Attempt ordering

A seed alone is insufficient preregistration because scheduler implementations can change. The cohort plan therefore stores:

- a versioned schedule algorithm;
- its seed;
- the exact generated ordered candidate schedule.

The generated schedule is the execution authority. Primary slots are always eligible. Invalid-replacement slots execute only when a prior apparatus-invalid attempt in that cell requires replacement; otherwise they are retained as unused/skipped slots. The orchestrator must validate that primary/replacement counts agree with each cell's target and replacement cap.

For multi-cell cohorts, prefer randomized/interleaved primary slots to reduce temporal product-update confounding. For the initial one-cell MCP development cohort, explicit sequential order is acceptable because interleaving has no effect.

## Round-4 development cohort

The first real repeated cohort remains intentionally small:

- one cell;
- `case-mcp-modern-era-negotiation-v2`;
- Claude Code adapter only;
- `agent_default` standardized condition;
- exactly 5 scored attempts targeted;
- at most 2 apparatus-invalid replacements;
- every invalid attempt retained;
- no scored failure replacement;
- pre-release/development label only.

Before attempt 1, the exact timeout/turn/token/cost budget vector, execution policy, model configuration, isolation qualification and all 5 primary + 2 conditional replacement schedule slots must already exist in the frozen plan.

## Aggregation contract

The long-run reporting hierarchy is:

`attempt -> case -> API change event -> provider/ecosystem family -> overall`

This prevents a provider or release with many authored cases from dominating the headline score. The planned headline aggregation is a macro-average over provider/ecosystem families, with raw success rates and category slices also shown.

Apparatus-invalid attempts are excluded from capability scores but reported. A benchmark integrity violation by the evaluated agent, such as retrieving UpdAPI's answer/reference material, is not apparatus-invalid: it is a scored failure and is reported separately.

## No hidden retry semantics

Product-native retries inside one agent invocation are part of that attempt. Harness-level retries are separate attempts and must follow the frozen candidate schedule and replacement policy. No benchmark runner, future scheduler or XUXI supervisor may silently retry a scored failure under the same or a new attempt identity.

## Required semantic validation before launch

Schema validity alone does not authorize a cohort. The orchestrator must refuse real-agent launch unless all of the following hold:

- benchmark worktree is clean and at the exact frozen commit;
- case/version exists at that commit;
- adapter source hash matches;
- product version/model preflight matches the frozen cell where observable before invocation;
- execution-policy hashes/configuration match;
- canary evidence is schema-valid and cross-file-compatible as defined above;
- generated schedule counts match target attempts and replacement caps;
- the exact frozen plan bytes/hash are stored before attempt 1.

Failure of any preflight condition is apparatus failure, not a model score.

The repository exposes the host-independent portion of this gate as:

```sh
npm run bench:cohort:validate -- path/to/plan.json \
  --canary path/to/isolation-canary.json
```

The command schema-validates the plan/evidence, checks schedule counts, binds each agent cell to canary evidence by exact SHA-256, verifies adapter/product/model/context/execution/isolation equality, and prints the SHA-256 of the exact plan bytes. The repeated-trial orchestrator should call the same library/gate rather than reimplement weaker checks.

## Portability

The cohort plan is independent of GitHub Actions and must be locally executable. Future XUXI supervision may schedule or launch the same cohort semantics, but may not alter the frozen plan after results begin.
