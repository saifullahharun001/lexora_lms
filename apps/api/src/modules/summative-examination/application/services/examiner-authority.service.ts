import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  DepartmentStatus,
  ExaminationCourseExaminerAssignmentStatus,
  ExaminationCourseExaminerSeat,
  PermissionScope,
  Prisma,
  UserStatus,
} from "@prisma/client";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import {
  isPermissionGrantFromLoadedRole,
  isRoleAssignmentInActiveDepartment,
} from "@/common/authorization/principal-authority";
import { PERMISSIONS } from "@/modules/identity-access/authorization/permissions.constants";
import { PLATFORM_ROLES } from "@/modules/identity-access/authorization/roles.constants";

export interface ExaminerMarkingAuthority {
  departmentId: string;
  actorUserId: string;
  userRoleId: string;
  roleId: string;
  examinerAssignmentId: string;
  examinationId: string;
  examinationCourseId: string;
  seat: ExaminationCourseExaminerSeat;
}

const MARKS_RESOURCE = "summative-examination.examiner-marks";
const MARKS_ACTION = "enter";
const ACCESS_DENIED = "Examiner marking access denied";

@Injectable()
export class ExaminerAuthorityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
  ) {}

  hasFirstExaminerAuthority(examinationCourseId: string) {
    return this.hasAuthority(
      examinationCourseId,
      ExaminationCourseExaminerSeat.FIRST_EXAMINER,
    );
  }

  hasSecondExaminerAuthority(examinationCourseId: string) {
    return this.hasAuthority(
      examinationCourseId,
      ExaminationCourseExaminerSeat.SECOND_EXAMINER,
    );
  }

  async hasAuthority(
    examinationCourseId: string,
    seat: ExaminationCourseExaminerSeat,
  ): Promise<boolean> {
    const principal = this.requestContextService.get()?.principal;
    if (
      !principal?.isAuthenticated ||
      principal.actorType !== "user" ||
      !principal.actorId ||
      !principal.activeDepartmentId
    ) {
      return false;
    }

    const teacherRoleAssignment = principal.roleAssignments.find(
      (assignment) =>
        assignment.role === PLATFORM_ROLES.TEACHER &&
        isRoleAssignmentInActiveDepartment(
          principal.activeDepartmentId,
          assignment,
        ),
    );
    if (!teacherRoleAssignment) return false;

    if (
      seat !== ExaminationCourseExaminerSeat.FIRST_EXAMINER &&
      seat !== ExaminationCourseExaminerSeat.SECOND_EXAMINER
    ) {
      return false;
    }

    const evaluatedAt = new Date();
    const assignment =
      await this.prisma.examinationCourseExaminerAssignment.findFirst({
        where: {
          departmentId: principal.activeDepartmentId,
          examinationCourseId,
          assignedUserId: principal.actorId,
          seat,
          status: ExaminationCourseExaminerAssignmentStatus.ACTIVE,
          assignedAt: { lte: evaluatedAt },
          OR: [{ expiresAt: null }, { expiresAt: { gt: evaluatedAt } }],
          unassignedAt: null,
          archivedAt: null,
          department: {
            is: {
              id: principal.activeDepartmentId,
              status: DepartmentStatus.ACTIVE,
              archivedAt: null,
              deletedAt: null,
            },
          },
          examinationCourse: {
            is: {
              id: examinationCourseId,
              departmentId: principal.activeDepartmentId,
              archivedAt: null,
              examination: {
                is: {
                  departmentId: principal.activeDepartmentId,
                  archivedAt: null,
                },
              },
            },
          },
          assignedUser: {
            is: {
              id: principal.actorId,
              departmentId: principal.activeDepartmentId,
              status: UserStatus.ACTIVE,
              archivedAt: null,
              deletedAt: null,
              userRoles: {
                some: {
                  id: teacherRoleAssignment.userRoleId,
                  roleId: teacherRoleAssignment.roleId,
                  departmentId: principal.activeDepartmentId,
                  revokedAt: null,
                  OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: evaluatedAt } },
                  ],
                  role: {
                    id: teacherRoleAssignment.roleId,
                    departmentId: principal.activeDepartmentId,
                    code: PLATFORM_ROLES.TEACHER,
                    archivedAt: null,
                  },
                },
              },
            },
          },
        },
        select: { id: true },
      });

    return assignment !== null;
  }

  async authorizeMarking(
    examinationCourseId: string,
  ): Promise<ExaminerMarkingAuthority> {
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
      (permission) =>
        permission.resource === MARKS_RESOURCE &&
        permission.action === MARKS_ACTION &&
        permission.scope === "department" &&
        isPermissionGrantFromLoadedRole(principal, permission),
    );
    const teacherRoleAssignment = principal.roleAssignments.find(
      (assignment) =>
        assignment.role === PLATFORM_ROLES.TEACHER &&
        assignment.departmentId === departmentId &&
        assignment.userRoleId === grant?.source.userRoleId &&
        assignment.roleId === grant?.source.roleId &&
        isRoleAssignmentInActiveDepartment(departmentId, assignment),
    );
    if (!grant || !teacherRoleAssignment) {
      throw new ForbiddenException(ACCESS_DENIED);
    }

    const evaluatedAt = new Date();
    const assignment =
      await this.prisma.examinationCourseExaminerAssignment.findFirst({
        where: {
          departmentId,
          examinationCourseId,
          assignedUserId: actorUserId,
          seat: {
            in: [
              ExaminationCourseExaminerSeat.FIRST_EXAMINER,
              ExaminationCourseExaminerSeat.SECOND_EXAMINER,
            ],
          },
          status: ExaminationCourseExaminerAssignmentStatus.ACTIVE,
          assignedAt: { lte: evaluatedAt },
          OR: [{ expiresAt: null }, { expiresAt: { gt: evaluatedAt } }],
          unassignedAt: null,
          archivedAt: null,
          department: {
            is: {
              id: departmentId,
              status: DepartmentStatus.ACTIVE,
              archivedAt: null,
              deletedAt: null,
            },
          },
          examination: { is: { departmentId, archivedAt: null } },
          examinationCourse: {
            is: {
              id: examinationCourseId,
              departmentId,
              archivedAt: null,
              examination: { is: { departmentId, archivedAt: null } },
            },
          },
          assignedUser: {
            is: {
              id: actorUserId,
              departmentId,
              status: UserStatus.ACTIVE,
              archivedAt: null,
              deletedAt: null,
              userRoles: {
                some: {
                  id: teacherRoleAssignment.userRoleId,
                  roleId: teacherRoleAssignment.roleId,
                  departmentId,
                  revokedAt: null,
                  OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: evaluatedAt } },
                  ],
                  role: {
                    id: teacherRoleAssignment.roleId,
                    departmentId,
                    code: PLATFORM_ROLES.TEACHER,
                    archivedAt: null,
                    rolePermissions: {
                      some: {
                        permission: {
                          is: {
                            code: PERMISSIONS.SUMMATIVE_EXAMINATION
                              .EXAMINER_MARKS_ENTER_DEPARTMENT,
                            resource: MARKS_RESOURCE,
                            action: MARKS_ACTION,
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
        },
        select: {
          id: true,
          examinationId: true,
          examinationCourseId: true,
          seat: true,
        },
      });
    if (!assignment) throw new ForbiddenException(ACCESS_DENIED);

    return {
      departmentId,
      actorUserId,
      userRoleId: teacherRoleAssignment.userRoleId,
      roleId: teacherRoleAssignment.roleId,
      examinerAssignmentId: assignment.id,
      examinationId: assignment.examinationId,
      examinationCourseId: assignment.examinationCourseId,
      seat: assignment.seat,
    };
  }

  /**
   * Call only after the governing Examination and ExaminationCourse rows are
   * locked. This preserves the established Summative parent-first lock order
   * while revalidating live UserRole, permission and assignment authority in
   * the same transaction as a protected marks mutation.
   */
  async assertCurrentMarkingAuthority(
    tx: Prisma.TransactionClient,
    authority: ExaminerMarkingAuthority,
    evaluatedAt: Date,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT a."id"
      FROM "examination_course_examiner_assignments" a
      JOIN "users" u
        ON u."id" = a."assigned_user_id"
       AND u."department_id" = a."department_id"
      JOIN "departments" d ON d."id" = a."department_id"
      JOIN "user_roles" ur
        ON ur."user_id" = u."id"
       AND ur."department_id" = u."department_id"
      JOIN "roles" r
        ON r."id" = ur."role_id"
       AND r."department_id" = ur."department_id"
      JOIN "role_permissions" rp ON rp."role_id" = r."id"
      JOIN "permissions" p ON p."id" = rp."permission_id"
      WHERE a."id" = ${authority.examinerAssignmentId}
        AND a."department_id" = ${authority.departmentId}
        AND a."examination_id" = ${authority.examinationId}
        AND a."examination_course_id" = ${authority.examinationCourseId}
        AND a."assigned_user_id" = ${authority.actorUserId}
        AND a."seat" = ${authority.seat}::"ExaminationCourseExaminerSeat"
        AND a."seat" IN ('FIRST_EXAMINER', 'SECOND_EXAMINER')
        AND a."status" = ${ExaminationCourseExaminerAssignmentStatus.ACTIVE}::"ExaminationCourseExaminerAssignmentStatus"
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
        AND p."code" = ${PERMISSIONS.SUMMATIVE_EXAMINATION.EXAMINER_MARKS_ENTER_DEPARTMENT}
        AND p."resource" = ${MARKS_RESOURCE}
        AND p."action" = ${MARKS_ACTION}
        AND p."scope" = ${PermissionScope.DEPARTMENT}::"PermissionScope"
      FOR UPDATE OF ur, a FOR SHARE OF u, d, r, rp, p
    `);
    if (rows.length !== 1) throw new ForbiddenException(ACCESS_DENIED);
  }
}
