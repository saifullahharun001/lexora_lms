import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  DepartmentStatus,
  ExaminationCommitteeAssignmentStatus,
  ExaminationCommitteeSeat,
  PermissionScope,
  Prisma,
  UserStatus,
} from "@prisma/client";

import { isPermissionGrantFromLoadedRole } from "@/common/authorization/principal-authority";
import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import { PERMISSIONS } from "@/modules/identity-access/authorization/permissions.constants";
import { PLATFORM_ROLES } from "@/modules/identity-access/authorization/roles.constants";

export type SummativeCommitteeWorkflowDuty =
  | "MEMBER_REVIEW"
  | "CHAIRMAN_APPROVAL";

export interface SummativeCommitteeWorkflowAuthority {
  departmentId: string;
  actorUserId: string;
  userRoleId: string;
  roleId: string;
  duty: SummativeCommitteeWorkflowDuty;
  calculatedMarkId: string;
  examinationId: string;
  examinationCourseId: string;
  candidateId: string;
  committeeId: string;
  committeeAssignmentId: string;
  seat: ExaminationCommitteeSeat;
  assignmentAssignedAt: Date;
}

const DUTY_PERMISSION = {
  MEMBER_REVIEW: {
    code: PERMISSIONS.SUMMATIVE_EXAMINATION.MEMBER_REVIEW_DEPARTMENT,
    resource: "summative-examination.member-review",
    action: "review",
    seats: [
      ExaminationCommitteeSeat.MEMBER_1,
      ExaminationCommitteeSeat.MEMBER_2,
    ],
  },
  CHAIRMAN_APPROVAL: {
    code: PERMISSIONS.SUMMATIVE_EXAMINATION.CHAIRMAN_APPROVAL_DEPARTMENT,
    resource: "summative-examination.chairman-approval",
    action: "approve",
    seats: [ExaminationCommitteeSeat.CHAIRMAN],
  },
} as const;

const ACCESS_DENIED = "Summative Committee workflow access denied";

