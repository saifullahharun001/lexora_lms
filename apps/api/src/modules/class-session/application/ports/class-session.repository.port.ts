import type { ClassSessionStatus, Prisma } from "@prisma/client";

import type { ClassSessionRecord } from "../../contracts/class-session.contracts";

export interface ClassSessionListFilters {
  departmentId: string;
  courseOfferingId?: string;
  teacherAssignmentId?: string;
  status?: ClassSessionStatus;
  limit: number;
  offset: number;
  assignedTeacherUserId?: string;
}

export interface CreateClassSessionInput {
  departmentId: string;
  courseOfferingId: string;
  teacherAssignmentId?: string | null;
  sessionCode?: string | null;
  title?: string | null;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  location?: string | null;
  externalSourceRef?: string | null;
}

export interface UpdateClassSessionInput {
  teacherAssignmentId?: string | null;
  sessionCode?: string | null;
  title?: string | null;
  scheduledStartAt?: Date;
  scheduledEndAt?: Date;
  location?: string | null;
  externalSourceRef?: string | null;
}

export interface ClassSessionMutation {
  data: Prisma.ClassSessionUpdateManyMutationInput;
  audit: Prisma.AuditLogUncheckedCreateInput;
}

export interface DueSessionCursor { scheduledEndAt: Date; id: string }
export interface ReconciliationResult { cursor: DueSessionCursor | null; processed: number; conflicts: number }

export interface ClassSessionRepositoryPort {
  create(input: CreateClassSessionInput): Promise<ClassSessionRecord>;
  findMany(filters: ClassSessionListFilters): Promise<ClassSessionRecord[]>;
  findById(
    departmentId: string,
    id: string,
    assignedTeacherUserId?: string
  ): Promise<ClassSessionRecord | null>;
  mutate(
    departmentId: string,
    id: string,
    assignedTeacherUserId: string | undefined,
    build: (current: ClassSessionRecord, now: Date) => Promise<ClassSessionMutation>
  ): Promise<ClassSessionRecord | null>;
  reconcileDue(cursor?: DueSessionCursor): Promise<ReconciliationResult>;
}
