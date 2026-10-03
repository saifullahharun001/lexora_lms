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

export interface FormativeActivitiesFinalisationAuthority {
  departmentId: string;
  actorUserId: string;
  userRoleId: string;
  roleId: string;
  examinationId: string;
  examinationCourseId: string;
  courseOfferingId: string;
  permissionId: string;
  rolePermissionId: string;
  committeeId: string;
  committeeAssignmentId: string;
  seat: ExaminationCommitteeSeat;
  assignmentAssignedAt: Date;
}

const permission = {
  code: PERMISSIONS.FORMATIVE.ACTIVITIES_FINALISE_DEPARTMENT,
  resource: "formative.activities", action: "finalise",
  seats: [ExaminationCommitteeSeat.CHAIRMAN],
} as const;

const ACCESS_DENIED = "Activities finalisation access denied";

@Injectable()
export class FormativeActivitiesFinalisationAuthorizerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
  ) {}

  async assertCurrentAuthority(
    tx: Prisma.TransactionClient,
    authority: FormativeActivitiesFinalisationAuthority,
    evaluatedAt: Date,
    lock = true,
  ) {
    const allowedSeats: readonly ExaminationCommitteeSeat[] = permission.seats;
    if (!allowedSeats.includes(authority.seat)) {
      throw new ForbiddenException(ACCESS_DENIED);
    }
    // Prisma binds Dates as timestamptz; Lexora timestamp columns store UTC wall-clock values.
    const assignedAtUtc = Prisma.sql`(${authority.assignmentAssignedAt}::timestamptz AT TIME ZONE 'UTC')`;
    const evaluatedAtUtc = Prisma.sql`(${evaluatedAt}::timestamptz AT TIME ZONE 'UTC')`;
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT a."id"
      FROM "examinations" cm
      JOIN "examination_courses" ec ON ec."examination_id" = cm."id" AND ec."department_id" = cm."department_id"
      JOIN "examination_committees" c
        ON c."department_id" = cm."department_id"
       AND c."examination_id" = cm."id"
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
      WHERE cm."id" = ${authority.examinationId}
        AND cm."department_id" = ${authority.departmentId}
        AND ec."id" = ${authority.examinationCourseId}
        AND ec."course_offering_id" = ${authority.courseOfferingId}
        AND ec."archived_at" IS NULL
        AND rp."id" = ${authority.rolePermissionId}
        AND p."id" = ${authority.permissionId}
        AND c."id" = ${authority.committeeId}
        AND cm."archived_at" IS NULL
        AND c."archived_at" IS NULL
        AND a."id" = ${authority.committeeAssignmentId}
        AND a."assigned_user_id" = ${authority.actorUserId}
        AND a."seat" = ${authority.seat}::"ExaminationCommitteeSeat"
        AND a."assigned_at" = ${assignedAtUtc}
        AND a."status" = ${ExaminationCommitteeAssignmentStatus.ACTIVE}::"ExaminationCommitteeAssignmentStatus"
        AND a."assigned_at" <= ${evaluatedAtUtc}
        AND (a."expires_at" IS NULL OR a."expires_at" > ${evaluatedAtUtc})
        AND a."unassigned_at" IS NULL
        AND a."archived_at" IS NULL
        AND a."external_member_name" IS NULL
        AND a."external_member_affiliation" IS NULL
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
        AND (ur."expires_at" IS NULL OR ur."expires_at" > ${evaluatedAtUtc})
        AND r."id" = ${authority.roleId}
        AND r."code" = ${PLATFORM_ROLES.TEACHER}
        AND r."archived_at" IS NULL
        AND p."code" = ${permission.code}
        AND p."resource" = ${permission.resource}
        AND p."action" = ${permission.action}
        AND p."scope" = ${PermissionScope.DEPARTMENT}::"PermissionScope"
      ${lock ? Prisma.sql`FOR UPDATE OF c, a, ur FOR SHARE OF cm, ec, u, d, r, rp, p` : Prisma.empty}
    `);
    if (rows.length !== 1) throw new ForbiddenException(ACCESS_DENIED);
  }

  async authorize(
    examinationCourseId: string,
  ): Promise<FormativeActivitiesFinalisationAuthority> {
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
    const grant = principal.permissions.find(
      (candidate) =>
        !!candidate.id &&
        !!candidate.rolePermissionId &&
        candidate.code === permission.code &&
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

    const course = await this.prisma.examinationCourse.findFirst({
      where: { id: examinationCourseId, departmentId, archivedAt: null, examination: { archivedAt: null } },
      select: { id: true, examinationId: true, courseOfferingId: true },
    });
    if (!course) throw new NotFoundException("Examination course not found");
    const examinationId = course.examinationId;
    const evaluatedAt = new Date();
    const examination = await this.prisma.examination.findFirst({
      where: {
        id: examinationId,
        departmentId,
        department: {
          is: {
            status: DepartmentStatus.ACTIVE,
            archivedAt: null,
            deletedAt: null,
          },
        },
        archivedAt: null,
      },
      select: {
        id: true,
        committees: {
          where: { departmentId, examinationId, archivedAt: null },
          select: {
            id: true,
            assignments: {
              where: {
                departmentId, examinationId,
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
                            id: grant.rolePermissionId,
                            permissionId: grant.id,
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
    });
    if (!examination) {
      throw new NotFoundException("Examination not found");
    }
    const committees = examination.committees;
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
      examinationId: examination.id,
      examinationCourseId: course.id, courseOfferingId: course.courseOfferingId,
      permissionId: grant.id!, rolePermissionId: grant.rolePermissionId!,
      committeeId: committee.id,
      committeeAssignmentId: assignment.id,
      seat: assignment.seat,
      assignmentAssignedAt: assignment.assignedAt,
    };
  }
}
