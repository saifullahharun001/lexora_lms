import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ExaminationCommitteeAssignmentStatus,
  ExaminationCommitteeSeat,
  Prisma,
  UserStatus,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";

import { SUMMATIVE_EXAMINATION_AUDIT_EVENTS } from "../../domain/summative-examination.audit-events";
import type {
  AppointExternalCommitteeMemberDto,
  AssignInternalCommitteeMemberDto,
  InternalCommitteeSeat,
  ReactivateCommitteeAssignmentDto,
} from "../../presentation/http/dto/committee-assignments.dto";
import {
  SummativeManagementAuthorizerService,
  type SummativeManagementAuthority,
} from "./summative-management-authorizer.service";

const INTERNAL_SEATS = new Set<ExaminationCommitteeSeat>([
  ExaminationCommitteeSeat.CHAIRMAN,
  ExaminationCommitteeSeat.MEMBER_1,
  ExaminationCommitteeSeat.MEMBER_2,
]);

const assignmentSelect = {
  id: true,
  departmentId: true,
  examinationId: true,
  committeeId: true,
  assignedUserId: true,
  assignedByUserId: true,
  externalMemberName: true,
  externalMemberAffiliation: true,
  seat: true,
  status: true,
  assignedAt: true,
  expiresAt: true,
  unassignedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ExaminationCommitteeAssignmentSelect;

type AssignmentRecord = Prisma.ExaminationCommitteeAssignmentGetPayload<{
  select: typeof assignmentSelect;
}>;

type LockedCommitteeScope = {
  committeeId: string;
  examinationId: string;
};

@Injectable()
export class ExaminationCommitteeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
    private readonly authorizer: SummativeManagementAuthorizerService,
  ) {}

  async listCommittees() {
    const authority = await this.authorizer.authorize(
      "summative-examination.committee",
    );
    return this.prisma.examinationCommittee.findMany({
      where: {
        departmentId: authority.departmentId,
        archivedAt: null,
        examination: { archivedAt: null },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  async getCommittee(committeeId: string) {
    const authority = await this.authorizer.authorize(
      "summative-examination.committee",
    );
    const committee = await this.prisma.examinationCommittee.findFirst({
      where: {
        id: committeeId,
        departmentId: authority.departmentId,
        archivedAt: null,
        examination: { archivedAt: null },
      },
      include: { assignments: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    });
    if (!committee) throw new NotFoundException("Committee not found");
    return committee;
  }

  async getCommitteeByExamination(examinationId: string) {
    const authority = await this.authorizer.authorize(
      "summative-examination.committee",
    );
    const committee = await this.prisma.examinationCommittee.findFirst({
      where: {
        examinationId,
        departmentId: authority.departmentId,
        archivedAt: null,
        examination: {
          id: examinationId,
          departmentId: authority.departmentId,
          archivedAt: null,
        },
      },
      include: { assignments: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
    });
    if (!committee) throw new NotFoundException("Committee not found");
    return committee;
  }

  async getCommitteeAssignments(committeeId: string) {
    const authority = await this.authorizer.authorize(
      "summative-examination.committee",
    );
    const committee = await this.prisma.examinationCommittee.findFirst({
      where: {
        id: committeeId,
        departmentId: authority.departmentId,
        archivedAt: null,
        examination: { archivedAt: null },
      },
      select: { id: true },
    });
    if (!committee) throw new NotFoundException("Committee not found");
    return this.prisma.examinationCommitteeAssignment.findMany({
      where: { committeeId, departmentId: authority.departmentId },
      select: assignmentSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  async getOrCreateCommittee(examinationId: string) {
    const authority = await this.authorizer.authorize(
      "summative-examination.committee",
    );
    const transitionAt = new Date();
    return this.serializable(async (tx) => {
      await this.authorizer.assertCurrentAuthority(
        tx,
        authority,
        "summative-examination.committee",
        transitionAt,
      );
      await this.lockCurrentExamination(
        tx,
        authority.departmentId,
        examinationId,
      );

      const existing = await tx.examinationCommittee.findUnique({
        where: {
          departmentId_examinationId: {
            departmentId: authority.departmentId,
            examinationId,
          },
        },
        include: { assignments: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
      });
      if (existing?.archivedAt) {
        throw new ConflictException(
          "Archived Examination Committee cannot be resurrected",
        );
      }
      if (existing) return existing;

      const committee = await tx.examinationCommittee.create({
        data: { departmentId: authority.departmentId, examinationId },
        include: { assignments: true },
      });
      await this.writeAudit(
        tx,
        authority,
        SUMMATIVE_EXAMINATION_AUDIT_EVENTS.COMMITTEE_CREATED,
        "examination_committee",
        committee.id,
        { examinationId },
      );
      return committee;
    });
  }

  async assignInternalMember(
    input: AssignInternalCommitteeMemberDto & { committeeId: string },
  ) {
    if (!INTERNAL_SEATS.has(input.seat as ExaminationCommitteeSeat)) {
      throw new BadRequestException("Internal Committee seat is invalid");
    }
    const authority = await this.authorizer.authorize(
      "summative-examination.committee",
    );
    const transitionAt = new Date();
    const expiresAt = this.parseFutureExpiry(input.expiresAt, transitionAt);

    return this.createAssignment(
      authority,
      transitionAt,
      expiresAt,
      {
        committeeId: input.committeeId,
        seat: input.seat,
        assignedUserId: input.assignedUserId,
        externalMemberName: null,
        externalMemberAffiliation: null,
      },
      SUMMATIVE_EXAMINATION_AUDIT_EVENTS.INTERNAL_COMMITTEE_ASSIGNMENT_CREATED,
    );
  }

  async appointExternalMember(
    input: AppointExternalCommitteeMemberDto & { committeeId: string },
  ) {
    const externalMemberName = input.externalMemberName.trim();
    const externalMemberAffiliation = input.externalMemberAffiliation.trim();
    if (!externalMemberName || !externalMemberAffiliation) {
      throw new BadRequestException(
        "External Member name and affiliation are required",
      );
    }
    const authority = await this.authorizer.authorize(
      "summative-examination.committee",
    );
    const transitionAt = new Date();
    const expiresAt = this.parseFutureExpiry(input.expiresAt, transitionAt);

    return this.createAssignment(
      authority,
      transitionAt,
      expiresAt,
      {
        committeeId: input.committeeId,
        seat: ExaminationCommitteeSeat.EXTERNAL_MEMBER,
        assignedUserId: null,
        externalMemberName,
        externalMemberAffiliation,
      },
      SUMMATIVE_EXAMINATION_AUDIT_EVENTS.EXTERNAL_COMMITTEE_MEMBER_APPOINTED,
    );
  }

  async unassignMember(assignmentId: string) {
    const authority = await this.authorizer.authorize(
      "summative-examination.committee",
    );
    const transitionAt = new Date();
    return this.serializable(async (tx) => {
      await this.authorizer.assertCurrentAuthority(
        tx,
        authority,
        "summative-examination.committee",
        transitionAt,
      );
      const assignment = await this.lockCurrentAssignment(
        tx,
        authority.departmentId,
        assignmentId,
      );
      if (assignment.archivedAt) {
        throw new ConflictException("Archived assignment cannot be changed");
      }
      if (assignment.status !== ExaminationCommitteeAssignmentStatus.ACTIVE) {
        throw new ConflictException("Assignment is not active");
      }
      const updated = await this.transitionAssignment(
        tx,
        assignment,
        {
          status: ExaminationCommitteeAssignmentStatus.INACTIVE,
          unassignedAt: transitionAt,
        },
      );
      await this.writeAssignmentAudit(
        tx,
        authority,
        updated,
        SUMMATIVE_EXAMINATION_AUDIT_EVENTS.COMMITTEE_ASSIGNMENT_UNASSIGNED,
      );
      return updated;
    });
  }

  async reactivateMember(
    assignmentId: string,
    input: ReactivateCommitteeAssignmentDto,
  ) {
    const authority = await this.authorizer.authorize(
      "summative-examination.committee",
    );
    const transitionAt = new Date();
    const expiresAt = this.parseFutureExpiry(input.expiresAt, transitionAt);
    return this.serializable(async (tx) => {
      await this.authorizer.assertCurrentAuthority(
        tx,
        authority,
        "summative-examination.committee",
        transitionAt,
      );
      const assignment = await this.lockCurrentAssignment(
        tx,
        authority.departmentId,
        assignmentId,
      );
      if (assignment.archivedAt) {
        throw new ConflictException("Archived assignment cannot be changed");
      }
      if (
        assignment.status !== ExaminationCommitteeAssignmentStatus.INACTIVE ||
        assignment.unassignedAt === null
      ) {
        throw new ConflictException("Assignment is not eligible for reactivation");
      }
      await this.assertAssignmentShapeAndUser(tx, assignment, authority.departmentId);
      await this.retireExpiredConflicts(
        tx,
        authority,
        {
          committeeId: assignment.committeeId,
          examinationId: assignment.examinationId,
          seat: assignment.seat,
          assignedUserId: assignment.assignedUserId,
        },
        transitionAt,
      );
      const updated = await this.transitionAssignment(
        tx,
        assignment,
        {
          status: ExaminationCommitteeAssignmentStatus.ACTIVE,
          assignedAt: transitionAt,
          expiresAt,
          unassignedAt: null,
        },
      );
      await this.writeAssignmentAudit(
        tx,
        authority,
        updated,
        SUMMATIVE_EXAMINATION_AUDIT_EVENTS.COMMITTEE_ASSIGNMENT_REACTIVATED,
      );
      return updated;
    });
  }

  async archiveMember(assignmentId: string) {
    const authority = await this.authorizer.authorize(
      "summative-examination.committee",
    );
    const transitionAt = new Date();
    return this.serializable(async (tx) => {
      await this.authorizer.assertCurrentAuthority(
        tx,
        authority,
        "summative-examination.committee",
        transitionAt,
      );
      const assignment = await this.lockCurrentAssignment(
        tx,
        authority.departmentId,
        assignmentId,
      );
      if (assignment.archivedAt) return assignment;
      const unassignedAt =
        assignment.unassignedAt ??
        (assignment.assignedAt > transitionAt
          ? assignment.assignedAt
          : transitionAt);
      const updated = await this.transitionAssignment(
        tx,
        assignment,
        {
          status: ExaminationCommitteeAssignmentStatus.ARCHIVED,
          unassignedAt,
          archivedAt: transitionAt,
        },
      );
      await this.writeAssignmentAudit(
        tx,
        authority,
        updated,
        SUMMATIVE_EXAMINATION_AUDIT_EVENTS.COMMITTEE_ASSIGNMENT_ARCHIVED,
      );
      return updated;
    });
  }

  async updateMemberExpiry(assignmentId: string, expiry: string) {
    const authority = await this.authorizer.authorize(
      "summative-examination.committee",
    );
    const transitionAt = new Date();
    const expiresAt = this.parseFutureExpiry(expiry, transitionAt);
    if (!expiresAt) throw new BadRequestException("Expiry is required");
    return this.serializable(async (tx) => {
      await this.authorizer.assertCurrentAuthority(
        tx,
        authority,
        "summative-examination.committee",
        transitionAt,
      );
      const assignment = await this.lockCurrentAssignment(
        tx,
        authority.departmentId,
        assignmentId,
      );
      if (assignment.archivedAt) {
        throw new ConflictException("Archived assignment cannot be changed");
      }
      if (assignment.status !== ExaminationCommitteeAssignmentStatus.ACTIVE) {
        throw new ConflictException("Assignment is not active");
      }
      if (expiresAt <= assignment.assignedAt) {
        throw new BadRequestException("Expiry must be later than assignment time");
      }
      const updated = await this.transitionAssignment(tx, assignment, {
        expiresAt,
      });
      await this.writeAssignmentAudit(
        tx,
        authority,
        updated,
        SUMMATIVE_EXAMINATION_AUDIT_EVENTS.COMMITTEE_ASSIGNMENT_EXPIRY_UPDATED,
      );
      return updated;
    });
  }

  async isCommitteeComplete(committeeId: string) {
    const principal = this.requestContextService.get()?.principal;
    if (!principal?.isAuthenticated || !principal.activeDepartmentId) return false;
    const evaluatedAt = new Date();
    const assignments = await this.prisma.examinationCommitteeAssignment.findMany({
      where: {
        committeeId,
        departmentId: principal.activeDepartmentId,
        status: ExaminationCommitteeAssignmentStatus.ACTIVE,
        archivedAt: null,
        unassignedAt: null,
        assignedAt: { lte: evaluatedAt },
        OR: [{ expiresAt: null }, { expiresAt: { gt: evaluatedAt } }],
        committee: {
          archivedAt: null,
          examination: { archivedAt: null },
        },
      },
      select: {
        ...assignmentSelect,
        assignedUser: {
          select: {
            id: true,
            departmentId: true,
            status: true,
            archivedAt: true,
            deletedAt: true,
          },
        },
      },
    });
    const usable = assignments.filter((assignment) =>
      this.isUsableFormalAppointment(assignment, principal.activeDepartmentId!),
    );
    return [
      ExaminationCommitteeSeat.CHAIRMAN,
      ExaminationCommitteeSeat.MEMBER_1,
      ExaminationCommitteeSeat.MEMBER_2,
      ExaminationCommitteeSeat.EXTERNAL_MEMBER,
    ].every(
      (seat) => usable.filter((assignment) => assignment.seat === seat).length === 1,
    );
  }

  async hasCommitteeAuthority(committeeId: string) {
    const principal = this.requestContextService.get()?.principal;
    if (
      !principal?.isAuthenticated ||
      !principal.activeDepartmentId ||
      !principal.actorId
    ) {
      return false;
    }
    const evaluatedAt = new Date();
    const assignment = await this.prisma.examinationCommitteeAssignment.findFirst({
      where: {
        committeeId,
        departmentId: principal.activeDepartmentId,
        assignedUserId: principal.actorId,
        seat: { in: [...INTERNAL_SEATS] },
        status: ExaminationCommitteeAssignmentStatus.ACTIVE,
        assignedAt: { lte: evaluatedAt },
        OR: [{ expiresAt: null }, { expiresAt: { gt: evaluatedAt } }],
        unassignedAt: null,
        archivedAt: null,
        externalMemberName: null,
        externalMemberAffiliation: null,
        committee: {
          archivedAt: null,
          examination: { archivedAt: null },
        },
        assignedUser: {
          id: principal.actorId,
          departmentId: principal.activeDepartmentId,
          status: UserStatus.ACTIVE,
          archivedAt: null,
          deletedAt: null,
        },
      },
      select: { id: true },
    });
    return assignment !== null;
  }

  private async createAssignment(
    authority: SummativeManagementAuthority,
    transitionAt: Date,
    expiresAt: Date | null,
    input: {
      committeeId: string;
      seat: InternalCommitteeSeat | "EXTERNAL_MEMBER";
      assignedUserId: string | null;
      externalMemberName: string | null;
      externalMemberAffiliation: string | null;
    },
    auditAction: string,
  ) {
    try {
      return await this.serializable(async (tx) => {
        await this.authorizer.assertCurrentAuthority(
          tx,
          authority,
          "summative-examination.committee",
          transitionAt,
        );
        const scope = await this.lockCurrentCommittee(
          tx,
          authority.departmentId,
          input.committeeId,
        );
        if (input.assignedUserId) {
          await this.lockActiveInternalUser(
            tx,
            authority.departmentId,
            input.assignedUserId,
          );
        }
        await this.retireExpiredConflicts(
          tx,
          authority,
          {
            ...scope,
            seat: input.seat as ExaminationCommitteeSeat,
            assignedUserId: input.assignedUserId,
          },
          transitionAt,
        );

        const assignment = await tx.examinationCommitteeAssignment.create({
          data: {
            departmentId: authority.departmentId,
            examinationId: scope.examinationId,
            committeeId: scope.committeeId,
            assignedUserId: input.assignedUserId,
            assignedByUserId: authority.actorUserId,
            externalMemberName: input.externalMemberName,
            externalMemberAffiliation: input.externalMemberAffiliation,
            seat: input.seat,
            status: ExaminationCommitteeAssignmentStatus.ACTIVE,
            assignedAt: transitionAt,
            expiresAt,
          },
          select: assignmentSelect,
        });
        await this.writeAssignmentAudit(tx, authority, assignment, auditAction);
        return assignment;
      });
    } catch (error) {
      if (this.isActiveAssignmentUniquenessConflict(error)) {
        throw new ConflictException("Committee seat or internal user is occupied");
      }
      throw error;
    }
  }

  private async retireExpiredConflicts(
    tx: Prisma.TransactionClient,
    authority: SummativeManagementAuthority,
    input: LockedCommitteeScope & {
      seat: ExaminationCommitteeSeat;
      assignedUserId: string | null;
    },
    transitionAt: Date,
  ) {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "examination_committee_assignments"
        WHERE "department_id" = ${authority.departmentId}
          AND "examination_id" = ${input.examinationId}
          AND "committee_id" = ${input.committeeId}
          AND "status" = ${ExaminationCommitteeAssignmentStatus.ACTIVE}::"ExaminationCommitteeAssignmentStatus"
          AND (
            "seat" = ${input.seat}::"ExaminationCommitteeSeat"
            OR (
              ${input.assignedUserId}::text IS NOT NULL
              AND "assigned_user_id" = ${input.assignedUserId}
            )
          )
        ORDER BY "id"
        FOR UPDATE
      `);
    const conflicts = await tx.examinationCommitteeAssignment.findMany({
      where: {
        departmentId: authority.departmentId,
        examinationId: input.examinationId,
        committeeId: input.committeeId,
        status: ExaminationCommitteeAssignmentStatus.ACTIVE,
        OR: [
          { seat: input.seat },
          ...(input.assignedUserId
            ? [{ assignedUserId: input.assignedUserId }]
            : []),
        ],
      },
      select: assignmentSelect,
      orderBy: { id: "asc" },
    });
    for (const conflict of conflicts) {
      if (!conflict.expiresAt || conflict.expiresAt > transitionAt) {
        throw new ConflictException(
          conflict.seat === input.seat
            ? "Committee seat is currently occupied"
            : "Internal user already occupies a Committee seat",
        );
      }
      const retired = await this.transitionAssignment(
        tx,
        conflict,
        {
          status: ExaminationCommitteeAssignmentStatus.INACTIVE,
          unassignedAt: transitionAt,
        },
      );
      await this.writeAssignmentAudit(
        tx,
        authority,
        retired,
        SUMMATIVE_EXAMINATION_AUDIT_EVENTS.COMMITTEE_ASSIGNMENT_EXPIRED_AUTO_RETIRED,
        { replacementSeat: input.seat },
      );
    }
  }

  private async lockCurrentExamination(
    tx: Prisma.TransactionClient,
    departmentId: string,
    examinationId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "examinations"
      WHERE "id" = ${examinationId}
        AND "department_id" = ${departmentId}
        AND "archived_at" IS NULL
      FOR UPDATE
    `);
    if (rows.length !== 1) throw new NotFoundException("Examination not found");
  }

  private async lockCurrentCommittee(
    tx: Prisma.TransactionClient,
    departmentId: string,
    committeeId: string,
  ): Promise<LockedCommitteeScope> {
    const base = await tx.examinationCommittee.findFirst({
      where: { id: committeeId, departmentId },
      select: { id: true, examinationId: true },
    });
    if (!base) throw new NotFoundException("Committee not found");
    await this.lockCurrentExamination(tx, departmentId, base.examinationId);
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "examination_committees"
      WHERE "id" = ${committeeId}
        AND "department_id" = ${departmentId}
        AND "examination_id" = ${base.examinationId}
        AND "archived_at" IS NULL
      FOR UPDATE
    `);
    if (rows.length !== 1) throw new NotFoundException("Committee not found");
    return { committeeId, examinationId: base.examinationId };
  }

  private async lockCurrentAssignment(
    tx: Prisma.TransactionClient,
    departmentId: string,
    assignmentId: string,
  ): Promise<AssignmentRecord> {
    const base = await tx.examinationCommitteeAssignment.findFirst({
      where: { id: assignmentId, departmentId },
      select: { committeeId: true, examinationId: true },
    });
    if (!base) throw new NotFoundException("Committee assignment not found");
    const scope = await this.lockCurrentCommittee(
      tx,
      departmentId,
      base.committeeId,
    );
    if (scope.examinationId !== base.examinationId) {
      throw new NotFoundException("Committee assignment not found");
    }
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "examination_committee_assignments"
      WHERE "id" = ${assignmentId}
        AND "department_id" = ${departmentId}
        AND "committee_id" = ${base.committeeId}
        AND "examination_id" = ${base.examinationId}
      FOR UPDATE
    `);
    if (rows.length !== 1) {
      throw new NotFoundException("Committee assignment not found");
    }
    const assignment = await tx.examinationCommitteeAssignment.findFirst({
      where: { id: assignmentId, departmentId },
      select: assignmentSelect,
    });
    if (!assignment) throw new NotFoundException("Committee assignment not found");
    return assignment;
  }

  private async lockActiveInternalUser(
    tx: Prisma.TransactionClient,
    departmentId: string,
    userId: string,
  ) {
    const users = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "users"
      WHERE "id" = ${userId}
        AND "department_id" = ${departmentId}
        AND "status" = ${UserStatus.ACTIVE}::"UserStatus"
        AND "archived_at" IS NULL
        AND "deleted_at" IS NULL
      FOR UPDATE
    `);
    if (users.length !== 1) {
      throw new NotFoundException("Internal Committee user not found");
    }
  }

  private async assertAssignmentShapeAndUser(
    tx: Prisma.TransactionClient,
    assignment: AssignmentRecord,
    departmentId: string,
  ) {
    if (assignment.seat === ExaminationCommitteeSeat.EXTERNAL_MEMBER) {
      if (
        assignment.assignedUserId !== null ||
        !assignment.externalMemberName?.trim() ||
        !assignment.externalMemberAffiliation?.trim()
      ) {
        throw new ConflictException("External Member appointment is malformed");
      }
      return;
    }
    if (
      !INTERNAL_SEATS.has(assignment.seat) ||
      !assignment.assignedUserId ||
      assignment.externalMemberName !== null ||
      assignment.externalMemberAffiliation !== null
    ) {
      throw new ConflictException("Internal Committee assignment is malformed");
    }
    await this.lockActiveInternalUser(tx, departmentId, assignment.assignedUserId);
  }

  private async transitionAssignment(
    tx: Prisma.TransactionClient,
    existing: AssignmentRecord,
    data: Prisma.ExaminationCommitteeAssignmentUpdateManyMutationInput,
  ) {
    const mutation = await tx.examinationCommitteeAssignment.updateMany({
      where: {
        id: existing.id,
        departmentId: existing.departmentId,
        committeeId: existing.committeeId,
        examinationId: existing.examinationId,
        status: existing.status,
        assignedAt: existing.assignedAt,
        expiresAt: existing.expiresAt,
        unassignedAt: existing.unassignedAt,
        archivedAt: existing.archivedAt,
      },
      data,
    });
    if (mutation.count !== 1) {
      throw new ConflictException("Concurrent Committee assignment change conflicted");
    }
    const updated = await tx.examinationCommitteeAssignment.findFirst({
      where: { id: existing.id, departmentId: existing.departmentId },
      select: assignmentSelect,
    });
    if (!updated) {
      throw new ConflictException("Concurrent Committee assignment change conflicted");
    }
    return updated;
  }

  private isUsableFormalAppointment(
    assignment: AssignmentRecord & {
      assignedUser: {
        id: string;
        departmentId: string;
        status: UserStatus;
        archivedAt: Date | null;
        deletedAt: Date | null;
      } | null;
    },
    departmentId: string,
  ) {
    if (assignment.seat === ExaminationCommitteeSeat.EXTERNAL_MEMBER) {
      return Boolean(
        assignment.assignedUserId === null &&
          assignment.externalMemberName?.trim() &&
          assignment.externalMemberAffiliation?.trim(),
      );
    }
    return Boolean(
      INTERNAL_SEATS.has(assignment.seat) &&
        assignment.assignedUserId &&
        assignment.externalMemberName === null &&
        assignment.externalMemberAffiliation === null &&
        assignment.assignedUser?.id === assignment.assignedUserId &&
        assignment.assignedUser.departmentId === departmentId &&
        assignment.assignedUser.status === UserStatus.ACTIVE &&
        assignment.assignedUser.archivedAt === null &&
        assignment.assignedUser.deletedAt === null,
    );
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
    await this.writeAudit(
      tx,
      authority,
      action,
      "examination_committee_assignment",
      assignment.id,
      {
        examinationId: assignment.examinationId,
        committeeId: assignment.committeeId,
        seat: assignment.seat,
        assignedUserId: assignment.assignedUserId,
        status: assignment.status,
        expiresAt: assignment.expiresAt?.toISOString() ?? null,
        ...extraContext,
      },
    );
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    authority: SummativeManagementAuthority,
    action: string,
    targetType: string,
    targetId: string,
    contextJson: Prisma.InputJsonObject,
  ) {
    const requestContext = this.requestContextService.get();
    await tx.auditLog.create({
      data: {
        requestId: requestContext?.requestId,
        actorUserId: authority.actorUserId,
        actorType: "USER",
        departmentId: authority.departmentId,
        action,
        targetType,
        targetId,
        outcome: "SUCCESS",
        ipAddress: requestContext?.audit.ipAddress,
        userAgent: requestContext?.audit.userAgent,
        contextJson,
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
      target === "exam_committee_assignment_active_seat_uq" ||
      target === "exam_committee_assignment_active_user_uq"
    );
  }

  private isRetryableSerializableConflict(error: unknown) {
    if (!(error instanceof PrismaClientKnownRequestError)) return false;
    return (
      error.code === "P2034" ||
      (error.code === "P2010" && error.meta?.code === "40001")
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
        if (attempt >= 2 || !this.isRetryableSerializableConflict(error)) {
          throw error;
        }
      }
    }
  }
}
