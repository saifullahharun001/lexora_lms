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

export interface ClassSessionRepositoryPort {
  create(input: CreateClassSessionInput): Promise<ClassSessionRecord>;
  findMany(filters: ClassSessionListFilters): Promise<ClassSessionRecord[]>;
  findById(
    departmentId: string,
    id: string,
    assignedTeacherUserId?: string
  ): Promise<ClassSessionRecord | null>;
  update(
    departmentId: string,
    id: string,
    input: UpdateClassSessionInput
  ): Promise<ClassSessionRecord | null>;
  updateLifecycle(
    departmentId: string,
    id: string,
    whereStatus: ClassSessionStatus | ClassSessionStatus[],
    data: Prisma.ClassSessionUpdateManyMutationInput
  ): Promise<ClassSessionRecord | null>;
}
