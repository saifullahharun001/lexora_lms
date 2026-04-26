import { Injectable } from "@nestjs/common";

import type { PermissionGrant, PlatformRole, PrincipalContext } from "@lexora/types";

import { PrismaService } from "@/common/prisma/prisma.service";

@Injectable()
export class PrincipalLoaderService {
  constructor(private readonly prisma: PrismaService) {}

  async loadPrincipal(userId: string): Promise<PrincipalContext | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null
      },
      include: {
        userRoles: {
          where: {
            revokedAt: null
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

    if (!user) {
      return null;
    }

    const permissions = user.userRoles.flatMap((userRole) =>
      userRole.role.rolePermissions.map(
        (rolePermission): PermissionGrant => ({
          resource: rolePermission.permission.resource,
          action: rolePermission.permission.action,
          scope: rolePermission.permission.scope.toLowerCase() as PermissionGrant["scope"]
        })
      )
    );

    return {
      actorId: user.id,
      actorType: "user",
      isAuthenticated: true,
      activeDepartmentId: user.departmentId,
      roleAssignments: user.userRoles.map((userRole) => ({
        departmentId: userRole.departmentId,
        role: userRole.role.code as PlatformRole
      })),
      permissions
    };
  }
}
