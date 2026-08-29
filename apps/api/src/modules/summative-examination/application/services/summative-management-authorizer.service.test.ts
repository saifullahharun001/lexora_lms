import assert from "node:assert/strict";
import test from "node:test";

import type { PermissionGrant, PrincipalContext } from "@lexora/types";
import { ForbiddenException } from "@nestjs/common";
import { DepartmentStatus, PermissionScope, UserStatus } from "@prisma/client";

import {
  SummativeManagementAuthorizerService,
  type SummativeManagementResource,
} from "./summative-management-authorizer.service";

const roleAssignment = {
  userRoleId: "user-role-a",
  roleId: "role-a",
  departmentId: "department-a",
  role: "department_admin" as const,
};

function permission(resource: SummativeManagementResource): PermissionGrant {
  return {
    resource,
    action: "manage",
    scope: "department",
    source: {
      departmentId: roleAssignment.departmentId,
      userRoleId: roleAssignment.userRoleId,
      roleId: roleAssignment.roleId,
    },
  };
}

function principal(
  resource: SummativeManagementResource = "summative-examination.setup",
  overrides: Partial<PrincipalContext> = {},
): PrincipalContext {
  return {
    actorId: "admin-a",
    actorType: "user",
    isAuthenticated: true,
    activeDepartmentId: "department-a",
    roleAssignments: [roleAssignment],
    permissions: [permission(resource)],
    ...overrides,
  };
}

function harness(currentPrincipal: PrincipalContext, actorExists = true) {
  const queries: unknown[] = [];
  const rawQueries: unknown[] = [];
  const prisma = {
    $queryRaw: async (query: unknown) => {
      rawQueries.push(query);
      return actorExists ? [{ id: "admin-a" }] : [];
    },
    user: {
      findFirst: async (args: unknown) => {
        queries.push(args);
        return actorExists ? { id: "admin-a" } : null;
      },
    },
  };
  return {
    prisma,
    queries,
    rawQueries,
    service: new SummativeManagementAuthorizerService(
      prisma as never,
      { get: () => ({ principal: currentPrincipal }) } as never,
    ),
  };
}

for (const [resource, expectedCode] of [
  [
    "summative-examination.setup",
    "summative-examination.setup.manage_department",
  ],
  [
    "summative-examination.committee",
    "summative-examination.committee.manage_department",
  ],
  [
    "summative-examination.examiner-assignment",
    "summative-examination.examiner-assignment.manage_department",
  ],
] as const) {
  test(`exact ${resource} grant succeeds and live query requires exact provenance`, async () => {
    const h = harness(principal(resource));
    assert.deepEqual(await h.service.authorize(resource), {
      departmentId: "department-a",
      actorUserId: "admin-a",
      userRoleId: "user-role-a",
      roleId: "role-a",
    });
    const query = h.queries[0] as {
      where: {
        id: string;
        departmentId: string;
        status: UserStatus;
        archivedAt: null;
        deletedAt: null;
        department: {
          id: string;
          status: DepartmentStatus;
          archivedAt: null;
          deletedAt: null;
        };
        userRoles: {
          some: {
            id: string;
            roleId: string;
            departmentId: string;
            revokedAt: null;
            OR: unknown[];
            role: {
              id: string;
              departmentId: string;
              code: string;
              archivedAt: null;
              rolePermissions: {
                some: { permission: { is: Record<string, unknown> } };
              };
            };
          };
        };
      };
    };
    assert.equal(query.where.id, "admin-a");
    assert.equal(query.where.departmentId, "department-a");
    assert.equal(query.where.status, UserStatus.ACTIVE);
    assert.equal(query.where.archivedAt, null);
    assert.equal(query.where.deletedAt, null);
    assert.deepEqual(query.where.department, {
      id: "department-a",
      status: DepartmentStatus.ACTIVE,
      archivedAt: null,
      deletedAt: null,
    });
    assert.equal(query.where.userRoles.some.id, "user-role-a");
    assert.equal(query.where.userRoles.some.roleId, "role-a");
    assert.equal(query.where.userRoles.some.departmentId, "department-a");
    assert.equal(query.where.userRoles.some.revokedAt, null);
    assert.deepEqual(query.where.userRoles.some.OR[0], { expiresAt: null });
    assert.ok(query.where.userRoles.some.OR[1]);
    assert.equal(query.where.userRoles.some.role.id, "role-a");
    assert.equal(query.where.userRoles.some.role.code, "department_admin");
    assert.equal(query.where.userRoles.some.role.archivedAt, null);
    assert.deepEqual(
      query.where.userRoles.some.role.rolePermissions.some.permission.is,
      {
        code: expectedCode,
        resource,
        action: "manage",
        scope: PermissionScope.DEPARTMENT,
      },
    );
  });
}

