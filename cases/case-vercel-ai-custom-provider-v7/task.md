# Task

This workspace pins `ai@7.0.0` (see `fixture/package.json`).

`fixture/src/stub-model.mjs` exports `stubFastModel`, an inert stand-in language
model instance used by this project's tests. Nothing may call a network.

Implement `fixture/src/solution.mjs` so that it exports a `provider` object,
built with the `ai` package's provider-construction API, in which the language
model id `fast` resolves to the registered `stubFastModel` (the validator
checks the resolved model carries the stub's `modelId`, and that unknown ids
are rejected).

Acceptance: `node validator/validate.mjs` (run from the case directory) exits 0.
