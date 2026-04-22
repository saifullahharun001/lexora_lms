export interface AuditLogEntry {
  action: string;
  actorId: string;
  actorType: "user" | "service";
  departmentId?: string | null;
  targetType: string;
  targetId?: string | null;
  outcome: "success" | "failure";
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}
