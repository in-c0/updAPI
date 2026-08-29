# UpdAPI Cohort Protocol

This document defines the pre-result contract for repeated benchmark trials. The machine-readable authority is `schemas/cohort-plan.schema.json`.

## Why this exists

Repeated trials are only credible if the trial count, budgets, replacement policy, exclusions, ordering and aggregation are fixed before seeing model outcomes. A cohort plan therefore acts as a preregistration record for one bounded evaluation campaign.

## Freeze point

The cohort plan must be schema-valid and stored immutably before the first real agent attempt in that cohort. After that point:

- scored failures are never replaced;
- apparatus-invalid attempts remain visible and may be replaced only within the predeclared cap;
- material product/model/tool/isolation changes abort the cohort or create a new cohort;
- post-hoc exclusions or aggregation changes are forbidden.

## Standardized agent cells

Every real-agent cell must bind to:

- the exact benchmark commit;
- adapter source hash;
- case ID/version;
- declared condition;
- sterile agent context mode (`bare` or `sterile_config`);
- OS-enforced isolation profile hash;
- retained isolation-canary evidence hash and pass timestamp;
- fixed budgets;
- target scored attempt count and invalid-replacement cap.

A host-context development run cannot satisfy the standardized cell contract.

## Isolation qualification

The isolation evidence referenced by the cohort plan must come from the same standardized profile used for the cohort and must prove, with randomized nonces:

1. allowed workspace reads succeed;
2. benchmark-answer paths are inaccessible through built-in file tools;
3. benchmark-answer paths are inaccessible through shell/subprocess reads;
4. inherited host/user Claude context does not leak;
5. missing sandbox/isolation support fails closed.

The evidence hash binds the preregistered cohort to the exact proof that qualified the condition.

## Round-4 development cohort

The first real repeated cohort should remain intentionally small:

- one cell;
- `case-mcp-modern-era-negotiation-v2`;
- Claude Code adapter only;
- `agent_default` standardized condition;
- 5 scored attempts;
- at most 2 apparatus-invalid replacements;
- every invalid attempt retained;
- no scored failure replacement;
- pre-release/development label only.

The exact timeout, turn/token/cost budgets and ordering seed must be written into the cohort plan before attempt 1.

## Aggregation contract

The long-run reporting hierarchy is:

`attempt -> case -> API change event -> provider/ecosystem family -> overall`

This prevents a provider or release with many authored cases from dominating the headline score. The planned headline aggregation is a macro-average over provider/ecosystem families, with raw success rates and category slices also shown.

Apparatus-invalid attempts are excluded from capability scores but reported. A benchmark integrity violation by the evaluated agent, such as retrieving UpdAPI's answer/reference material, is not apparatus-invalid: it is a scored failure and is reported separately.

## No hidden retry semantics

Product-native retries inside one agent invocation are part of that attempt. Harness-level retries are separate attempts and must follow the cohort replacement policy. No benchmark runner, future scheduler, or XUXI supervisor may silently retry a scored failure under the same attempt identity.

## Portability

The cohort plan is independent of GitHub Actions and must be locally executable. Future XUXI supervision may schedule or launch the same cohort semantics, but may not alter the frozen plan after results begin.
