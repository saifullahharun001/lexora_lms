import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ExaminationCourseExaminerAssignmentStatus,
  ExaminationCourseExaminerSeat,
  Prisma,
  UserStatus,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import { PLATFORM_ROLES } from "@/modules/identity-access/authorization/roles.constants";

import { SUMMATIVE_EXAMINATION_AUDIT_EVENTS } from "../../domain/summative-examination.audit-events";
import type {
  AssignExaminationCourseExaminerDto,
  ReactivateExaminerAssignmentDto,
} from "../../presentation/http/dto/examiner-assignments.dto";
import {
  SummativeManagementAuthorizerService,
  type SummativeManagementAuthority,
} from "./summative-management-authorizer.service";

const MANAGEMENT_RESOURCE =
  "summative-examination.examiner-assignment" as const;

const MANAGED_SEATS = new Set<ExaminationCourseExaminerSeat>([
  ExaminationCourseExaminerSeat.FIRST_EXAMINER,
  ExaminationCourseExaminerSeat.SECOND_EXAMINER,
]);

const assignmentSelect = {
  id: true,
  departmentId: true,
  examinationId: true,
  examinationCourseId: true,
  assignedUserId: true,
  assignedByUserId: true,
  seat: true,
  status: true,
  assignedAt: true,
  expiresAt: true,
  unassignedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ExaminationCourseExaminerAssignmentSelect;

type AssignmentRecord =
  Prisma.ExaminationCourseExaminerAssignmentGetPayload<{
    select: typeof assignmentSelect;
  }>;

type LockedExaminationCourseScope = {
  examinationId: string;
  examinationCourseId: string;
};

@Injectable()
export class ExaminationCourseExaminerAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
    private readonly authorizer: SummativeManagementAuthorizerService,
  ) {}

  async listHistory(examinationCourseId: string) {
    const authority = await this.authorizer.authorize(MANAGEMENT_RESOURCE);
    const currentCourse = await this.prisma.examinationCourse.findFirst({
      where: {
        id: examinationCourseId,
        departmentId: authority.departmentId,
        archivedAt: null,
        examination: {
          departmentId: authority.departmentId,
          archivedAt: null,
        },
      },
      select: { id: true },
    });
    if (!currentCourse) {
      throw new NotFoundException("Examination course not found");
    }
    return this.prisma.examinationCourseExaminerAssignment.findMany({
      where: {
        departmentId: authority.departmentId,
        examinationCourseId,
      },
      select: assignmentSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  async getById(assignmentId: string) {
    const authority = await this.authorizer.authorize(MANAGEMENT_RESOURCE);
    const assignment =
      await this.prisma.examinationCourseExaminerAssignment.findFirst({
        where: {
          id: assignmentId,
          departmentId: authority.departmentId,
          examinationCourse: {
            departmentId: authority.departmentId,
            archivedAt: null,
            examination: {
              departmentId: authority.departmentId,
              archivedAt: null,
            },
          },
        },
        select: assignmentSelect,
      });
    if (!assignment) {
      throw new NotFoundException("Examiner assignment not found");
    }
    return assignment;
  }

  async assign(
    examinationCourseId: string,
    input: AssignExaminationCourseExaminerDto,
  ) {
    if (!MANAGED_SEATS.has(input.seat as ExaminationCourseExaminerSeat)) {
      throw new BadRequestException("Examiner seat is invalid");
    }
    const authority = await this.authorizer.authorize(MANAGEMENT_RESOURCE);
    const transitionAt = new Date();
    const expiresAt = this.parseFutureExpiry(input.expiresAt, transitionAt);

    try {
      return await this.serializable(async (tx) => {
        await this.authorizer.assertCurrentAuthority(
          tx,
          authority,
          MANAGEMENT_RESOURCE,
          transitionAt,
        );
        const scope = await this.lockCurrentExaminationCourse(
          tx,
          authority.departmentId,
          examinationCourseId,
        );
        await this.lockEligibleTeacher(
          tx,
          authority.departmentId,
          input.assignedUserId,
          transitionAt,
        );
        await this.retireExpiredConflicts(
          tx,
          authority,
          {
            ...scope,
            assignedUserId: input.assignedUserId,
            seat: input.seat as ExaminationCourseExaminerSeat,
          },
          transitionAt,
        );

        const assignment =
          await tx.examinationCourseExaminerAssignment.create({
            data: {
              departmentId: authority.departmentId,
              examinationId: scope.examinationId,
              examinationCourseId: scope.examinationCourseId,
              assignedUserId: input.assignedUserId,
              assignedByUserId: authority.actorUserId,
              seat: input.seat,
              status: ExaminationCourseExaminerAssignmentStatus.ACTIVE,
              assignedAt: transitionAt,
              expiresAt,
            },
            select: assignmentSelect,
          });
        await this.writeAssignmentAudit(
          tx,
          authority,
          assignment,
          SUMMATIVE_EXAMINATION_AUDIT_EVENTS.EXAMINER_ASSIGNMENT_CREATED,
        );
        return assignment;
      });
    } catch (error) {
      if (this.isActiveAssignmentUniquenessConflict(error)) {
        throw new ConflictException(
          "Examiner seat or assigned user is currently occupied",
        );
      }
      throw error;
    }
  }

  async unassign(assignmentId: string) {
    const authority = await this.authorizer.authorize(MANAGEMENT_RESOURCE);
    const transitionAt = new Date();
    return this.serializable(async (tx) => {
      await this.authorizer.assertCurrentAuthority(
        tx,
        authority,
        MANAGEMENT_RESOURCE,
        transitionAt,
      );
      const assignment = await this.lockCurrentAssignment(
        tx,
        authority.departmentId,
        assignmentId,
        false,
        transitionAt,
      );
      if (assignment.archivedAt) {
        throw new ConflictException("Archived assignment cannot be changed");
      }
      if (assignment.status !== ExaminationCourseExaminerAssignmentStatus.ACTIVE) {
        throw new ConflictException("Examiner assignment is not active");
      }
      const updated = await this.transitionAssignment(tx, assignment, {
        status: ExaminationCourseExaminerAssignmentStatus.INACTIVE,
        unassignedAt: transitionAt,
      });
      await this.writeAssignmentAudit(
        tx,
        authority,
        updated,
        SUMMATIVE_EXAMINATION_AUDIT_EVENTS.EXAMINER_ASSIGNMENT_UNASSIGNED,
      );
      return updated;
    });
  }

  async reactivate(
    assignmentId: string,
    input: ReactivateExaminerAssignmentDto,
  ) {
    const authority = await this.authorizer.authorize(MANAGEMENT_RESOURCE);
    const transitionAt = new Date();
    const expiresAt = this.parseFutureExpiry(input.expiresAt, transitionAt);
    try {
      return await this.serializable(async (tx) => {
        await this.authorizer.assertCurrentAuthority(
          tx,
          authority,
          MANAGEMENT_RESOURCE,
          transitionAt,
        );
        const assignment = await this.lockCurrentAssignment(
          tx,
          authority.departmentId,
          assignmentId,
          true,
          transitionAt,
        );
        if (assignment.archivedAt) {
          throw new ConflictException("Archived assignment cannot be changed");
        }
        if (
          assignment.status !==
            ExaminationCourseExaminerAssignmentStatus.INACTIVE ||
          assignment.unassignedAt === null
        ) {
          throw new ConflictException(
            "Examiner assignment is not eligible for reactivation",
          );
        }
        await this.retireExpiredConflicts(
          tx,
          authority,
          {
            examinationId: assignment.examinationId,
            examinationCourseId: assignment.examinationCourseId,
            assignedUserId: assignment.assignedUserId,
            seat: assignment.seat,
          },
          transitionAt,
        );
        const updated = await this.transitionAssignment(tx, assignment, {
          status: ExaminationCourseExaminerAssignmentStatus.ACTIVE,
          assignedAt: transitionAt,
          expiresAt,
          unassignedAt: null,
        });
        await this.writeAssignmentAudit(
          tx,
          authority,
          updated,
          SUMMATIVE_EXAMINATION_AUDIT_EVENTS.EXAMINER_ASSIGNMENT_REACTIVATED,
        );
        return updated;
      });
    } catch (error) {
      if (this.isActiveAssignmentUniquenessConflict(error)) {
        throw new ConflictException(
          "Examiner seat or assigned user is currently occupied",
        );
      }
      throw error;
    }
  }

  async updateExpiry(assignmentId: string, expiry: string) {
    const authority = await this.authorizer.authorize(MANAGEMENT_RESOURCE);
    const transitionAt = new Date();
    const expiresAt = this.parseFutureExpiry(expiry, transitionAt);
    if (!expiresAt) throw new BadRequestException("Expiry is required");
    return this.serializable(async (tx) => {
      await this.authorizer.assertCurrentAuthority(
        tx,
        authority,
        MANAGEMENT_RESOURCE,
        transitionAt,
      );
      const assignment = await this.lockCurrentAssignment(
        tx,
        authority.departmentId,
        assignmentId,
        true,
        transitionAt,
      );
      if (assignment.archivedAt) {
        throw new ConflictException("Archived assignment cannot be changed");
      }
      if (
        assignment.status !== ExaminationCourseExaminerAssignmentStatus.ACTIVE ||
        assignment.unassignedAt !== null ||
        assignment.assignedAt > transitionAt ||
        (assignment.expiresAt !== null && assignment.expiresAt <= transitionAt)
      ) {
        throw new ConflictException("Examiner assignment is not currently usable");
      }
      if (expiresAt <= assignment.assignedAt) {
        throw new BadRequestException(
          "Expiry must be later than assignment time",
        );
      }
      const updated = await this.transitionAssignment(tx, assignment, {
        expiresAt,
      });
      await this.writeAssignmentAudit(
        tx,
        authority,
        updated,
        SUMMATIVE_EXAMINATION_AUDIT_EVENTS.EXAMINER_ASSIGNMENT_EXPIRY_UPDATED,
      );
      return updated;
    });
  }

  async archive(assignmentId: string) {
    const authority = await this.authorizer.authorize(MANAGEMENT_RESOURCE);
    const transitionAt = new Date();
    return this.serializable(async (tx) => {
      await this.authorizer.assertCurrentAuthority(
        tx,
        authority,
        MANAGEMENT_RESOURCE,
        transitionAt,
      );
      const assignment = await this.lockCurrentAssignment(
        tx,
        authority.departmentId,
        assignmentId,
        false,
        transitionAt,
      );
      if (assignment.archivedAt) return assignment;
      const unassignedAt =
        assignment.unassignedAt ??
        (assignment.assignedAt > transitionAt
          ? assignment.assignedAt
          : transitionAt);
      const updated = await this.transitionAssignment(tx, assignment, {
        status: ExaminationCourseExaminerAssignmentStatus.ARCHIVED,
        archivedAt: transitionAt,
        unassignedAt,
      });
      await this.writeAssignmentAudit(
        tx,
        authority,
        updated,
        SUMMATIVE_EXAMINATION_AUDIT_EVENTS.EXAMINER_ASSIGNMENT_ARCHIVED,
      );
      return updated;
    });
  }

  private async retireExpiredConflicts(
    tx: Prisma.TransactionClient,
    authority: SummativeManagementAuthority,
    input: LockedExaminationCourseScope & {
      assignedUserId: string;
      seat: ExaminationCourseExaminerSeat;
    },
    transitionAt: Date,
  ) {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "examination_course_examiner_assignments"
      WHERE "department_id" = ${authority.departmentId}
        AND "examination_id" = ${input.examinationId}
        AND "examination_course_id" = ${input.examinationCourseId}
        AND "status" = ${ExaminationCourseExaminerAssignmentStatus.ACTIVE}::"ExaminationCourseExaminerAssignmentStatus"
        AND (
          "seat" = ${input.seat}::"ExaminationCourseExaminerSeat"
          OR "assigned_user_id" = ${input.assignedUserId}
        )
      ORDER BY "id"
      FOR UPDATE
    `);
    const conflicts =
      await tx.examinationCourseExaminerAssignment.findMany({
        where: {
          departmentId: authority.departmentId,
          examinationId: input.examinationId,
          examinationCourseId: input.examinationCourseId,
          status: ExaminationCourseExaminerAssignmentStatus.ACTIVE,
          OR: [{ seat: input.seat }, { assignedUserId: input.assignedUserId }],
        },
        select: assignmentSelect,
        orderBy: { id: "asc" },
      });
    if (
      conflicts.length !== locked.length ||
      conflicts.some((conflict, index) => conflict.id !== locked[index]?.id)
    ) {
      throw new ConflictException(
        "Concurrent Examiner assignment scope changed",
      );
    }
    for (const conflict of conflicts) {
      if (!conflict.expiresAt || conflict.expiresAt > transitionAt) {
        throw new ConflictException(
          conflict.seat === input.seat
            ? "Examiner seat is currently occupied"
            : "User already occupies another Examiner seat for this Examination course",
        );
      }
      const retired = await this.transitionAssignment(tx, conflict, {
        status: ExaminationCourseExaminerAssignmentStatus.INACTIVE,
        unassignedAt: transitionAt,
      });
      await this.writeAssignmentAudit(
        tx,
        authority,
        retired,
        SUMMATIVE_EXAMINATION_AUDIT_EVENTS.EXAMINER_ASSIGNMENT_EXPIRED_AUTO_RETIRED,
        {
          replacementSeat: input.seat,
          replacementAssignedUserId: input.assignedUserId,
        },
      );
    }
  }

  private async lockCurrentExaminationCourse(
    tx: Prisma.TransactionClient,
    departmentId: string,
    examinationCourseId: string,
  ): Promise<LockedExaminationCourseScope> {
    const base = await tx.examinationCourse.findFirst({
      where: { id: examinationCourseId, departmentId },
      select: { id: true, examinationId: true },
    });
    if (!base) throw new NotFoundException("Examination course not found");

    const examinations = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "examinations"
      WHERE "id" = ${base.examinationId}
        AND "department_id" = ${departmentId}
        AND "archived_at" IS NULL
      FOR UPDATE
    `);
    if (examinations.length !== 1) {
      throw new NotFoundException("Examination course not found");
    }
    const courses = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "examination_courses"
      WHERE "id" = ${examinationCourseId}
        AND "department_id" = ${departmentId}
        AND "examination_id" = ${base.examinationId}
        AND "archived_at" IS NULL
      FOR UPDATE
    `);
    if (courses.length !== 1) {
      throw new NotFoundException("Examination course not found");
    }
    return {
      examinationId: base.examinationId,
      examinationCourseId: base.id,
    };
  }

  private async lockCurrentAssignment(
    tx: Prisma.TransactionClient,
    departmentId: string,
    assignmentId: string,
    requireCurrentTeacher: boolean,
    evaluatedAt: Date,
  ): Promise<AssignmentRecord> {
    const base =
      await tx.examinationCourseExaminerAssignment.findFirst({
        where: { id: assignmentId, departmentId },
        select: assignmentSelect,
      });
    if (!base) throw new NotFoundException("Examiner assignment not found");
    const scope = await this.lockCurrentExaminationCourse(
      tx,
      departmentId,
      base.examinationCourseId,
    );
    if (scope.examinationId !== base.examinationId) {
      throw new NotFoundException("Examiner assignment not found");
    }
    if (requireCurrentTeacher) {
      await this.lockEligibleTeacher(
        tx,
        departmentId,
        base.assignedUserId,
        evaluatedAt,
      );
    }
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "examination_course_examiner_assignments"
      WHERE "id" = ${assignmentId}
        AND "department_id" = ${departmentId}
        AND "examination_id" = ${base.examinationId}
        AND "examination_course_id" = ${base.examinationCourseId}
        AND "assigned_user_id" = ${base.assignedUserId}
        AND "seat" = ${base.seat}::"ExaminationCourseExaminerSeat"
      FOR UPDATE
    `);
    if (rows.length !== 1) {
      throw new NotFoundException("Examiner assignment not found");
    }
    const assignment =
      await tx.examinationCourseExaminerAssignment.findFirst({
        where: { id: assignmentId, departmentId },
        select: assignmentSelect,
      });
    if (!assignment) {
      throw new NotFoundException("Examiner assignment not found");
    }
    return assignment;
  }

  private async lockEligibleTeacher(
    tx: Prisma.TransactionClient,
    departmentId: string,
    userId: string,
    evaluatedAt: Date,
  ) {
    const users = await tx.$queryRaw<
      Array<{ id: string; userRoleId: string; roleId: string }>
    >(Prisma.sql`
      SELECT u."id", ur."id" AS "userRoleId", r."id" AS "roleId"
      FROM "users" u
      JOIN "user_roles" ur
        ON ur."user_id" = u."id"
        AND ur."department_id" = u."department_id"
      JOIN "roles" r
        ON r."id" = ur."role_id"
        AND r."department_id" = ur."department_id"
      WHERE u."id" = ${userId}
        AND u."department_id" = ${departmentId}
        AND u."status" = ${UserStatus.ACTIVE}::"UserStatus"
        AND u."archived_at" IS NULL
        AND u."deleted_at" IS NULL
        AND ur."department_id" = ${departmentId}
        AND ur."revoked_at" IS NULL
        AND (ur."expires_at" IS NULL OR ur."expires_at" > ${evaluatedAt})
        AND r."department_id" = ${departmentId}
        AND r."code" = ${PLATFORM_ROLES.TEACHER}
        AND r."archived_at" IS NULL
      ORDER BY ur."id", r."id"
      FOR UPDATE OF u, ur FOR SHARE OF r
    `);
    if (users.length !== 1) {
      throw new NotFoundException("Examiner user not found");
    }
  }

  private async transitionAssignment(
    tx: Prisma.TransactionClient,
    existing: AssignmentRecord,
    data: Prisma.ExaminationCourseExaminerAssignmentUpdateManyMutationInput,
  ) {
    const mutation =
      await tx.examinationCourseExaminerAssignment.updateMany({
        where: {
          id: existing.id,
          departmentId: existing.departmentId,
          examinationId: existing.examinationId,
          examinationCourseId: existing.examinationCourseId,
          assignedUserId: existing.assignedUserId,
          seat: existing.seat,
          status: existing.status,
          assignedAt: existing.assignedAt,
          expiresAt: existing.expiresAt,
          unassignedAt: existing.unassignedAt,
          archivedAt: existing.archivedAt,
        },
        data,
      });
    if (mutation.count !== 1) {
      throw new ConflictException(
        "Concurrent Examiner assignment change conflicted",
      );
    }
    const updated =
      await tx.examinationCourseExaminerAssignment.findFirst({
        where: { id: existing.id, departmentId: existing.departmentId },
        select: assignmentSelect,
      });
    if (!updated) {
      throw new ConflictException(
        "Concurrent Examiner assignment change conflicted",
      );
    }
    return updated;
  }

  private parseFutureExpiry(value: string | undefined, transitionAt: Date) {
    if (value === undefined) return null;
    const expiresAt = new Date(value);
    if (
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() <= transitionAt.getTime()
    ) {
      throw new BadRequestException("Expiry must be strictly in the future");
    }
    return expiresAt;
  }

  private async writeAssignmentAudit(
    tx: Prisma.TransactionClient,
    authority: SummativeManagementAuthority,
    assignment: AssignmentRecord,
    action: string,
    extraContext: Prisma.InputJsonObject = {},
  ) {
    const requestContext = this.requestContextService.get();
    await tx.auditLog.create({
      data: {
        requestId: requestContext?.requestId,
        actorUserId: authority.actorUserId,
        actorType: "USER",
        departmentId: authority.departmentId,
        action,
        targetType: "examination_course_examiner_assignment",
        targetId: assignment.id,
        outcome: "SUCCESS",
        ipAddress: requestContext?.audit.ipAddress,
        userAgent: requestContext?.audit.userAgent,
        contextJson: {
          actorUserId: authority.actorUserId,
          departmentId: assignment.departmentId,
          examinationId: assignment.examinationId,
          examinationCourseId: assignment.examinationCourseId,
          assignmentId: assignment.id,
          examinerSeat: assignment.seat,
          assignedUserId: assignment.assignedUserId,
          status: assignment.status,
          expiresAt: assignment.expiresAt?.toISOString() ?? null,
          ...extraContext,
        },
      },
    });
  }

  private isActiveAssignmentUniquenessConflict(error: unknown) {
    if (
      !(error instanceof PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      return false;
    }
    const target = error.meta?.target;
    return (
      target === "exam_course_examiner_assignment_active_seat_uq" ||
      target === "exam_course_examiner_assignment_active_user_uq"
    );
  }

  private isRetryableTransactionConflict(error: unknown) {
    if (!(error instanceof PrismaClientKnownRequestError)) return false;
    return (
      error.code === "P2034" ||
      (error.code === "P2010" &&
        (error.meta?.code === "40001" || error.meta?.code === "40P01"))
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
        if (attempt >= 2 || !this.isRetryableTransactionConflict(error)) {
          throw error;
        }
      }
    }
  }
}