@Injectable()
export class SummativeCommitteeWorkflowAuthorizerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
  ) {}

  authorizeMemberReview(calculatedMarkId: string) {
    return this.authorize("MEMBER_REVIEW", calculatedMarkId);
  }

  authorizeChairmanApproval(calculatedMarkId: string) {
    return this.authorize("CHAIRMAN_APPROVAL", calculatedMarkId);
  }

  async assertCurrentAuthority(
    tx: Prisma.TransactionClient,
    authority: SummativeCommitteeWorkflowAuthority,
    evaluatedAt: Date,
  ) {
    const permission = DUTY_PERMISSION[authority.duty];
    const allowedSeats: readonly ExaminationCommitteeSeat[] = permission.seats;
    if (!allowedSeats.includes(authority.seat)) {
      throw new ForbiddenException(ACCESS_DENIED);
    }
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT a."id"
      FROM "summative_calculated_marks" cm
      JOIN "examination_committees" c
        ON c."department_id" = cm."department_id"
       AND c."examination_id" = cm."examination_id"
      JOIN "examination_committee_assignments" a
        ON a."committee_id" = c."id"
       AND a."department_id" = c."department_id"
       AND a."examination_id" = c."examination_id"
      JOIN "users" u
        ON u."id" = a."assigned_user_id"
       AND u."department_id" = a."department_id"
      JOIN "departments" d ON d."id" = u."department_id"
      JOIN "user_roles" ur
        ON ur."user_id" = u."id"
       AND ur."department_id" = u."department_id"
      JOIN "roles" r
        ON r."id" = ur."role_id"
       AND r."department_id" = ur."department_id"
      JOIN "role_permissions" rp ON rp."role_id" = r."id"
      JOIN "permissions" p ON p."id" = rp."permission_id"
      WHERE cm."id" = ${authority.calculatedMarkId}
        AND cm."department_id" = ${authority.departmentId}
        AND cm."examination_id" = ${authority.examinationId}
        AND cm."examination_course_id" = ${authority.examinationCourseId}
        AND cm."candidate_id" = ${authority.candidateId}
        AND c."id" = ${authority.committeeId}
        AND c."archived_at" IS NULL
        AND a."id" = ${authority.committeeAssignmentId}
        AND a."assigned_user_id" = ${authority.actorUserId}
        AND a."seat" = ${authority.seat}::"ExaminationCommitteeSeat"
        AND a."assigned_at" = ${authority.assignmentAssignedAt}
        AND a."status" = ${ExaminationCommitteeAssignmentStatus.ACTIVE}::"ExaminationCommitteeAssignmentStatus"
        AND a."assigned_at" <= ${evaluatedAt}
        AND (a."expires_at" IS NULL OR a."expires_at" > ${evaluatedAt})
        AND a."unassigned_at" IS NULL
        AND a."archived_at" IS NULL
        AND u."id" = ${authority.actorUserId}
        AND u."status" = ${UserStatus.ACTIVE}::"UserStatus"
        AND u."archived_at" IS NULL
        AND u."deleted_at" IS NULL
        AND d."status" = ${DepartmentStatus.ACTIVE}::"DepartmentStatus"
        AND d."archived_at" IS NULL
        AND d."deleted_at" IS NULL
        AND ur."id" = ${authority.userRoleId}
        AND ur."role_id" = ${authority.roleId}
        AND ur."revoked_at" IS NULL
        AND (ur."expires_at" IS NULL OR ur."expires_at" > ${evaluatedAt})
        AND r."id" = ${authority.roleId}
        AND r."code" = ${PLATFORM_ROLES.TEACHER}
        AND r."archived_at" IS NULL
        AND p."code" = ${permission.code}
        AND p."resource" = ${permission.resource}
        AND p."action" = ${permission.action}
        AND p."scope" = ${PermissionScope.DEPARTMENT}::"PermissionScope"
      FOR UPDATE OF ur, a FOR SHARE OF cm, c, u, d, r, rp, p
    `);
    if (rows.length !== 1) throw new ForbiddenException(ACCESS_DENIED);
  }

  private async authorize(
    duty: SummativeCommitteeWorkflowDuty,
    calculatedMarkId: string,
  ): Promise<SummativeCommitteeWorkflowAuthority> {
    const principal = this.requestContextService.get()?.principal;
    const departmentId = principal?.activeDepartmentId;
    const actorUserId = principal?.actorId;
    if (
      !principal?.isAuthenticated ||
      principal.actorType !== "user" ||
      !departmentId ||
      !actorUserId
    ) {
      throw new ForbiddenException(ACCESS_DENIED);
    }
    const permission = DUTY_PERMISSION[duty];
    const grant = principal.permissions.find(
      (candidate) =>
        candidate.resource === permission.resource &&
        candidate.action === permission.action &&
        candidate.scope === "department" &&
        isPermissionGrantFromLoadedRole(principal, candidate),
    );
    const teacherRole = principal.roleAssignments.find(
      (assignment) =>
        assignment.role === PLATFORM_ROLES.TEACHER &&
        assignment.departmentId === departmentId &&
        assignment.userRoleId === grant?.source.userRoleId &&
        assignment.roleId === grant?.source.roleId,
    );
    if (!grant || !teacherRole) throw new ForbiddenException(ACCESS_DENIED);

    const evaluatedAt = new Date();
    const calculatedMark = await this.prisma.summativeCalculatedMark.findFirst({
      where: {
        id: calculatedMarkId,
        departmentId,
        department: {
          is: {
            status: DepartmentStatus.ACTIVE,
            archivedAt: null,
            deletedAt: null,
          },
        },
        examination: { is: { archivedAt: null } },
        examinationCourse: { is: { archivedAt: null } },
      },
      select: {
        id: true,
        examinationId: true,
        examinationCourseId: true,
        candidateId: true,
        examination: {
          select: {
            committees: {
              where: { archivedAt: null },
              select: {
                id: true,
                assignments: {
                  where: {
                    assignedUserId: actorUserId,
                    seat: { in: [...permission.seats] },
                    status: ExaminationCommitteeAssignmentStatus.ACTIVE,
                    assignedAt: { lte: evaluatedAt },
                    OR: [
                      { expiresAt: null },
                      { expiresAt: { gt: evaluatedAt } },
                    ],
                    unassignedAt: null,
                    archivedAt: null,
                    externalMemberName: null,
                    externalMemberAffiliation: null,
                    assignedUser: {
                      id: actorUserId,
                      departmentId,
                      status: UserStatus.ACTIVE,
                      archivedAt: null,
                      deletedAt: null,
                      userRoles: {
                        some: {
                          id: teacherRole.userRoleId,
                          roleId: teacherRole.roleId,
                          departmentId,
                          revokedAt: null,
                          OR: [
                            { expiresAt: null },
                            { expiresAt: { gt: evaluatedAt } },
                          ],
                          role: {
                            id: teacherRole.roleId,
                            departmentId,
                            code: PLATFORM_ROLES.TEACHER,
                            archivedAt: null,
                            rolePermissions: {
                              some: {
                                permission: {
                                  is: {
                                    code: permission.code,
                                    resource: permission.resource,
                                    action: permission.action,
                                    scope: PermissionScope.DEPARTMENT,
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                  select: { id: true, seat: true, assignedAt: true },
                  take: 2,
                },
              },
              take: 2,
            },
          },
        },
      },
    });
    if (!calculatedMark) {
      throw new NotFoundException("Summative calculated mark not found");
    }
    const committees = calculatedMark.examination.committees;
    if (committees.length !== 1 || committees[0]!.assignments.length !== 1) {
      throw new ForbiddenException(ACCESS_DENIED);
    }
    const committee = committees[0]!;
    const assignment = committee.assignments[0]!;
    const allowedSeats: readonly ExaminationCommitteeSeat[] = permission.seats;
    if (!allowedSeats.includes(assignment.seat)) {
      throw new ForbiddenException(ACCESS_DENIED);
    }
    return {
      departmentId,
      actorUserId,
      userRoleId: teacherRole.userRoleId,
      roleId: teacherRole.roleId,
      duty,
      calculatedMarkId: calculatedMark.id,
      examinationId: calculatedMark.examinationId,
      examinationCourseId: calculatedMark.examinationCourseId,
      candidateId: calculatedMark.candidateId,
      committeeId: committee.id,
      committeeAssignmentId: assignment.id,
      seat: assignment.seat,
      assignmentAssignedAt: assignment.assignedAt,
    };
  }
}
