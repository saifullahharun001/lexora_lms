import assert from "node:assert/strict";
import test from "node:test";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { AcademicVersionStatus, PermissionScope } from "@prisma/client";

import type { CreateSyllabusVersionResult } from "../ports/academic.repository.port";
import { AcademicService } from "./academic.service";

type Role = "department_admin" | "teacher" | "student";

const syllabusVersion = {
  id: "syllabus-a",
  code: "SYL-1",
  versionNumber: 1,
  status: AcademicVersionStatus.DRAFT,
};

function governanceGrant(role: Role) {
  return {
    resource: "course-management.syllabus-version",
    action: "manage",
    scope: "department",
    source: {
      departmentId: "department-a",
      userRoleId: `${role}-assignment-a`,
      roleId: `${role}-role-a`,
    },
  } as const;
}

function harness(
  options: {
    role?: Role;
    permissions?: ReturnType<typeof governanceGrant>[];
    actorAuthorized?: boolean;
    createResult?: CreateSyllabusVersionResult;
    detail?: unknown | null;
  } = {},
) {
  const role = options.role ?? "department_admin";
  const permissions =
    options.permissions ??
    (role === "department_admin" ? [governanceGrant(role)] : []);
  const actorAuthorized =
    options.actorAuthorized ?? role === "department_admin";
  const calls: Array<{ kind: string; value: unknown }> = [];
  const repository = {
    createSyllabusVersion: async (input: unknown) => {
      calls.push({ kind: "create", value: input });
      return (
        options.createResult ?? {
          outcome: "CREATED",
          syllabusVersion,
        }
      );
    },
    findSyllabusVersions: async (input: unknown) => {
      calls.push({ kind: "list", value: input });
      return [syllabusVersion];
    },
    findSyllabusVersionById: async (...args: unknown[]) => {
      calls.push({ kind: "detail", value: args });
      return options.detail === undefined ? syllabusVersion : options.detail;
    },
  };
  const prisma = {
    user: {
      findFirst: async (args: unknown) => {
        calls.push({ kind: "authorization", value: args });
        return actorAuthorized ? { id: `${role}-user` } : null;
      },
    },
  };
  const context = {
    requestId: "request-a",
    principal: {
      actorId: `${role}-user`,
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
    calls,
    service: new AcademicService(
      repository as never,
      prisma as never,
      { get: () => context } as never,
    ),
  };
}

test("active Department Admin with exact permission creates in authoritative principal scope", async () => {
  const h = harness();
  const effectiveFrom = new Date("2026-09-01T00:00:00.000Z");
  const effectiveTo = new Date("2027-06-30T00:00:00.000Z");

  assert.deepEqual(
    await h.service.createSyllabusVersion({
      curriculumCourseId: "  curriculum-course-a ",
      code: "  SYL-1 ",
      versionNumber: 1,
      effectiveFrom,
      effectiveTo,
    }),
    syllabusVersion,
  );

  const create = h.calls.find((call) => call.kind === "create")!
    .value as Record<string, unknown>;
  assert.deepEqual(create, {
    departmentId: "department-a",
    curriculumCourseId: "curriculum-course-a",
    code: "SYL-1",
    versionNumber: 1,
    effectiveFrom,
    effectiveTo,
    actorUserId: "department_admin-user",
    requestId: "request-a",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
  });
  assert.notEqual(create.departmentId, "department-forged");

  const authorization = h.calls.find((call) => call.kind === "authorization")!
    .value as {
    where: {
      id: string;
      departmentId: string;
      status: string;
      userRoles: {
        some: {
          revokedAt: null;
          OR: Array<Record<string, unknown>>;
          role: {
            rolePermissions: { some: { permission: { is: unknown } } };
          };
        };
      };
    };
  };
  assert.equal(authorization.where.id, "department_admin-user");
  assert.equal(authorization.where.departmentId, "department-a");
  assert.equal(authorization.where.status, "ACTIVE");
  assert.equal(authorization.where.userRoles.some.revokedAt, null);
  assert.ok(
    (authorization.where.userRoles.some.OR[1]!.expiresAt as { gt: unknown })
      .gt instanceof Date,
  );
  assert.deepEqual(
    authorization.where.userRoles.some.role.rolePermissions.some.permission.is,
    {
      resource: "course-management.syllabus-version",
      action: "manage",
      scope: PermissionScope.DEPARTMENT,
    },
  );
});

test("PostgreSQL SMALLINT maximum version number is accepted", async () => {
  const h = harness();

  await h.service.createSyllabusVersion({
    curriculumCourseId: "course-a",
    code: "SYL-MAX",
    versionNumber: 32767,
  });

  const create = h.calls.find((call) => call.kind === "create")!
    .value as Record<string, unknown>;
  assert.equal(create.versionNumber, 32767);
});

test("Teacher, Student, stale Admin, and Admin without exact permission are forbidden", async () => {
  for (const role of ["teacher", "student"] as const) {
    const h = harness({
      role,
      permissions: [governanceGrant(role)],
      actorAuthorized: false,
    });
    await assert.rejects(
      h.service.createSyllabusVersion({
        curriculumCourseId: "course-a",
        code: "SYL-1",
        versionNumber: 1,
      }),
      ForbiddenException,
    );
    assert.equal(
      h.calls.some((call) => call.kind === "create"),
      false,
    );
  }

  for (const staleState of [
    "expired assignment",
    "revoked assignment",
    "archived role",
    "inactive user",
    "archived user",
    "deleted user",
    "inactive department",
    "archived department",
  ]) {
    const stale = harness({ actorAuthorized: false });
    await assert.rejects(
      stale.service.listSyllabusVersions({}),
      ForbiddenException,
      staleState,
    );
    assert.equal(
      stale.calls.some((call) => call.kind === "list"),
      false,
    );
  }

  const missingPermission = harness({ permissions: [] });
  await assert.rejects(
    missingPermission.service.getSyllabusVersion("syllabus-a"),
    ForbiddenException,
  );
  assert.equal(
    missingPermission.calls.some((call) => call.kind === "authorization"),
    false,
  );
});

test("creation rejects invalid version/date and forced server-controlled fields", async () => {
  for (const input of [
    { curriculumCourseId: "course-a", code: "SYL-1", versionNumber: 0 },
    { curriculumCourseId: "course-a", code: "SYL-1", versionNumber: 1.5 },
    { curriculumCourseId: "course-a", code: "SYL-1", versionNumber: 32768 },
    {
      curriculumCourseId: "course-a",
      code: "SYL-1",
      versionNumber: 1_000_000_000,
    },
    { curriculumCourseId: " ", code: "SYL-1", versionNumber: 1 },
    { curriculumCourseId: "course-a", code: " ", versionNumber: 1 },
    {
      curriculumCourseId: "course-a",
      code: "SYL-1",
      versionNumber: 1,
      effectiveFrom: new Date("invalid"),
    },
    {
      curriculumCourseId: "course-a",
      code: "SYL-1",
      versionNumber: 1,
      effectiveFrom: new Date("2027-01-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      curriculumCourseId: "course-a",
      code: "SYL-1",
      versionNumber: 1,
      status: "ACTIVE",
    },
    {
      curriculumCourseId: "course-a",
      code: "SYL-1",
      versionNumber: 1,
      approvedAt: new Date(),
    },
    {
      curriculumCourseId: "course-a",
      code: "SYL-1",
      versionNumber: 1,
      archivedAt: new Date(),
    },
    {
      curriculumCourseId: "course-a",
      code: "SYL-1",
      versionNumber: 1,
      departmentId: "department-b",
    },
  ]) {
    const h = harness();
    await assert.rejects(
      h.service.createSyllabusVersion(input as never),
      BadRequestException,
    );
    assert.equal(
      h.calls.some((call) => call.kind === "create"),
      false,
    );
  }
});

test("repository creation outcomes map to safe not-found and conflict responses", async () => {
  for (const outcome of [
    "CURRICULUM_COURSE_NOT_FOUND",
    "DEPENDENCY_SCOPE_MISMATCH",
  ] as const) {
    const h = harness({ createResult: { outcome } });
    await assert.rejects(
      h.service.createSyllabusVersion({
        curriculumCourseId: "course-other",
        code: "SYL-1",
        versionNumber: 1,
      }),
      NotFoundException,
    );
  }

  for (const outcome of [
    "DUPLICATE_CODE",
    "DUPLICATE_VERSION_NUMBER",
  ] as const) {
    const h = harness({ createResult: { outcome } });
    await assert.rejects(
      h.service.createSyllabusVersion({
        curriculumCourseId: "course-a",
        code: "SYL-1",
        versionNumber: 1,
      }),
      ConflictException,
    );
  }
});

test("list and direct reads are principal-department scoped with safe not-found", async () => {
  const h = harness();
  assert.deepEqual(
    await h.service.listSyllabusVersions({
      curriculumCourseId: "course-a",
      status: AcademicVersionStatus.DRAFT,
    }),
    [syllabusVersion],
  );
  assert.deepEqual(h.calls.find((call) => call.kind === "list")?.value, {
    departmentId: "department-a",
    curriculumCourseId: "course-a",
    status: AcademicVersionStatus.DRAFT,
  });
  assert.deepEqual(
    await h.service.getSyllabusVersion("syllabus-a"),
    syllabusVersion,
  );
  assert.deepEqual(h.calls.find((call) => call.kind === "detail")?.value, [
    "department-a",
    "syllabus-a",
  ]);

  const missing = harness({ detail: null });
  await assert.rejects(
    missing.service.getSyllabusVersion("other-department-syllabus"),
    NotFoundException,
  );
});
