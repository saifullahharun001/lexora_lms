import { SetMetadata } from "@nestjs/common";

export interface AuditActionMetadata {
  action: string;
  targetType: string;
  sensitive?: boolean;
}

export const AUDIT_ACTION_KEY = "audit_action";

export function AuditAction(metadata: AuditActionMetadata) {
  return SetMetadata(AUDIT_ACTION_KEY, metadata);
}

