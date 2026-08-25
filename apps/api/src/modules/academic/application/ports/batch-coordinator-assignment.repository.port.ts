import type { BatchCoordinatorAssignmentStatus } from "@prisma/client";

export const BATCH_COORDINATOR_ASSIGNMENT_REPOSITORY = Symbol(
  "BATCH_COORDINATOR_ASSIGNMENT_REPOSITORY",
);

export interface BatchCoordinatorAssignmentView {
  id: string;
  departmentId: string;
  studentBatchId: string;
  academicTermId: string;
  coordinatorUserId: string;
  assignedByUserId: string;
  status: BatchCoordinatorAssignmentStatus;
  assignedAt: Date;
  expiresAt: Date | null;
  unassignedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BatchCoordinatorAssignmentListFilters {
  departmentId: string;
  studentBatchId?: string;
  academicTermId?: string;
  coordinatorUserId?: string;
  status?: BatchCoordinatorAssignmentStatus;
}

export interface BatchCoordinatorManagementAuthority {
  departmentId: string;
  actorUserId: string;
  userRoleId: string;
  roleId: string;
}

export interface BatchCoordinatorWriteContext extends BatchCoordinatorManagementAuthority {
  transitionAt: Date;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateBatchCoordinatorAssignmentInput extends BatchCoordinatorWriteContext {
  studentBatchId: string;
  academicTermId: string;
  coordinatorUserId: string;
  expiresAt: Date | null;
}

export interface UpdateBatchCoordinatorAssignmentInput extends BatchCoordinatorWriteContext {
  assignmentId: string;
  expiresAt: Date | null;
}

export interface ReactivateBatchCoordinatorAssignmentInput extends BatchCoordinatorWriteContext {
  assignmentId: string;
  expiresAt: Date | null;
}

export interface TransitionBatchCoordinatorAssignmentInput extends BatchCoordinatorWriteContext {
  assignmentId: string;
}

export interface BatchCoordinatorAuthorityQuery {
  departmentId: string;
  coordinatorUserId: string;
  studentBatchId: string;
  academicTermId: string;
  evaluatedAt: Date;
}

export type BatchCoordinatorAssignmentWriteFailure =
  | "MANAGEMENT_AUTHORITY_INVALID"
  | "ASSIGNMENT_NOT_FOUND"
  | "STUDENT_BATCH_NOT_FOUND"
  | "ACADEMIC_TERM_NOT_FOUND"
  | "COORDINATOR_USER_NOT_FOUND"
  | "INVALID_EXPIRY"
  | "REACTIVATION_REQUIRED"
  | "CONFIGURATION_CONFLICT"
  | "NOT_ACTIVE"
  | "NOT_REACTIVATABLE"
  | "ASSIGNMENT_ARCHIVED"
  | "CONCURRENT_CONFLICT";

export type CreateBatchCoordinatorAssignmentResult =
  | {
      outcome: "CREATED" | "ALREADY_ACTIVE";
      assignment: BatchCoordinatorAssignmentView;
    }
  | { outcome: BatchCoordinatorAssignmentWriteFailure };

export type UpdateBatchCoordinatorAssignmentResult =
  | {
      outcome: "UPDATED" | "NO_CHANGES";
      assignment: BatchCoordinatorAssignmentView;
    }
  | { outcome: BatchCoordinatorAssignmentWriteFailure };

export type UnassignBatchCoordinatorAssignmentResult =
  | {
      outcome: "UNASSIGNED" | "ALREADY_INACTIVE";
      assignment: BatchCoordinatorAssignmentView;
    }
  | { outcome: BatchCoordinatorAssignmentWriteFailure };

export type ReactivateBatchCoordinatorAssignmentResult =
  | {
      outcome: "REACTIVATED" | "ALREADY_ACTIVE";
      assignment: BatchCoordinatorAssignmentView;
    }
  | { outcome: BatchCoordinatorAssignmentWriteFailure };

export type ArchiveBatchCoordinatorAssignmentResult =
  | {
      outcome: "ARCHIVED" | "ALREADY_ARCHIVED";
      assignment: BatchCoordinatorAssignmentView;
    }
  | { outcome: BatchCoordinatorAssignmentWriteFailure };

export interface BatchCoordinatorAssignmentRepositoryPort {
  findMany(
    filters: BatchCoordinatorAssignmentListFilters,
  ): Promise<BatchCoordinatorAssignmentView[]>;
  findById(
    departmentId: string,
    assignmentId: string,
  ): Promise<BatchCoordinatorAssignmentView | null>;
  create(
    input: CreateBatchCoordinatorAssignmentInput,
  ): Promise<CreateBatchCoordinatorAssignmentResult>;
  updateExpiry(
    input: UpdateBatchCoordinatorAssignmentInput,
  ): Promise<UpdateBatchCoordinatorAssignmentResult>;
  unassign(
    input: TransitionBatchCoordinatorAssignmentInput,
  ): Promise<UnassignBatchCoordinatorAssignmentResult>;
  reactivate(
    input: ReactivateBatchCoordinatorAssignmentInput,
  ): Promise<ReactivateBatchCoordinatorAssignmentResult>;
  archive(
    input: TransitionBatchCoordinatorAssignmentInput,
  ): Promise<ArchiveBatchCoordinatorAssignmentResult>;
  hasActiveAuthority(input: BatchCoordinatorAuthorityQuery): Promise<boolean>;
}
