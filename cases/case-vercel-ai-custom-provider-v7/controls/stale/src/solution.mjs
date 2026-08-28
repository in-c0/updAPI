// KNOWN-STALE CONTROL - implements the task the pre-change (ai v6) way.
// ai@7 removed the deprecated experimental_customProvider export, so loading
// this module against the pinned ai@7.0.0 must fail.
import { experimental_customProvider } from 'ai';
import { stubFastModel } from './stub-model.mjs';

export const provider = experimental_customProvider({
  languageModels: { fast: stubFastModel }
});
