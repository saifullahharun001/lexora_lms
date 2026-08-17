import assert from "node:assert/strict";
import test from "node:test";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { PermissionScope } from "@prisma/client";

import type { BindCourseOfferingSyllabusResult } from "../ports/academic.repository.port";
import { AcademicService } from "./academic.service";

type Role = "department_admin" | "teacher" | "student";

function exactGrant(role: Role = "department_admin") {
  return {
    resource: "course-management.syllabus-binding",
    action: "manage",
    scope: "department" as const,
    source: {
      departmentId: "department-a",
      userRoleId: `${role}-assignment-a`,
      roleId: `${role}-role-a`,
    },
  };
}

function harness(
  options: {
    role?: Role;
    permissions?: ReturnType<typeof exactGrant>[];
    databaseAuthorized?: boolean;
    result?: BindCourseOfferingSyllabusResult;
  } = {},
) {
  const role = options.role ?? "department_admin";
  const permissions =
    options.permissions ??
    (role === "department_admin" ? [exactGrant(role)] : []);
  const result = options.result ?? {
    outcome: "BOUND" as const,
    offering: { id: "offering-a", syllabusVersionId: "syllabus-a" },
  };
  const authorizationQueries: unknown[] = [];
  const bindingCalls: Array<Record<string, unknown>> = [];
  const repository = {
    bindCourseOfferingSyllabus: async (input: Record<string, unknown>) => {
      bindingCalls.push(input);
      return result;
    },
  };
  const prisma = {
    user: {
      findFirst: async (args: unknown) => {
        authorizationQueries.push(args);
        return options.databaseAuthorized === false
          ? null
          : { id: `${role}-user` };
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
    bindingCalls,
    service: new AcademicService(
      repository as never,
      prisma as never,
      { get: () => context } as never,
    ),
  };
}

test("exact grant and active Department Admin use authoritative principal and audit context", async () => {
  const h = harness();
  assert.deepEqual(
    await h.service.bindCourseOfferingSyllabus("offering-a", "syllabus-a"),
    { id: "offering-a", syllabusVersionId: "syllabus-a" },
  );
  assert.deepEqual(h.bindingCalls, [
    {
      departmentId: "department-a",
      courseOfferingId: "offering-a",
      syllabusVersionId: "syllabus-a",
      actorUserId: "department_admin-user",
      requestId: "request-a",
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
    },
  ]);

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
      code: "course-management.syllabus-binding.manage",
      resource: "course-management.syllabus-binding",
      action: "manage",
      scope: PermissionScope.DEPARTMENT,
    },
  );
});

test("missing, wrong, Teacher, and Student permission authority fail before repository access", async () => {
  const cases = [
    harness({ permissions: [] }),
    harness({
      permissions: [
        {
          ...exactGrant(),
          resource: "course-management.syllabus-version",
        },
      ],
    }),
    harness({ role: "teacher", permissions: [exactGrant("teacher")] }),
    harness({ role: "student", permissions: [exactGrant("student")] }),
  ];

  for (const h of cases) {
    await assert.rejects(
      h.service.bindCourseOfferingSyllabus("offering-a", "syllabus-a"),
      ForbiddenException,
    );
    assert.equal(h.authorizationQueries.length, 0);
    assert.equal(h.bindingCalls.length, 0);
  }
});

test("stale, revoked, expired, archived, inactive, deleted, or wrong-department DB authority fails closed", async (t) => {
  for (const state of [
    "inactive user",
    "archived user",
    "deleted user",
    "inactive department",
    "archived department",
    "deleted department",
    "revoked assignment",
    "expired assignment",
    "archived role",
    "wrong department",
    "missing exact role permission",
  ]) {
    await t.test(state, async () => {
      const h = harness({ databaseAuthorized: false });
      await assert.rejects(
        h.service.bindCourseOfferingSyllabus("offering-a", "syllabus-a"),
        ForbiddenException,
      );
      assert.equal(h.authorizationQueries.length, 1);
      assert.equal(h.bindingCalls.length, 0);
    });
  }
});

test("repository outcomes map to safe HTTP errors without foreign-resource leakage", async () => {
  const cases: Array<
    [
      BindCourseOfferingSyllabusResult,
      (
        | typeof BadRequestException
        | typeof ConflictException
        | typeof NotFoundException
      ),
    ]
  > = [
    [{ outcome: "OFFERING_NOT_FOUND" }, NotFoundException],
    [{ outcome: "OFFERING_CURRICULUM_NOT_BOUND" }, BadRequestException],
    [{ outcome: "SYLLABUS_VERSION_NOT_FOUND" }, NotFoundException],
    [{ outcome: "SYLLABUS_CURRICULUM_MISMATCH" }, BadRequestException],
    [{ outcome: "INELIGIBLE_SYLLABUS_VERSION" }, BadRequestException],
    [{ outcome: "MALFORMED_SYLLABUS_VERSION" }, NotFoundException],
    [{ outcome: "DEPENDENCY_SCOPE_MISMATCH" }, NotFoundException],
    [{ outcome: "BINDING_CONFLICT" }, ConflictException],
  ];

  for (const [result, exception] of cases) {
    await assert.rejects(
      harness({ result }).service.bindCourseOfferingSyllabus(
        "offering-a",
        "syllabus-a",
      ),
      exception,
    );
  }
});
