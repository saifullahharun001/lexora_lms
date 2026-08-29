import { Injectable } from "@nestjs/common";
import {
  DepartmentStatus,
  ExaminationCourseExaminerAssignmentStatus,
  ExaminationCourseExaminerSeat,
  UserStatus,
} from "@prisma/client";

import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import { isRoleAssignmentInActiveDepartment } from "@/common/authorization/principal-authority";
import { PLATFORM_ROLES } from "@/modules/identity-access/authorization/roles.constants";

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
}
