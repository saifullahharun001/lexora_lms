import assert from "node:assert/strict";
import test from "node:test";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { AcademicVersionStatus, PermissionScope } from "@prisma/client";

import type { TransitionCurriculumVersionResult } from "../ports/academic.repository.port";
import { AcademicService } from "./academic.service";

type Role = "department_admin" | "teacher" | "student";
type GrantScope = "department" | "self" | "public_verification";
interface TestPermissionGrant {
  resource: string;
  action: string;
  scope: GrantScope;
  source: { departmentId: string; userRoleId: string; roleId: string };
}
type DatabaseAuthorizationCase =
  | "qualifying-admin"
  | "permission-on-other-role"
  | "permission-on-expired-role"
  | "permission-on-revoked-role"
  | "none";

const lifecycleView = {
  id: "version-a",
  departmentId: "department-a",
  academicProgramId: "program-a",
  code: "CURR-1",
  name: "Curriculum 1",
  status: AcademicVersionStatus.APPROVED,
  effectiveAcademicSessionCode: "2026-2027",
  approvedAt: new Date("2026-08-13T10:00:00.000Z"),
  archivedAt: null,
  updatedAt: new Date("2026-08-13T10:00:00.000Z"),
};

function governanceGrant(
  role: Role,
  overrides: Partial<Omit<TestPermissionGrant, "source">> = {},
): TestPermissionGrant {
  return {
    resource: "course-management.curriculum-version.lifecycle",
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
  role: Role = "department_admin",
  result: TransitionCurriculumVersionResult = {
    outcome: "TRANSITIONED",
    curriculumVersion: lifecycleView,
  },
  actorAuthorized = role === "department_admin",
  permissions: TestPermissionGrant[] =
    role === "department_admin"
      ? [governanceGrant(role)]
      : [],
  databaseAuthorizationCase: DatabaseAuthorizationCase =
    actorAuthorized && role === "department_admin"
      ? "qualifying-admin"
      : "none",
) {
  const authorizationQueries: unknown[] = [];
  const transitionCalls: Array<Record<string, unknown>> = [];
  const repository = {
    transitionCurriculumVersion: async (input: Record<string, unknown>) => {
      transitionCalls.push(input);
      return result;
    },
  };
  const prisma = {
    user: {
      findFirst: async (args: unknown) => {
        authorizationQueries.push(args);
        return databaseAuthorizationCase === "qualifying-admin"
          ? { id: role + "-user" }
          : null;
      },
    },
  };
  const context = {
    requestId: "request-a",
    principal: {
      actorId: role + "-user",
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
    audit: { ipAddress: "127.0.0.1", userAgent: "test" },
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

test("same-department active Department Admin with exact permission uses authoritative scope", async () => {
  const { service, authorizationQueries, transitionCalls } = harness();

  assert.deepEqual(
    await service.approveCurriculumVersion("version-a", {
      reason: "  Formally approved  ",
      approvalReference: "  Ordinance-17  ",
    }),
    lifecycleView,
  );

  const call = transitionCalls[0]!;
  assert.equal(call.departmentId, "department-a");
  assert.equal(call.curriculumVersionId, "version-a");
  assert.equal(call.action, "APPROVE");
  assert.equal(call.reason, "Formally approved");
  assert.equal(call.approvalReference, "Ordinance-17");
  assert.equal(call.actorUserId, "department_admin-user");
  assert.equal(call.requestId, "request-a");
  assert.ok(call.transitionAt instanceof Date);
  assert.notEqual(call.departmentId, "department-forged");

  const query = authorizationQueries[0] as {
    where: Record<string, unknown>;
  };
  assert.equal(query.where.id, "department_admin-user");
  assert.equal(query.where.departmentId, "department-a");
  assert.equal(query.where.status, "ACTIVE");

  const assignment = query.where.userRoles as {
    some: {
      departmentId: string;
      revokedAt: null;
      OR: Array<Record<string, unknown>>;
      role: {
        code: string;
        departmentId: string;
        archivedAt: null;
        rolePermissions: {
          some: {
            permission: {
              is: { resource: string; action: string; scope: PermissionScope };
            };
          };
        };
      };
    };
  };
  assert.equal(assignment.some.departmentId, "department-a");
  assert.equal(assignment.some.revokedAt, null);
  assert.equal(assignment.some.OR[0]!.expiresAt, null);
  assert.ok(
    (assignment.some.OR[1]!.expiresAt as { gt: unknown }).gt instanceof Date,
  );
  assert.equal(assignment.some.role.code, "department_admin");
  assert.equal(assignment.some.role.departmentId, "department-a");
  assert.equal(assignment.some.role.archivedAt, null);
  assert.deepEqual(
    assignment.some.role.rolePermissions.some.permission.is,
    {
      resource: "course-management.curriculum-version.lifecycle",
      action: "manage",
      scope: PermissionScope.DEPARTMENT,
    },
  );
});

test("approve requires a non-empty approvalReference at the service boundary", async () => {
  for (const approvalReference of [undefined, "   "]) {
    const { service, transitionCalls } = harness();
    await assert.rejects(
      service.approveCurriculumVersion("version-a", {
        reason: "Approved",
        ...(approvalReference === undefined ? {} : { approvalReference }),
      }),
      BadRequestException,
    );
    assert.equal(transitionCalls.length, 0);
  }
});

test("service rejects whitespace-only reasons even when called without DTO validation", async () => {
  const { service, transitionCalls } = harness();
  await assert.rejects(
    service.activateCurriculumVersion("version-a", { reason: "   " }),
    BadRequestException,
  );
  assert.equal(transitionCalls.length, 0);
});

test("Teacher, Student, and stale Department Admin cannot invoke lifecycle mutation", async () => {
  for (const role of ["teacher", "student"] as const) {
    const { service, transitionCalls } = harness(role, undefined, true, [
      governanceGrant(role),
    ]);
    await assert.rejects(
      service.activateCurriculumVersion("version-a", { reason: "Attempt" }),
      ForbiddenException,
    );
    assert.equal(transitionCalls.length, 0);
  }

  const stale = harness("department_admin", undefined, false);
  await assert.rejects(
    stale.service.activateCurriculumVersion("version-a", { reason: "Attempt" }),
    ForbiddenException,
  );
  assert.equal(stale.transitionCalls.length, 0);
});

test("Department Admin requires the exact explicit lifecycle permission", async () => {
  for (const permissions of [
    [],
    [
      governanceGrant("department_admin", {
        resource: "course-management",
        action: "*",
      }),
    ],
    [
      governanceGrant("department_admin", {
        resource: "*",
        action: "*",
      }),
    ],
  ]) {
    const { service, authorizationQueries, transitionCalls } = harness(
      "department_admin",
      undefined,
      true,
      permissions,
    );

    await assert.rejects(
      service.activateCurriculumVersion("version-a", { reason: "Attempt" }),
      ForbiddenException,
    );
    assert.equal(authorizationQueries.length, 0);
    assert.equal(transitionCalls.length, 0);
  }
});

test("exact lifecycle permission with non-department scope is rejected before DB authorization", async () => {
  for (const scope of ["self", "public_verification"] as const) {
    const { service, authorizationQueries, transitionCalls } = harness(
      "department_admin",
      undefined,
      true,
      [governanceGrant("department_admin", { scope })],
    );

    await assert.rejects(
      service.activateCurriculumVersion("version-a", { reason: "Attempt" }),
      ForbiddenException,
    );
    assert.equal(authorizationQueries.length, 0);
    assert.equal(transitionCalls.length, 0);
  }
});

test("permission attached only to another role cannot satisfy the DB-backed gate", async () => {
  const { service, authorizationQueries, transitionCalls } = harness(
    "department_admin",
    undefined,
    true,
    undefined,
    "permission-on-other-role",
  );

  await assert.rejects(
    service.activateCurriculumVersion("version-a", { reason: "Attempt" }),
    ForbiddenException,
  );
  assert.equal(authorizationQueries.length, 1);
  assert.equal(transitionCalls.length, 0);
});

test("permission attached only through an expired or revoked role cannot satisfy the DB-backed gate", async () => {
  for (const databaseAuthorizationCase of [
    "permission-on-expired-role",
    "permission-on-revoked-role",
  ] as const) {
    const { service, authorizationQueries, transitionCalls } = harness(
      "department_admin",
      undefined,
      true,
      undefined,
      databaseAuthorizationCase,
    );

    await assert.rejects(
      service.activateCurriculumVersion("version-a", { reason: "Attempt" }),
      ForbiddenException,
    );
    assert.equal(authorizationQueries.length, 1);
    assert.equal(transitionCalls.length, 0);
  }
});

test("repository outcomes map to safe not-found and conflict responses", async () => {
  for (const outcome of [
    "CURRICULUM_VERSION_NOT_FOUND",
    "DEPENDENCY_SCOPE_MISMATCH",
  ] as const) {
    const { service } = harness("department_admin", { outcome });
    await assert.rejects(
      service.activateCurriculumVersion("version-a", { reason: "Activate" }),
      NotFoundException,
    );
  }

  const { service } = harness("department_admin", {
    outcome: "INVALID_TRANSITION",
  });
  await assert.rejects(
    service.activateCurriculumVersion("version-a", { reason: "Activate" }),
    ConflictException,
  );
});
