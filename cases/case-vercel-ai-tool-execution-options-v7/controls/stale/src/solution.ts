// KNOWN-STALE CONTROL - types the execute options the pre-change (ai v6) way.
// ai@7 removed the deprecated ToolCallOptions type, so strict compilation
// against the pinned ai@7.0.0 must fail at this import.
import type { ToolCallOptions } from 'ai';
import type { AuditLog } from './audit.js';

export function makeAuditedExecute<Input, Output>(
  execute: (input: Input, options: ToolCallOptions) => PromiseLike<Output> | Output,
  log: AuditLog
): (input: Input, options: ToolCallOptions) => Promise<Output> {
  return async (input, options) => {
    log.push({ toolCallId: options.toolCallId, at: Date.now() });
    return execute(input, options);
  };
}
