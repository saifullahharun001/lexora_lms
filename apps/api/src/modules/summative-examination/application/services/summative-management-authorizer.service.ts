import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  DepartmentStatus,
  PermissionScope,
  Prisma,
  UserStatus,
} from "@prisma/client";

import { isPermissionGrantFromLoadedRole } from "@/common/authorization/principal-authority";
import { PrismaService } from "@/common/prisma/prisma.service";
import { RequestContextService } from "@/common/request-context/request-context.service";
import { PERMISSIONS } from "@/modules/identity-access/authorization/permissions.constants";

export type SummativeManagementResource =
  | "summative-examination.setup"
  | "summative-examination.committee";

export interface SummativeManagementAuthority {
  departmentId: string;
  actorUserId: string;
  userRoleId: string;
  roleId: string;
}

const MANAGEMENT_PERMISSIONS = {
  "summative-examination.setup": {
    code: PERMISSIONS.SUMMATIVE_EXAMINATION.SETUP_MANAGE_DEPARTMENT,
    action: "manage",
  },
  "summative-examination.committee": {
    code: PERMISSIONS.SUMMATIVE_EXAMINATION.COMMITTEE_MANAGE_DEPARTMENT,
    action: "manage",
  },
} as const;

const ACCESS_DENIED = "Summative examination management access denied";

@Injectable()
export class SummativeManagementAuthorizerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
  ) {}

  async authorize(
    resource: SummativeManagementResource,
  ): Promise<SummativeManagementAuthority> {
    const principal = this.requestContextService.get()?.principal;
    const departmentId = principal?.activeDepartmentId;
    const actorUserId = principal?.actorId;
    if (!principal?.isAuthenticated || !departmentId || !actorUserId) {
      throw new ForbiddenException(ACCESS_DENIED);
    }

    const grant = principal.permissions.find(
      (permission) =>
        permission.resource === resource &&
        permission.action === MANAGEMENT_PERMISSIONS[resource].action &&
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
    if (!grant) throw new ForbiddenException(ACCESS_DENIED);

    const authority = {
      departmentId,
      actorUserId,
      userRoleId: grant.source.userRoleId,
      roleId: grant.source.roleId,
    };
    const actor = await this.prisma.user.findFirst({
      where: this.currentAuthorityWhere(authority, resource, new Date()),
      select: { id: true },
    });
    if (!actor) throw new ForbiddenException(ACCESS_DENIED);
    return authority;
  }

  async assertCurrentAuthority(
    tx: Prisma.TransactionClient,
    authority: SummativeManagementAuthority,
    resource: SummativeManagementResource,
    evaluatedAt: Date,
  ) {
    const permission = MANAGEMENT_PERMISSIONS[resource];
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
        AND (ur."expires_at" IS NULL OR ur."expires_at" > ${evaluatedAt})
        AND r."id" = ${authority.roleId}
        AND r."code" = 'department_admin'
        AND r."archived_at" IS NULL
        AND p."code" = ${permission.code}
        AND p."resource" = ${resource}
        AND p."action" = ${permission.action}
        AND p."scope" = ${PermissionScope.DEPARTMENT}::"PermissionScope"
      FOR SHARE OF u, d FOR UPDATE OF ur, r, rp, p
    `);
    if (rows.length !== 1) throw new ForbiddenException(ACCESS_DENIED);
  }

  private currentAuthorityWhere(
    authority: SummativeManagementAuthority,
    resource: SummativeManagementResource,
    evaluatedAt: Date,
  ): Prisma.UserWhereInput {
    return {
      id: authority.actorUserId,
      departmentId: authority.departmentId,
      status: UserStatus.ACTIVE,
      archivedAt: null,
      deletedAt: null,
      department: {
        id: authority.departmentId,
        status: DepartmentStatus.ACTIVE,
        archivedAt: null,
        deletedAt: null,
      },
      userRoles: {
        some: {
          id: authority.userRoleId,
          roleId: authority.roleId,
          departmentId: authority.departmentId,
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: evaluatedAt } }],
          role: {
            id: authority.roleId,
            departmentId: authority.departmentId,
            code: "department_admin",
            archivedAt: null,
            rolePermissions: {
              some: {
                permission: {
                  is: {
                    code: MANAGEMENT_PERMISSIONS[resource].code,
                    resource,
                    action: MANAGEMENT_PERMISSIONS[resource].action,
                    scope: PermissionScope.DEPARTMENT,
                  },
                },
              },
            },
          },
        },
      },
    };
  }
}