test("missing, wildcard-only, wrong semantics, and unauthenticated principals fail before database access", async () => {
  const exact = permission("summative-examination.setup");
  const cases = [
    principal("summative-examination.setup", { permissions: [] }),
    principal("summative-examination.setup", {
      permissions: [{ ...exact, resource: "summative-examination.*" }],
    }),
    principal("summative-examination.setup", {
      permissions: [{ ...exact, resource: "summative-examination.committee" }],
    }),
    principal("summative-examination.setup", {
      permissions: [{ ...exact, action: "read" }],
    }),
    principal("summative-examination.setup", {
      permissions: [{ ...exact, scope: "self" }],
    }),
    principal("summative-examination.setup", { isAuthenticated: false }),
  ];
  for (const invalid of cases) {
    const h = harness(invalid);
    await assert.rejects(
      h.service.authorize("summative-examination.setup"),
      ForbiddenException,
    );
    assert.equal(h.queries.length, 0);
  }
});

test("Teacher, wrong department, and fabricated role provenance fail before database access", async () => {
  const exact = permission("summative-examination.setup");
  const cases = [
    principal("summative-examination.setup", {
      roleAssignments: [{ ...roleAssignment, role: "teacher" }],
    }),
    principal("summative-examination.setup", {
      roleAssignments: [{ ...roleAssignment, role: "student" }],
    }),
    principal("summative-examination.setup", {
      activeDepartmentId: "department-b",
    }),
    principal("summative-examination.setup", {
      permissions: [
        {
          ...exact,
          source: { ...exact.source, userRoleId: "wrong-user-role" },
        },
      ],
    }),
    principal("summative-examination.setup", {
      permissions: [
        { ...exact, source: { ...exact.source, roleId: "wrong-role" } },
      ],
    }),
  ];
  for (const invalid of cases) {
    const h = harness(invalid);
    await assert.rejects(
      h.service.authorize("summative-examination.setup"),
      ForbiddenException,
    );
    assert.equal(h.queries.length, 0);
  }
});

test("database authority miss denies revoked, expired, stale permission, inactive user, or inactive department state", async () => {
  const h = harness(principal(), false);
  await assert.rejects(
    h.service.authorize("summative-examination.setup"),
    ForbiddenException,
  );
  assert.equal(h.queries.length, 1);
});

test("transactional revalidation uses the same exact live-authority query", async () => {
  const h = harness(principal());
  await h.service.assertCurrentAuthority(
    h.prisma as never,
    {
      departmentId: "department-a",
      actorUserId: "admin-a",
      userRoleId: "user-role-a",
      roleId: "role-a",
    },
    "summative-examination.setup",
    new Date("2026-08-29T00:00:00.000Z"),
  );
  assert.equal(h.rawQueries.length, 1);
  const query = h.rawQueries[0] as { sql?: string; text?: string };
  const sql = query.sql ?? query.text ?? String(query);
  assert.match(sql, /JOIN "user_roles"/);
  assert.match(sql, /JOIN "role_permissions"/);
  assert.match(sql, /JOIN "permissions"/);
  assert.match(sql, /ur\."revoked_at" IS NULL/);
  assert.match(sql, /ur\."expires_at" IS NULL OR ur\."expires_at" >/);
  assert.match(sql, /r\."code" = 'department_admin'/);
  assert.match(sql, /p\."code" =/);
  assert.match(sql, /p\."resource" =/);
  assert.match(sql, /p\."action" =/);
  assert.match(sql, /p\."scope" =/);
  assert.match(sql, /FOR SHARE OF u, d FOR UPDATE OF ur, r, rp, p/);
});
