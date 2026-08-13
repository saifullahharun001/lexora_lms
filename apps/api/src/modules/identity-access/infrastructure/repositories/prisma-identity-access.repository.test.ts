import assert from "node:assert/strict";
import test from "node:test";

import { PrismaIdentityAccessRepository } from "./prisma-identity-access.repository";

const now = Date.now();

function rolePermission() {
  return {
    permission: {
      resource: "course-management.course",
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
      rolePermissions: [rolePermission()]
    },
    ...overrides
  };
}

function user(userRoles: ReturnType<typeof userRole>[]) {
  return {
    id: "user-a",
    departmentId: "department-a",
    email: "user@example.edu",
    normalizedEmail: "user@example.edu",
    passwordHash: "hash",
    displayName: "User A",
    status: "ACTIVE",
    lastLoginAt: null,
    userRoles,
    twoFactorMethods: []
  };
}

function harness(record: ReturnType<typeof user>) {
  const queries: unknown[] = [];
  const upserts: unknown[] = [];
  const repository = new PrismaIdentityAccessRepository({
    user: {
      findFirst: async (query: unknown) => {
        queries.push(query);
        return record;
      }
    },
    userRole: {
      upsert: async (query: unknown) => {
        upserts.push(query);
        return {};
      }
    }
  } as never);

  return { repository, queries, upserts };
}

test("loadAuthProfile retains valid role permission provenance and lifecycle query", async () => {
  const validRole = userRole({ expiresAt: new Date(now + 60_000) });
  const { repository, queries } = harness(user([validRole]));
  const profile = await repository.loadAuthProfile("user-a");

  assert.deepEqual(profile?.roles, ["teacher"]);
  assert.deepEqual(profile?.permissions, [
    {
      resource: "course-management.course",
      action: "read",
      scope: "department",
      source: {
        departmentId: "department-a",
        userRoleId: "user-role-a",
        roleId: "role-a"
      }
    }
  ]);

  const query = queries[0] as {
    include: { userRoles: { where: Record<string, unknown> } };
  };
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

test("loadAuthProfile excludes invalid authority rows returned by Prisma", async () => {
  const invalidRoles = [
    userRole({ id: "revoked", revokedAt: new Date() }),
    userRole({ id: "expired", expiresAt: new Date(now - 60_000) }),
    userRole({
      id: "archived",
      role: { ...userRole().role, archivedAt: new Date() }
    }),
    userRole({ id: "wrong-user-role-department", departmentId: "department-b" }),
    userRole({
      id: "wrong-role-department",
      role: { ...userRole().role, departmentId: "department-b" }
    })
  ];
  const profile = await harness(user(invalidRoles)).repository.loadAuthProfile(
    "user-a"
  );

  assert.deepEqual(profile?.roles, []);
  assert.deepEqual(profile?.permissions, []);
});

test("assignRoleToUser clears stale revocation and expiry for permanent assignment", async () => {
  const h = harness(user([]));
  await h.repository.assignRoleToUser({
    userId: "user-a",
    roleId: "role-a",
    departmentId: "department-a"
  });

  const upsert = h.upserts[0] as { update: Record<string, unknown> };
  assert.deepEqual(upsert.update, { revokedAt: null, expiresAt: null });
});
