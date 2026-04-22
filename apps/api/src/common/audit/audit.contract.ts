import type { AuditLogEntry } from "@lexora/types";

export interface AuditWriter {
  write(entry: AuditLogEntry): Promise<void>;
}

