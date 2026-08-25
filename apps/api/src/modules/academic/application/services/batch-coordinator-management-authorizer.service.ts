import { ForbiddenException, Injectable } from "@nestjs/common";
import { DepartmentStatus, PermissionScope, UserStatus } from "@prisma/client";

import { isPermissionGrantFromLoadedRole } from "@/common/authorization/principal-authority";
import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import { PERMISSIONS } from "@/modules/identity-access/authorization/permissions.constants";

import type { BatchCoordinatorManagementAuthority } from "../ports/batch-coordinator-assignment.repository.port";

const MANAGEMENT_PERMISSION = {
  code: PERMISSIONS.COURSE_MANAGEMENT.BATCH_COORDINATOR_ASSIGNMENT_MANAGE,
  resource: "course-management.batch-coordinator-assignment",
  action: "manage",
} as const;

@Injectable()
export class BatchCoordinatorManagementAuthorizerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
  ) {}

  async authorize(): Promise<BatchCoordinatorManagementAuthority> {
    const principal = this.requestContextService.get()?.principal;
    const departmentId = principal?.activeDepartmentId;
    const actorUserId = principal?.actorId;
    if (!principal || !departmentId || !actorUserId) {
      throw new ForbiddenException(
        "Batch Coordinator assignment access denied",
      );
    }

    const grant = principal.permissions.find(
      (permission) =>
        permission.resource === MANAGEMENT_PERMISSION.resource &&
        permission.action === MANAGEMENT_PERMISSION.action &&
        permission.scope === "department" &&
        isPermissionGrantFromLoadedRole(principal, permission) &&
        principal.roleAssignments.some(
          (assignment) =>
            assignment.role === "department_admin" &&
            assignment.departmentId === departmentId &&
            assignment.userRoleId === permission.source.userRoleId &&
            assignment.roleId === permission.source.roleId,
        ),
    );
    if (!grant) {
      throw new ForbiddenException(
        "Batch Coordinator assignment access denied",
      );
    }

    const now = new Date();
    const actor = await this.prisma.user.findFirst({
      where: {
        id: actorUserId,
        departmentId,
        status: UserStatus.ACTIVE,
        archivedAt: null,
        deletedAt: null,
        department: {
          id: departmentId,
          status: DepartmentStatus.ACTIVE,
          archivedAt: null,
          deletedAt: null,
        },
        userRoles: {
          some: {
            id: grant.source.userRoleId,
            roleId: grant.source.roleId,
            departmentId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            role: {
              id: grant.source.roleId,
              departmentId,
              code: "department_admin",
              archivedAt: null,
              rolePermissions: {
                some: {
                  permission: {
                    is: {
                      code: MANAGEMENT_PERMISSION.code,
                      resource: MANAGEMENT_PERMISSION.resource,
                      action: MANAGEMENT_PERMISSION.action,
                      scope: PermissionScope.DEPARTMENT,
                    },
                  },
                },
              },
            },
          },
        },
      },
      select: { id: true },
    });
    if (!actor) {
      throw new ForbiddenException(
        "Batch Coordinator assignment access denied",
      );
    }

    return {
      departmentId,
      actorUserId,
      userRoleId: grant.source.userRoleId,
      roleId: grant.source.roleId,
    };
  }
}
