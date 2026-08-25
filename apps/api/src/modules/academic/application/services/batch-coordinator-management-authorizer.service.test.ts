import assert from "node:assert/strict";
import test from "node:test";

import type { PermissionGrant, PrincipalContext } from "@lexora/types";
import { ForbiddenException } from "@nestjs/common";
import { DepartmentStatus, PermissionScope, UserStatus } from "@prisma/client";

import { BatchCoordinatorManagementAuthorizerService } from "./batch-coordinator-management-authorizer.service";

const assignment = {
  userRoleId: "user-role-a",
  roleId: "role-a",
  departmentId: "department-a",
  role: "department_admin" as const,
};
const permission: PermissionGrant = {
  resource: "course-management.batch-coordinator-assignment",
  action: "manage",
  scope: "department",
  source: {
    departmentId: assignment.departmentId,
    userRoleId: assignment.userRoleId,
    roleId: assignment.roleId,
  },
};

function principal(
  overrides: Partial<PrincipalContext> = {},
): PrincipalContext {
  return {
    actorId: "admin-a",
    actorType: "user",
    isAuthenticated: true,
    activeDepartmentId: "department-a",
    roleAssignments: [assignment],
    permissions: [permission],
    ...overrides,
  };
}

function harness(currentPrincipal: PrincipalContext, actorExists = true) {
  let query: unknown;
  const prisma = {
    user: {
      findFirst: async (args: unknown) => {
        query = args;
        return actorExists ? { id: "admin-a" } : null;
      },
    },
  };
  const context = {
    get: () => ({ principal: currentPrincipal }),
  };
  return {
    service: new BatchCoordinatorManagementAuthorizerService(
      prisma as never,
      context as never,
    ),
    query: () =>
      query as {
        where: {
          status: UserStatus;
          department: { status: DepartmentStatus };
          userRoles: {
            some: {
              revokedAt: null;
              OR: unknown;
              role: {
                code: string;
                rolePermissions: {
                  some: {
                    permission: { is: { scope: PermissionScope } };
                  };
                };
              };
            };
          };
        };
      },
  };
}

test("exact loaded Department Admin permission is revalidated against active database state", async () => {
  const h = harness(principal());
  assert.deepEqual(await h.service.authorize(), {
    departmentId: "department-a",
    actorUserId: "admin-a",
    userRoleId: "user-role-a",
    roleId: "role-a",
  });
  const where = h.query().where;
  assert.equal(where.status, UserStatus.ACTIVE);
  assert.equal(where.department.status, DepartmentStatus.ACTIVE);
  assert.equal(where.userRoles.some.revokedAt, null);
  assert.ok(where.userRoles.some.OR);
  assert.equal(where.userRoles.some.role.code, "department_admin");
  assert.equal(
    where.userRoles.some.role.rolePermissions.some.permission.is.scope,
    PermissionScope.DEPARTMENT,
  );
});

test("revoked, expired, stale-role, inactive-actor, or inactive-department database state fails closed", async () => {
  for (const state of [
    "revoked role",
    "expired role",
    "archived role",
    "inactive actor",
    "archived actor",
    "deleted actor",
    "inactive department",
  ]) {
    const h = harness(principal(), false);
    await assert.rejects(h.service.authorize(), ForbiddenException, state);
  }
});

test("wrong semantics, fabricated provenance, wrong role, and wrong department fail before database access", async () => {
  const cases: PrincipalContext[] = [
    principal({ permissions: [{ ...permission, resource: "wrong.resource" }] }),
    principal({ permissions: [{ ...permission, action: "read" }] }),
    principal({ permissions: [{ ...permission, scope: "self" }] }),
    principal({
      permissions: [
        {
          ...permission,
          source: { ...permission.source, userRoleId: "fabricated" },
        },
      ],
    }),
    principal({ roleAssignments: [{ ...assignment, role: "teacher" }] }),
    principal({ activeDepartmentId: "department-b" }),
  ];
  for (const invalidPrincipal of cases) {
    const h = harness(invalidPrincipal);
    await assert.rejects(h.service.authorize(), ForbiddenException);
    assert.equal(h.query(), undefined);
  }
});
