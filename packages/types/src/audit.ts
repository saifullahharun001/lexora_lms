export interface AuditLogEntry {
  action: string;
  actorId: string;
  actorType: "user" | "service";
  departmentId?: string;
  targetType: string;
  targetId: string;
  outcome: "success" | "failure";
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

