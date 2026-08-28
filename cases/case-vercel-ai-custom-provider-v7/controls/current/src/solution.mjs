// KNOWN-CURRENT CONTROL - implements the task the post-change (ai v7) way.
import { customProvider } from 'ai';
import { stubFastModel } from './stub-model.mjs';

export const provider = customProvider({
  languageModels: { fast: stubFastModel }
});
