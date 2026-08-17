import assert from "node:assert/strict";
import test from "node:test";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { AcademicVersionStatus, PermissionScope } from "@prisma/client";

import type { TransitionSyllabusVersionResult } from "../ports/academic.repository.port";
import { AcademicService } from "./academic.service";

type Role = "department_admin" | "teacher" | "student";
type GrantScope = "department" | "self" | "public_verification";

interface TestPermissionGrant {
  resource: string;
  action: string;
  scope: GrantScope;
  source: { departmentId: string; userRoleId: string; roleId: string };
}

const lifecycleView = {
  id: "syllabus-a",
  code: "SYL-1",
  versionNumber: 1,
  status: AcademicVersionStatus.APPROVED,
  effectiveFrom: null,
  effectiveTo: null,
  approvedAt: new Date("2026-08-17T10:00:00.000Z"),
  archivedAt: null,
  createdAt: new Date("2026-08-14T10:00:00.000Z"),
  updatedAt: new Date("2026-08-17T10:00:00.000Z"),
  curriculumCourse: { id: "curriculum-course-a" },
};

function lifecycleGrant(
  role: Role = "department_admin",
  overrides: Partial<TestPermissionGrant> = {},
): TestPermissionGrant {
  return {
    resource: "course-management.syllabus-version.lifecycle",
    action: "manage",
    scope: "department",
    source: {
      departmentId: "department-a",
      userRoleId: `${role}-assignment-a`,
      roleId: `${role}-role-a`,
    },
    ...overrides,
  };
}

function harness(
  options: {
    role?: Role;
    permissions?: TestPermissionGrant[];
    databaseAuthorized?: boolean;
    result?: TransitionSyllabusVersionResult;
  } = {},
) {
  const role = options.role ?? "department_admin";
  const permissions =
    options.permissions ??
    (role === "department_admin" ? [lifecycleGrant(role)] : []);
  const databaseAuthorized =
    options.databaseAuthorized ?? role === "department_admin";
  const result = options.result ?? {
    outcome: "TRANSITIONED" as const,
    syllabusVersion: lifecycleView,
  };
  const authorizationQueries: unknown[] = [];
  const transitionCalls: Array<Record<string, unknown>> = [];
  const repository = {
    transitionSyllabusVersion: async (input: Record<string, unknown>) => {
      transitionCalls.push(input);
      return result;
    },
  };
  const prisma = {
    user: {
      findFirst: async (args: unknown) => {
        authorizationQueries.push(args);
        return databaseAuthorized ? { id: `${role}-user` } : null;
      },
    },
  };
  const context = {
    requestId: "request-a",
    principal: {
      actorId: `${role}-user`,
      actorType: "user",
      isAuthenticated: true,
      activeDepartmentId: "department-a",
      roleAssignments: [
        {
          userRoleId: `${role}-assignment-a`,
          roleId: `${role}-role-a`,
          departmentId: "department-a",
          role,
        },
      ],
      permissions,
    },
    department: {
      kind: "department",
      departmentId: "department-forged",
      source: "header",
    },
    audit: { ipAddress: "127.0.0.1", userAgent: "test-agent" },
  };

  return {
    authorizationQueries,
    transitionCalls,
    service: new AcademicService(
      repository as never,
      prisma as never,
      { get: () => context } as never,
    ),
  };
}

test("exact lifecycle grant on an active Department Admin uses authoritative principal scope", async () => {
  const h = harness();

  assert.deepEqual(
    await h.service.approveSyllabusVersion("syllabus-a", {
      reason: "  Approved after review  ",
    }),
    lifecycleView,
  );

  const call = h.transitionCalls[0]!;
  assert.equal(call.departmentId, "department-a");
  assert.notEqual(call.departmentId, "department-forged");
  assert.equal(call.syllabusVersionId, "syllabus-a");
  assert.equal(call.action, "APPROVE");
  assert.equal(call.reason, "Approved after review");
  assert.equal(call.actorUserId, "department_admin-user");
  assert.equal(call.requestId, "request-a");
  assert.equal(call.ipAddress, "127.0.0.1");
  assert.equal(call.userAgent, "test-agent");
  assert.ok(call.transitionAt instanceof Date);

  const query = h.authorizationQueries[0] as {
    where: {
      id: string;
      departmentId: string;
      status: string;
      archivedAt: null;
      deletedAt: null;
      department: Record<string, unknown>;
      userRoles: {
        some: {
          id: string;
          departmentId: string;
          revokedAt: null;
          OR: Array<Record<string, unknown>>;
          role: {
            id: string;
            code: string;
            departmentId: string;
            archivedAt: null;
            rolePermissions: {
              some: { permission: { is: Record<string, unknown> } };
            };
          };
        };
      };
    };
  };
  assert.equal(query.where.id, "department_admin-user");
  assert.equal(query.where.departmentId, "department-a");
  assert.equal(query.where.status, "ACTIVE");
  assert.equal(query.where.archivedAt, null);
  assert.equal(query.where.deletedAt, null);
  assert.deepEqual(query.where.department, {
    id: "department-a",
    status: "ACTIVE",
    archivedAt: null,
    deletedAt: null,
  });
  assert.equal(query.where.userRoles.some.id, "department_admin-assignment-a");
  assert.equal(query.where.userRoles.some.departmentId, "department-a");
  assert.equal(query.where.userRoles.some.revokedAt, null);
  assert.ok(
    (query.where.userRoles.some.OR[1]!.expiresAt as { gt: unknown })
      .gt instanceof Date,
  );
  assert.equal(query.where.userRoles.some.role.id, "department_admin-role-a");
  assert.equal(query.where.userRoles.some.role.code, "department_admin");
  assert.equal(query.where.userRoles.some.role.departmentId, "department-a");
  assert.equal(query.where.userRoles.some.role.archivedAt, null);
  assert.deepEqual(
    query.where.userRoles.some.role.rolePermissions.some.permission.is,
    {
      resource: "course-management.syllabus-version.lifecycle",
      action: "manage",
      scope: PermissionScope.DEPARTMENT,
    },
  );
});

