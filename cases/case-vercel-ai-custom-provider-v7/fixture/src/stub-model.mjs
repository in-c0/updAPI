// An inert stand-in for a language model instance. The provider registry
// validates the declared specification version before returning a model
// (observed against ai@7.0.0: resolving a model without one fails with
// "Unsupported model version undefined ... only supports models that
// implement specification version \"v2\""), so the stub declares exactly
// what the registry demands and nothing else. The registry may hand back a
// compatibility wrapper rather than this exact object; the validator checks
// modelId preservation. No method here is ever invoked.
export const stubFastModel = Object.freeze({
  specificationVersion: 'v2',
  provider: 'acme-internal',
  modelId: 'acme-fast-internal',
  marker: 'updapi-stub-language-model'
});
