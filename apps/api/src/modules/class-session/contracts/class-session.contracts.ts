import type { ClassSessionStatus } from "@prisma/client";

export interface ClassSessionRecord {
  id: string;
  departmentId: string;
  courseOfferingId: string;
  teacherAssignmentId?: string | null;
  sessionCode?: string | null;
  title?: string | null;
  status: ClassSessionStatus;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  actualStartAt?: Date | null;
  actualEndAt?: Date | null;
  location?: string | null;
  externalSourceRef?: string | null;
  lockedAt?: Date | null;
  canceledAt?: Date | null;
  archivedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}
