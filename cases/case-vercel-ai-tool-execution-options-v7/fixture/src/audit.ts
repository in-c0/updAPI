// Audit log shape used by this project's tooling instrumentation.
export interface AuditEntry {
  toolCallId: string;
  at: number;
}

export type AuditLog = AuditEntry[];
