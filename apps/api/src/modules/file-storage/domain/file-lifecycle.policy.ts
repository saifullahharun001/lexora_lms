import { ConflictException } from "@nestjs/common";
import type { FileObjectStatus } from "@prisma/client";

const ALLOWED_TRANSITIONS: Readonly<
  Record<FileObjectStatus, readonly FileObjectStatus[]>
> = {
  PENDING_SCAN: ["AVAILABLE", "QUARANTINED", "REJECTED"],
  AVAILABLE: ["QUARANTINED", "ARCHIVED"],
  QUARANTINED: ["ARCHIVED"],
  REJECTED: ["ARCHIVED"],
  ARCHIVED: ["DELETED"],
  DELETED: [],
};

export function assertFileLifecycleTransition(
  currentStatus: FileObjectStatus,
  targetStatus: FileObjectStatus,
): void {
  if (!ALLOWED_TRANSITIONS[currentStatus].includes(targetStatus)) {
    throw new ConflictException("File lifecycle transition is not allowed");
  }
}
