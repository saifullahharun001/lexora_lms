import { Injectable } from "@nestjs/common";
import { DepartmentStatus, UserStatus } from "@prisma/client";

import type { PermissionGrant, PlatformRole, PrincipalContext } from "@lexora/types";

import { PrismaService } from "@/common/prisma/prisma.service";

@Injectable()
export class PrincipalLoaderService {
  constructor(private readonly prisma: PrismaService) {}

  async loadPrincipal(userId: string): Promise<PrincipalContext | null> {
    const now = new Date();
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        status: UserStatus.ACTIVE,
        archivedAt: null,
        deletedAt: null,
        department: {
          is: {
            status: DepartmentStatus.ACTIVE,
            archivedAt: null,
            deletedAt: null
          }
        }
      },
      include: {
        department: true,
        userRoles: {
          where: {
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            role: {
              is: {
                archivedAt: null
              }
            }
          },
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.archivedAt !== null ||
      user.deletedAt !== null ||
      user.department.id !== user.departmentId ||
      user.department.status !== DepartmentStatus.ACTIVE ||
      user.department.archivedAt !== null ||
      user.department.deletedAt !== null
    ) {
      return null;
    }

    const validUserRoles = user.userRoles.filter(
      (userRole) =>
        userRole.userId === user.id &&
        userRole.departmentId === user.departmentId &&
        userRole.roleId === userRole.role.id &&
        userRole.role.departmentId === user.departmentId &&
        userRole.revokedAt === null &&
        (userRole.expiresAt === null || userRole.expiresAt > now) &&
        userRole.role.archivedAt === null
    );

    const permissions = validUserRoles.flatMap((userRole) =>
      userRole.role.rolePermissions.map(
        (rolePermission): PermissionGrant => ({
          resource: rolePermission.permission.resource,
          action: rolePermission.permission.action,
          scope: rolePermission.permission.scope.toLowerCase() as PermissionGrant["scope"],
          source: {
            departmentId: userRole.departmentId,
            userRoleId: userRole.id,
            roleId: userRole.role.id
          }
        })
      )
    );

    return {
      actorId: user.id,
      actorType: "user",
      isAuthenticated: true,
      activeDepartmentId: user.departmentId,
      roleAssignments: validUserRoles.map((userRole) => ({
        userRoleId: userRole.id,
        roleId: userRole.role.id,
        departmentId: userRole.departmentId,
        role: userRole.role.code as PlatformRole
      })),
      permissions
    };
  }
}
