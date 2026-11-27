# Task

This workspace pins `ai@7.0.0` and TypeScript (see `fixture/package.json`).

`fixture/src/audit.ts` defines the audit log type used by this project.

Implement `fixture/src/solution.ts`:

```ts
export function makeAuditedExecute(execute, log) { ... }
```

Given any tool execute function of the form `(input, options) => output` and
an `AuditLog`, it must return a wrapped function with the same signature that
pushes `{ toolCallId: options.toolCallId, at: Date.now() }` to the log before
delegating. Type the `options` parameter with the type the `ai` package
exports for the second argument of a tool's `execute` function; keep the
wrapper fully generic over input and output types.

Acceptance: `node validator/validate.mjs` (run from the case directory)
exits 0. The validator runs the pinned TypeScript compiler in strict mode.
