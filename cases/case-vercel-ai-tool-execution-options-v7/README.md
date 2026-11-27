# case-vercel-ai-tool-execution-options-v7

**Event:** [`vercel.ai.2026-06-25.remove-toolcalloptions-type`](../../events/vercel/ai/vercel.ai.2026-06-25.remove-toolcalloptions-type.json) —
AI SDK 7 removed the deprecated `ToolCallOptions` type; typed code must use
`ToolExecutionOptions`.

**What the case measures.** The type surface of the same ai@7.0.0 release that
`case-vercel-ai-custom-provider-v7` measures on the runtime surface. A removed
exported *type* surfaces at compile time by nature, so this is deliberately
the one compile-gated case among the first three: the pinned TypeScript
compiler in strict mode is the deterministic oracle, and that is the honest
oracle for this failure mode rather than a convenience shortcut.

**Validator:** `node validator/validate.mjs` from this directory (resolves the
fixture-pinned compiler and runs `tsc --noEmit` strict).

**Controls:** `controls/stale` (imports `ToolCallOptions`) must fail to
compile; `controls/current` (imports `ToolExecutionOptions`) must compile
clean. Run `npm run bench:controls -- --case case-vercel-ai-tool-execution-options-v7`
from the repo root to prove both directions.
