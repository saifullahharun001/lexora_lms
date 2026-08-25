import { Injectable } from "@nestjs/common";
import {
  BatchCoordinatorAssignmentStatus,
  DepartmentStatus,
  Prisma,
  UserStatus,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { PrismaService } from "@/common/prisma/prisma.service";
import { PERMISSIONS } from "@/modules/identity-access/authorization/permissions.constants";

import type {
  ArchiveBatchCoordinatorAssignmentResult,
  BatchCoordinatorAssignmentRepositoryPort,
  BatchCoordinatorAssignmentView,
  BatchCoordinatorAuthorityQuery,
  BatchCoordinatorManagementAuthority,
  BatchCoordinatorWriteContext,
  CreateBatchCoordinatorAssignmentInput,
  CreateBatchCoordinatorAssignmentResult,
  ReactivateBatchCoordinatorAssignmentInput,
  ReactivateBatchCoordinatorAssignmentResult,
  TransitionBatchCoordinatorAssignmentInput,
  UnassignBatchCoordinatorAssignmentResult,
  UpdateBatchCoordinatorAssignmentInput,
  UpdateBatchCoordinatorAssignmentResult,
} from "../../application/ports/batch-coordinator-assignment.repository.port";
import { ACADEMIC_AUDIT_EVENTS } from "../../domain/academic.audit-events";

const assignmentSelect = {
  id: true,
  departmentId: true,
  studentBatchId: true,
  academicTermId: true,
  coordinatorUserId: true,
  assignedByUserId: true,
  status: true,
  assignedAt: true,
  expiresAt: true,
  unassignedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BatchCoordinatorAssignmentSelect;

type AssignmentRecord = Prisma.BatchCoordinatorAssignmentGetPayload<{
  select: typeof assignmentSelect;
}>;

function sameInstant(left: Date | null, right: Date | null) {
  return left === null
    ? right === null
    : right !== null && left.getTime() === right.getTime();
}

function isUsable(record: AssignmentRecord, at: Date) {
  return Boolean(
    record.status === BatchCoordinatorAssignmentStatus.ACTIVE &&
    record.archivedAt === null &&
    record.unassignedAt === null &&
    record.assignedAt.getTime() <= at.getTime() &&
    (record.expiresAt === null || record.expiresAt.getTime() > at.getTime()),
  );
}

@Injectable()
export class PrismaBatchCoordinatorAssignmentRepository implements BatchCoordinatorAssignmentRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  findMany(
    filters: Parameters<
      BatchCoordinatorAssignmentRepositoryPort["findMany"]
    >[0],
  ) {
    return this.prisma.batchCoordinatorAssignment.findMany({
      where: {
        departmentId: filters.departmentId,
        studentBatchId: filters.studentBatchId,
        academicTermId: filters.academicTermId,
        coordinatorUserId: filters.coordinatorUserId,
        status: filters.status,
      },
      select: assignmentSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  findById(departmentId: string, assignmentId: string) {
    return this.prisma.batchCoordinatorAssignment.findFirst({
      where: { id: assignmentId, departmentId },
      select: assignmentSelect,
    });
  }

  async create(
    input: CreateBatchCoordinatorAssignmentInput,
  ): Promise<CreateBatchCoordinatorAssignmentResult> {
    try {
      return await this.serializable(async (tx) => {
        if (!(await this.lockManagementAuthority(tx, input))) {
          return { outcome: "MANAGEMENT_AUTHORITY_INVALID" } as const;
        }
        if (input.expiresAt && input.expiresAt <= input.transitionAt) {
          return { outcome: "INVALID_EXPIRY" } as const;
        }

        const identityKey = JSON.stringify([
          input.departmentId,
          input.studentBatchId,
          input.academicTermId,
          input.coordinatorUserId,
        ]);
        await tx.$queryRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${identityKey}, 0))`,
        );

        const parentFailure = await this.lockAndValidateParents(tx, input);
        if (parentFailure) return { outcome: parentFailure } as const;

        const existing = await tx.batchCoordinatorAssignment.findUnique({
          where: {
            departmentId_studentBatchId_academicTermId_coordinatorUserId: {
              departmentId: input.departmentId,
              studentBatchId: input.studentBatchId,
              academicTermId: input.academicTermId,
              coordinatorUserId: input.coordinatorUserId,
            },
          },
          select: assignmentSelect,
        });
        if (existing) {
          if (
            isUsable(existing, input.transitionAt) &&
            sameInstant(existing.expiresAt, input.expiresAt)
          ) {
            return { outcome: "ALREADY_ACTIVE", assignment: existing } as const;
          }
          return {
            outcome: isUsable(existing, input.transitionAt)
              ? "CONFIGURATION_CONFLICT"
              : "REACTIVATION_REQUIRED",
          } as const;
        }

        const assignment = await tx.batchCoordinatorAssignment.create({
          data: {
            departmentId: input.departmentId,
            studentBatchId: input.studentBatchId,
            academicTermId: input.academicTermId,
            coordinatorUserId: input.coordinatorUserId,
            assignedByUserId: input.actorUserId,
            status: BatchCoordinatorAssignmentStatus.ACTIVE,
            assignedAt: input.transitionAt,
            expiresAt: input.expiresAt,
            unassignedAt: null,
            archivedAt: null,
          },
          select: assignmentSelect,
        });
        await this.writeAudit(
          tx,
          input,
          assignment,
          ACADEMIC_AUDIT_EVENTS.BATCH_COORDINATOR_ASSIGNMENT_ASSIGNED,
        );
        return { outcome: "CREATED", assignment } as const;
      });
    } catch (error) {
      if (!this.isExactIdentityConflict(error)) throw error;
      const concurrent = await this.findExact(input);
      if (
        concurrent &&
        isUsable(concurrent, input.transitionAt) &&
        sameInstant(concurrent.expiresAt, input.expiresAt)
      ) {
        return { outcome: "ALREADY_ACTIVE", assignment: concurrent };
      }
      return { outcome: "CONCURRENT_CONFLICT" };
    }
  }

  updateExpiry(
    input: UpdateBatchCoordinatorAssignmentInput,
  ): Promise<UpdateBatchCoordinatorAssignmentResult> {
    return this.serializable(async (tx) => {
      if (!(await this.lockManagementAuthority(tx, input))) {
        return { outcome: "MANAGEMENT_AUTHORITY_INVALID" } as const;
      }
      if (input.expiresAt && input.expiresAt <= input.transitionAt) {
        return { outcome: "INVALID_EXPIRY" } as const;
      }
      const existing = await this.lockAssignment(
        tx,
        input.departmentId,
        input.assignmentId,
      );
      if (!existing) return { outcome: "ASSIGNMENT_NOT_FOUND" } as const;
      if (
        existing.archivedAt ||
        existing.status === BatchCoordinatorAssignmentStatus.ARCHIVED
      ) {
        return { outcome: "ASSIGNMENT_ARCHIVED" } as const;
      }
      if (!isUsable(existing, input.transitionAt)) {
        return { outcome: "NOT_ACTIVE" } as const;
      }
      const parentFailure = await this.lockAndValidateParents(tx, {
        ...input,
        studentBatchId: existing.studentBatchId,
        academicTermId: existing.academicTermId,
        coordinatorUserId: existing.coordinatorUserId,
      });
      if (parentFailure) return { outcome: parentFailure } as const;
      if (sameInstant(existing.expiresAt, input.expiresAt)) {
        return { outcome: "NO_CHANGES", assignment: existing } as const;
      }

      const mutation = await tx.batchCoordinatorAssignment.updateMany({
        where: {
          id: existing.id,
          departmentId: input.departmentId,
          status: BatchCoordinatorAssignmentStatus.ACTIVE,
          archivedAt: null,
          unassignedAt: null,
          assignedAt: existing.assignedAt,
          expiresAt: existing.expiresAt,
        },
        data: { expiresAt: input.expiresAt },
      });
      if (mutation.count !== 1)
        return { outcome: "CONCURRENT_CONFLICT" } as const;
      const assignment = await this.readLockedAssignment(
        tx,
        input.departmentId,
        existing.id,
      );
      if (!assignment) return { outcome: "CONCURRENT_CONFLICT" } as const;
      await this.writeAudit(
        tx,
        input,
        assignment,
        ACADEMIC_AUDIT_EVENTS.BATCH_COORDINATOR_ASSIGNMENT_UPDATED,
      );
      return { outcome: "UPDATED", assignment } as const;
    });
  }

  unassign(
    input: TransitionBatchCoordinatorAssignmentInput,
  ): Promise<UnassignBatchCoordinatorAssignmentResult> {
    return this.serializable(async (tx) => {
      if (!(await this.lockManagementAuthority(tx, input))) {
        return { outcome: "MANAGEMENT_AUTHORITY_INVALID" } as const;
      }
      const existing = await this.lockAssignment(
        tx,
        input.departmentId,
        input.assignmentId,
      );
      if (!existing) return { outcome: "ASSIGNMENT_NOT_FOUND" } as const;
      if (
        existing.archivedAt ||
        existing.status === BatchCoordinatorAssignmentStatus.ARCHIVED
      ) {
        return { outcome: "ASSIGNMENT_ARCHIVED" } as const;
      }
      if (
        existing.status === BatchCoordinatorAssignmentStatus.INACTIVE &&
        existing.unassignedAt !== null
      ) {
        return { outcome: "ALREADY_INACTIVE", assignment: existing } as const;
      }
      if (!isUsable(existing, input.transitionAt)) {
        return { outcome: "NOT_ACTIVE" } as const;
      }
      const mutation = await tx.batchCoordinatorAssignment.updateMany({
        where: {
          id: existing.id,
          departmentId: input.departmentId,
          status: BatchCoordinatorAssignmentStatus.ACTIVE,
          archivedAt: null,
          unassignedAt: null,
          assignedAt: existing.assignedAt,
          expiresAt: existing.expiresAt,
        },
        data: {
          status: BatchCoordinatorAssignmentStatus.INACTIVE,
          unassignedAt: input.transitionAt,
        },
      });
      if (mutation.count !== 1)
        return { outcome: "CONCURRENT_CONFLICT" } as const;
      const assignment = await this.readLockedAssignment(
        tx,
        input.departmentId,
        existing.id,
      );
      if (!assignment) return { outcome: "CONCURRENT_CONFLICT" } as const;
      await this.writeAudit(
        tx,
        input,
        assignment,
        ACADEMIC_AUDIT_EVENTS.BATCH_COORDINATOR_ASSIGNMENT_UNASSIGNED,
      );
      return { outcome: "UNASSIGNED", assignment } as const;
    });
  }

  reactivate(
    input: ReactivateBatchCoordinatorAssignmentInput,
  ): Promise<ReactivateBatchCoordinatorAssignmentResult> {
    return this.serializable(async (tx) => {
      if (!(await this.lockManagementAuthority(tx, input))) {
        return { outcome: "MANAGEMENT_AUTHORITY_INVALID" } as const;
      }
      if (input.expiresAt && input.expiresAt <= input.transitionAt) {
        return { outcome: "INVALID_EXPIRY" } as const;
      }
      const existing = await this.lockAssignment(
        tx,
        input.departmentId,
        input.assignmentId,
      );
      if (!existing) return { outcome: "ASSIGNMENT_NOT_FOUND" } as const;
      if (
        existing.archivedAt ||
        existing.status === BatchCoordinatorAssignmentStatus.ARCHIVED
      ) {
        return { outcome: "ASSIGNMENT_ARCHIVED" } as const;
      }
      if (isUsable(existing, input.transitionAt)) {
        return sameInstant(existing.expiresAt, input.expiresAt)
          ? ({ outcome: "ALREADY_ACTIVE", assignment: existing } as const)
          : ({ outcome: "CONFIGURATION_CONFLICT" } as const);
      }
      const expiredActive =
        existing.status === BatchCoordinatorAssignmentStatus.ACTIVE &&
        existing.unassignedAt === null &&
        existing.assignedAt <= input.transitionAt &&
        existing.expiresAt !== null &&
        existing.expiresAt <= input.transitionAt;
      if (
        existing.status !== BatchCoordinatorAssignmentStatus.INACTIVE &&
        !expiredActive
      ) {
        return { outcome: "NOT_REACTIVATABLE" } as const;
      }
      const parentFailure = await this.lockAndValidateParents(tx, {
        ...input,
        studentBatchId: existing.studentBatchId,
        academicTermId: existing.academicTermId,
        coordinatorUserId: existing.coordinatorUserId,
      });
      if (parentFailure) return { outcome: parentFailure } as const;

      const mutation = await tx.batchCoordinatorAssignment.updateMany({
        where: {
          id: existing.id,
          departmentId: input.departmentId,
          archivedAt: null,
          status: existing.status,
          assignedAt: existing.assignedAt,
          expiresAt: existing.expiresAt,
          unassignedAt: existing.unassignedAt,
        },
        data: {
          status: BatchCoordinatorAssignmentStatus.ACTIVE,
          assignedByUserId: input.actorUserId,
          assignedAt: input.transitionAt,
          expiresAt: input.expiresAt,
          unassignedAt: null,
        },
      });
      if (mutation.count !== 1)
        return { outcome: "CONCURRENT_CONFLICT" } as const;
      const assignment = await this.readLockedAssignment(
        tx,
        input.departmentId,
        existing.id,
      );
      if (!assignment) return { outcome: "CONCURRENT_CONFLICT" } as const;
      await this.writeAudit(
        tx,
        input,
        assignment,
        ACADEMIC_AUDIT_EVENTS.BATCH_COORDINATOR_ASSIGNMENT_REACTIVATED,
      );
      return { outcome: "REACTIVATED", assignment } as const;
    });
  }

  archive(
    input: TransitionBatchCoordinatorAssignmentInput,
  ): Promise<ArchiveBatchCoordinatorAssignmentResult> {
    return this.serializable(async (tx) => {
      if (!(await this.lockManagementAuthority(tx, input))) {
        return { outcome: "MANAGEMENT_AUTHORITY_INVALID" } as const;
      }
      const existing = await this.lockAssignment(
        tx,
        input.departmentId,
        input.assignmentId,
      );
      if (!existing) return { outcome: "ASSIGNMENT_NOT_FOUND" } as const;
      if (existing.archivedAt !== null) {
        return { outcome: "ALREADY_ARCHIVED", assignment: existing } as const;
      }
      const unassignedAt =
        existing.unassignedAt ??
        (existing.assignedAt > input.transitionAt
          ? existing.assignedAt
          : input.transitionAt);
      const mutation = await tx.batchCoordinatorAssignment.updateMany({
        where: {
          id: existing.id,
          departmentId: input.departmentId,
          archivedAt: null,
          status: existing.status,
          assignedAt: existing.assignedAt,
          expiresAt: existing.expiresAt,
          unassignedAt: existing.unassignedAt,
        },
        data: {
          status: BatchCoordinatorAssignmentStatus.ARCHIVED,
          archivedAt: input.transitionAt,
          unassignedAt,
        },
      });
      if (mutation.count !== 1)
        return { outcome: "CONCURRENT_CONFLICT" } as const;
      const assignment = await this.readLockedAssignment(
        tx,
        input.departmentId,
        existing.id,
      );
      if (!assignment) return { outcome: "CONCURRENT_CONFLICT" } as const;
      await this.writeAudit(
        tx,
        input,
        assignment,
        ACADEMIC_AUDIT_EVENTS.BATCH_COORDINATOR_ASSIGNMENT_ARCHIVED,
      );
      return { outcome: "ARCHIVED", assignment } as const;
    });
  }

  async hasActiveAuthority(
    input: BatchCoordinatorAuthorityQuery,
  ): Promise<boolean> {
    const assignment = await this.prisma.batchCoordinatorAssignment.findFirst({
      where: {
        departmentId: input.departmentId,
        studentBatchId: input.studentBatchId,
        academicTermId: input.academicTermId,
        coordinatorUserId: input.coordinatorUserId,
        status: BatchCoordinatorAssignmentStatus.ACTIVE,
        archivedAt: null,
        unassignedAt: null,
        assignedAt: { lte: input.evaluatedAt },
        OR: [{ expiresAt: null }, { expiresAt: { gt: input.evaluatedAt } }],
        department: {
          is: {
            id: input.departmentId,
            status: DepartmentStatus.ACTIVE,
            archivedAt: null,
            deletedAt: null,
          },
        },
        studentBatch: {
          is: {
            id: input.studentBatchId,
            departmentId: input.departmentId,
            archivedAt: null,
            academicProgram: {
              is: { departmentId: input.departmentId, archivedAt: null },
            },
            academicSession: {
              is: { departmentId: input.departmentId, archivedAt: null },
            },
          },
        },
        academicTerm: {
          is: {
            id: input.academicTermId,
            departmentId: input.departmentId,
            archivedAt: null,
          },
        },
        coordinatorUser: {
          is: {
            id: input.coordinatorUserId,
            departmentId: input.departmentId,
            status: UserStatus.ACTIVE,
            archivedAt: null,
            deletedAt: null,
          },
        },
      },
      select: { id: true },
    });
    return assignment !== null;
  }

  private async lockManagementAuthority(
    tx: Prisma.TransactionClient,
    authority: BatchCoordinatorManagementAuthority,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT u."id"
      FROM "users" u
      JOIN "departments" d ON d."id" = u."department_id"
      JOIN "user_roles" ur
        ON ur."user_id" = u."id" AND ur."department_id" = d."id"
      JOIN "roles" r
        ON r."id" = ur."role_id" AND r."department_id" = d."id"
      JOIN "role_permissions" rp ON rp."role_id" = r."id"
      JOIN "permissions" p ON p."id" = rp."permission_id"
      WHERE u."id" = ${authority.actorUserId}
        AND u."department_id" = ${authority.departmentId}
        AND u."status" = ${UserStatus.ACTIVE}::"UserStatus"
        AND u."archived_at" IS NULL
        AND u."deleted_at" IS NULL
        AND d."status" = ${DepartmentStatus.ACTIVE}::"DepartmentStatus"
        AND d."archived_at" IS NULL
        AND d."deleted_at" IS NULL
        AND ur."id" = ${authority.userRoleId}
        AND ur."role_id" = ${authority.roleId}
        AND ur."revoked_at" IS NULL
        AND (ur."expires_at" IS NULL OR ur."expires_at" > CURRENT_TIMESTAMP)
        AND r."code" = 'department_admin'
        AND r."archived_at" IS NULL
        AND p."code" = ${PERMISSIONS.COURSE_MANAGEMENT.BATCH_COORDINATOR_ASSIGNMENT_MANAGE}
        AND p."resource" = 'course-management.batch-coordinator-assignment'
        AND p."action" = 'manage'
        AND p."scope" = 'DEPARTMENT'::"PermissionScope"
      FOR UPDATE OF u, d, ur, r, rp, p
    `);
    return rows.length === 1;
  }

  private async lockAndValidateParents(
    tx: Prisma.TransactionClient,
    input: {
      departmentId: string;
      studentBatchId: string;
      academicTermId: string;
      coordinatorUserId: string;
    },
  ) {
    const batches = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT sb."id"
      FROM "student_batches" sb
      JOIN "academic_programs" ap
        ON ap."id" = sb."academic_program_id"
        AND ap."department_id" = sb."department_id"
      JOIN "academic_sessions" ass
        ON ass."id" = sb."academic_session_id"
        AND ass."department_id" = sb."department_id"
      WHERE sb."id" = ${input.studentBatchId}
        AND sb."department_id" = ${input.departmentId}
        AND sb."archived_at" IS NULL
        AND ap."archived_at" IS NULL
        AND ass."archived_at" IS NULL
      FOR UPDATE OF sb, ap, ass
    `);
    if (batches.length !== 1) return "STUDENT_BATCH_NOT_FOUND" as const;

    const terms = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "academic_terms"
      WHERE "id" = ${input.academicTermId}
        AND "department_id" = ${input.departmentId}
        AND "archived_at" IS NULL
      FOR UPDATE
    `);
    if (terms.length !== 1) return "ACADEMIC_TERM_NOT_FOUND" as const;

    const users = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "users"
      WHERE "id" = ${input.coordinatorUserId}
        AND "department_id" = ${input.departmentId}
        AND "status" = ${UserStatus.ACTIVE}::"UserStatus"
        AND "archived_at" IS NULL
        AND "deleted_at" IS NULL
      FOR UPDATE
    `);
    if (users.length !== 1) return "COORDINATOR_USER_NOT_FOUND" as const;
    return null;
  }

  private async lockAssignment(
    tx: Prisma.TransactionClient,
    departmentId: string,
    assignmentId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "batch_coordinator_assignments"
      WHERE "id" = ${assignmentId}
        AND "department_id" = ${departmentId}
      FOR UPDATE
    `);
    return rows.length === 1
      ? this.readLockedAssignment(tx, departmentId, assignmentId)
      : null;
  }

  private readLockedAssignment(
    tx: Prisma.TransactionClient,
    departmentId: string,
    assignmentId: string,
  ) {
    return tx.batchCoordinatorAssignment.findFirst({
      where: { id: assignmentId, departmentId },
      select: assignmentSelect,
    });
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    input: BatchCoordinatorWriteContext,
    assignment: BatchCoordinatorAssignmentView,
    action: string,
  ) {
    await tx.auditLog.create({
      data: {
        requestId: input.requestId,
        actorUserId: input.actorUserId,
        actorType: "USER",
        departmentId: input.departmentId,
        action,
        targetType: "batch_coordinator_assignment",
        targetId: assignment.id,
        outcome: "SUCCESS",
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        contextJson: {
          studentBatchId: assignment.studentBatchId,
          academicTermId: assignment.academicTermId,
          coordinatorUserId: assignment.coordinatorUserId,
          status: assignment.status,
          expiresAt: assignment.expiresAt?.toISOString() ?? null,
        },
      },
    });
  }

  private findExact(input: CreateBatchCoordinatorAssignmentInput) {
    return this.prisma.batchCoordinatorAssignment.findUnique({
      where: {
        departmentId_studentBatchId_academicTermId_coordinatorUserId: {
          departmentId: input.departmentId,
          studentBatchId: input.studentBatchId,
          academicTermId: input.academicTermId,
          coordinatorUserId: input.coordinatorUserId,
        },
      },
      select: assignmentSelect,
    });
  }

  private isExactIdentityConflict(error: unknown) {
    if (
      !(error instanceof PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      return false;
    }
    const target = error.meta?.target;
    if (typeof target === "string")
      return target === "batch_coord_assign_scope_user_uq";
    if (!Array.isArray(target)) return false;
    const mapped = [
      "department_id",
      "student_batch_id",
      "academic_term_id",
      "coordinator_user_id",
    ];
    const fields = [
      "departmentId",
      "studentBatchId",
      "academicTermId",
      "coordinatorUserId",
    ];
    return (
      mapped.every((field) => target.includes(field)) ||
      fields.every((field) => target.includes(field))
    );
  }

  private async serializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        });
      } catch (error) {
        if (
          attempt >= 2 ||
          !(error instanceof PrismaClientKnownRequestError) ||
          error.code !== "P2034"
        ) {
          throw error;
        }
      }
    }
  }
}
