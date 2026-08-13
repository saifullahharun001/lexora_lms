import assert from "node:assert/strict";
import test from "node:test";

import { DepartmentStatus, UserStatus } from "@prisma/client";

import { PrincipalLoaderService } from "./principal-loader.service";

const now = Date.now();

function permission(resource = "course-management.course") {
  return {
    permission: {
      resource,
      action: "read",
      scope: "DEPARTMENT"
    }
  };
}

function userRole(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-role-a",
    userId: "user-a",
    roleId: "role-a",
    departmentId: "department-a",
    revokedAt: null,
    expiresAt: null,
    role: {
      id: "role-a",
      departmentId: "department-a",
      code: "teacher",
      archivedAt: null,
      rolePermissions: [permission()]
    },
    ...overrides
  };
}

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-a",
    departmentId: "department-a",
    status: UserStatus.ACTIVE,
    archivedAt: null,
    deletedAt: null,
    department: {
      id: "department-a",
      status: DepartmentStatus.ACTIVE,
      archivedAt: null,
      deletedAt: null
    },
    userRoles: [userRole()],
    ...overrides
  };
}

function harness(record: ReturnType<typeof user> | null) {
  const queries: unknown[] = [];
  const service = new PrincipalLoaderService({
    user: {
      findFirst: async (query: unknown) => {
        queries.push(query);
        return record;
      }
    }
  } as never);

  return { service, queries };
}

test("PrincipalLoader query and valid authority preserve exact provenance", async () => {
  const record = user({
    userRoles: [
      userRole(),
      userRole({
        id: "user-role-b",
        roleId: "role-b",
        expiresAt: new Date(now + 60_000),
        role: {
          id: "role-b",
          departmentId: "department-a",
          code: "auditor",
          archivedAt: null,
          rolePermissions: [permission()]
        }
      })
    ]
  });
  const { service, queries } = harness(record);
  const principal = await service.loadPrincipal("user-a");

  assert.ok(principal);
  assert.deepEqual(principal.roleAssignments, [
    {
      userRoleId: "user-role-a",
      roleId: "role-a",
      departmentId: "department-a",
      role: "teacher"
    },
    {
      userRoleId: "user-role-b",
      roleId: "role-b",
      departmentId: "department-a",
      role: "auditor"
    }
  ]);
  assert.equal(principal.permissions.length, 2);
  assert.deepEqual(principal.permissions.map((grant) => grant.source), [
    {
      departmentId: "department-a",
      userRoleId: "user-role-a",
      roleId: "role-a"
    },
    {
      departmentId: "department-a",
      userRoleId: "user-role-b",
      roleId: "role-b"
    }
  ]);

  const query = queries[0] as {
    where: Record<string, unknown>;
    include: { userRoles: { where: Record<string, unknown> } };
  };
  assert.equal(query.where.status, UserStatus.ACTIVE);
  assert.equal(query.where.archivedAt, null);
  assert.equal(query.where.deletedAt, null);
  assert.deepEqual(query.where.department, {
    is: {
      status: DepartmentStatus.ACTIVE,
      archivedAt: null,
      deletedAt: null
    }
  });
  assert.equal(query.include.userRoles.where.revokedAt, null);
  assert.deepEqual(query.include.userRoles.where.role, {
    is: { archivedAt: null }
  });
  const expiry = query.include.userRoles.where.OR as Array<{
    expiresAt: null | { gt: Date };
  }>;
  assert.equal(expiry[0]!.expiresAt, null);
  assert.ok((expiry[1]!.expiresAt as { gt: Date }).gt instanceof Date);
});

test("PrincipalLoader excludes invalid role sources even if returned by Prisma", async (t) => {
  const invalidCases: Array<[string, ReturnType<typeof userRole>]> = [
    ["revoked", userRole({ revokedAt: new Date() })],
    ["expired", userRole({ expiresAt: new Date(now - 60_000) })],
    [
      "archived role",
      userRole({ role: { ...userRole().role, archivedAt: new Date() } })
    ],
    ["wrong UserRole department", userRole({ departmentId: "department-b" })],
    [
      "wrong Role department",
      userRole({ role: { ...userRole().role, departmentId: "department-b" } })
    ]
  ];

  for (const [name, invalidRole] of invalidCases) {
    await t.test(name, async () => {
      const principal = await harness(user({ userRoles: [invalidRole] })).service.loadPrincipal(
        "user-a"
      );
      assert.ok(principal);
      assert.deepEqual(principal.roleAssignments, []);
      assert.deepEqual(principal.permissions, []);
    });
  }
});

test("PrincipalLoader accepts null and future expiry", async () => {
  for (const expiresAt of [null, new Date(now + 60_000)]) {
    const principal = await harness(
      user({ userRoles: [userRole({ expiresAt })] })
    ).service.loadPrincipal("user-a");
    assert.equal(principal?.roleAssignments.length, 1);
    assert.equal(principal?.permissions.length, 1);
  }
});

test("PrincipalLoader rejects invalid users and authoritative departments", async (t) => {
  const invalidCases: Array<[string, ReturnType<typeof user>]> = [
    ["inactive user", user({ status: UserStatus.SUSPENDED })],
    ["archived user", user({ archivedAt: new Date() })],
    ["deleted user", user({ deletedAt: new Date() })],
    [
      "inactive department",
      user({ department: { ...user().department, status: DepartmentStatus.DISABLED } })
    ],
    [
      "archived department",
      user({ department: { ...user().department, archivedAt: new Date() } })
    ],
    [
      "deleted department",
      user({ department: { ...user().department, deletedAt: new Date() } })
    ]
  ];

  for (const [name, invalidUser] of invalidCases) {
    await t.test(name, async () => {
      assert.equal(
        await harness(invalidUser).service.loadPrincipal("user-a"),
        null
      );
    });
  }
});
