// KNOWN-CURRENT CONTROL - types the execute options the post-change (ai v7) way.
// Note the type did not merely get renamed: at ai@7.0.0 ToolExecutionOptions is
// generic over an execution CONTEXT with no default type argument (observed via
// the pinned tsc: "TS2314 ... requires 1 type argument(s)").
import type { ToolExecutionOptions } from 'ai';
import type { AuditLog } from './audit.js';

export function makeAuditedExecute<Input, Output, Context = unknown>(
  execute: (input: Input, options: ToolExecutionOptions<Context>) => PromiseLike<Output> | Output,
  log: AuditLog
): (input: Input, options: ToolExecutionOptions<Context>) => Promise<Output> {
  return async (input, options) => {
    log.push({ toolCallId: options.toolCallId, at: Date.now() });
    return execute(input, options);
  };
}