test("all four service methods map only to their explicit lifecycle action", async () => {
  const cases = [
    ["approveSyllabusVersion", "APPROVE"],
    ["activateSyllabusVersion", "ACTIVATE"],
    ["retireSyllabusVersion", "RETIRE"],
    ["archiveSyllabusVersion", "ARCHIVE"],
  ] as const;

  for (const [method, action] of cases) {
    const h = harness();
    await h.service[method]("syllabus-a", { reason: "Reviewed" });
    assert.equal(h.transitionCalls[0]!.action, action);
  }
});

test("existing syllabus manage grant alone and generic wildcards are insufficient", async () => {
  for (const permissions of [
    [
      lifecycleGrant("department_admin", {
        resource: "course-management.syllabus-version",
      }),
    ],
    [
      lifecycleGrant("department_admin", {
        resource: "course-management",
        action: "*",
      }),
    ],
    [lifecycleGrant("department_admin", { resource: "*", action: "*" })],
  ]) {
    const h = harness({ permissions });
    await assert.rejects(
      h.service.activateSyllabusVersion("syllabus-a", { reason: "Attempt" }),
      ForbiddenException,
    );
    assert.equal(h.authorizationQueries.length, 0);
    assert.equal(h.transitionCalls.length, 0);
  }
});

test("Teacher, Student, and non-department lifecycle scopes are denied", async () => {
  for (const role of ["teacher", "student"] as const) {
    const h = harness({
      role,
      permissions: [lifecycleGrant(role)],
      databaseAuthorized: false,
    });
    await assert.rejects(
      h.service.activateSyllabusVersion("syllabus-a", { reason: "Attempt" }),
      ForbiddenException,
    );
    assert.equal(h.transitionCalls.length, 0);
  }

  for (const scope of ["self", "public_verification"] as const) {
    const h = harness({
      permissions: [lifecycleGrant("department_admin", { scope })],
    });
    await assert.rejects(
      h.service.activateSyllabusVersion("syllabus-a", { reason: "Attempt" }),
      ForbiddenException,
    );
    assert.equal(h.authorizationQueries.length, 0);
    assert.equal(h.transitionCalls.length, 0);
  }
});

test("wrong-department or wrong-role permission provenance is denied before DB authorization", async () => {
  for (const grant of [
    lifecycleGrant("department_admin", {
      source: {
        departmentId: "department-b",
        userRoleId: "department_admin-assignment-a",
        roleId: "department_admin-role-a",
      },
    }),
    lifecycleGrant("department_admin", {
      source: {
        departmentId: "department-a",
        userRoleId: "other-assignment",
        roleId: "other-role",
      },
    }),
    lifecycleGrant("teacher"),
  ]) {
    const h = harness({ permissions: [grant] });
    await assert.rejects(
      h.service.retireSyllabusVersion("syllabus-a", { reason: "Attempt" }),
      ForbiddenException,
    );
    assert.equal(h.authorizationQueries.length, 0);
    assert.equal(h.transitionCalls.length, 0);
  }
});

test("revoked, expired, wrong-department, archived-role/user/department authority fails DB-backed gate", async () => {
  for (const staleState of [
    "revoked assignment",
    "expired assignment",
    "wrong-department assignment",
    "archived role",
    "inactive user",
    "archived user",
    "deleted user",
    "inactive department",
    "archived department",
    "deleted department",
  ]) {
    const h = harness({ databaseAuthorized: false });
    await assert.rejects(
      h.service.archiveSyllabusVersion("syllabus-a", {
        reason: staleState,
      }),
      ForbiddenException,
    );
    assert.equal(h.authorizationQueries.length, 1);
    assert.equal(h.transitionCalls.length, 0);
  }
});

test("service requires a trimmed non-empty reason and rejects client lifecycle control", async () => {
  for (const input of [
    { reason: "   " },
    { reason: "Approved", status: "ACTIVE" },
    { reason: "Approved", approvedAt: new Date() },
    { reason: "Approved", archivedAt: new Date() },
    { reason: "Approved", transitionAt: new Date() },
    { reason: "Approved", departmentId: "department-b" },
  ]) {
    const h = harness();
    await assert.rejects(
      h.service.approveSyllabusVersion("syllabus-a", input as never),
      BadRequestException,
    );
    assert.equal(h.transitionCalls.length, 0);
  }
});

test("repository outcomes map to safe not-found and conflict responses", async () => {
  for (const outcome of [
    "SYLLABUS_VERSION_NOT_FOUND",
    "DEPENDENCY_SCOPE_MISMATCH",
  ] as const) {
    const h = harness({ result: { outcome } });
    await assert.rejects(
      h.service.activateSyllabusVersion("syllabus-a", { reason: "Activate" }),
      NotFoundException,
    );
  }

  const invalid = harness({ result: { outcome: "INVALID_TRANSITION" } });
  await assert.rejects(
    invalid.service.activateSyllabusVersion("syllabus-a", {
      reason: "Activate",
    }),
    ConflictException,
  );
});
