# case-vercel-ai-custom-provider-v7

**Event:** [`vercel.ai.2026-06-25.remove-experimental-custom-provider`](../../events/vercel/ai/vercel.ai.2026-06-25.remove-experimental-custom-provider.json) —
AI SDK 7 removed the deprecated `experimental_customProvider` export; the
stable replacement is `customProvider`.

**What the case measures.** A developer objective ("expose this stub model as
a provider") whose implementation differs by exactly one piece of API
knowledge. Code written with pre-7.0 knowledge imports a named export that no
longer exists, and fails at module load; current code passes a behavioural
validator: the resolved model must preserve the stub's `modelId` (ai@7's
registry may hand back a compatibility wrapper, so object identity is
deliberately not asserted) and unknown ids must be rejected
(`AI_NoSuchModelError`).

**Validator:** `node validator/validate.mjs` from this directory. Runtime
behaviour, not compilation: the fixture pins `ai@7.0.0` and the validator
imports the solution and exercises the provider.

**Controls:** `controls/stale` (v6-style `experimental_customProvider`) must be
rejected; `controls/current` (`customProvider`) must be accepted. Run
`npm run bench:controls -- --case case-vercel-ai-custom-provider-v7` from the
repo root to prove both directions.
