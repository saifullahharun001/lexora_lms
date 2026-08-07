import assert from "node:assert/strict";
import test from "node:test";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";

import type { BindCourseOfferingCurriculumResult } from "../ports/academic.repository.port";
import { AcademicService } from "./academic.service";

type Role = "department_admin" | "teacher" | "student";

function harness(
  role: Role,
  result: BindCourseOfferingCurriculumResult = {
    outcome: "BOUND",
    offering: { id: "offering-a", curriculumCourse: { id: "curriculum-a" } },
  },
  actorAuthorized = role === "department_admin",
) {
  const calls: unknown[] = [];
  const repository = {
    bindCourseOfferingCurriculum: async (input: unknown) => {
      calls.push(input);
      return result;
    },
    findCourseOfferings: async (input: unknown) => {
      calls.push(input);
      return [];
    },
    findCourseOfferingById: async () => ({ id: "offering-a" }),
    findCourseOfferingByIdForTeacher: async (...args: unknown[]) => {
      calls.push(args);
      return args[1] === "assigned" ? { id: "assigned" } : null;
    },
    findStudentVisibleCourseOfferings: async (input: unknown) => {
      calls.push(input);
      return [
        {
          id: "offering-a",
          enrollments: [{ id: "enrollment-a", status: "APPROVED" }],
        },
      ];
    },
  };
  const prisma = {
    user: {
      findFirst: async (args: unknown) => {
        calls.push(args);
        return actorAuthorized ? { id: `${role}-user` } : null;
      },
    },
  };
  const context = {
    requestId: "request-a",
    principal: {
      actorId: `${role}-user`,
      activeDepartmentId: "department-a",
      roleAssignments: [{ departmentId: "department-a", role }],
      permissions: [],
    },
    department: {
      kind: "department",
      departmentId: "department-forged",
      source: "header",
    },
    audit: { ipAddress: "127.0.0.1", userAgent: "test" },
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

test("Department Admin binding uses only principal department despite forged department context", async () => {
  const { service, calls } = harness("department_admin");
  const result = await service.bindCourseOfferingCurriculum(
    "offering-a",
    "curriculum-a",
  );

  assert.deepEqual(result, {
    id: "offering-a",
    curriculumCourse: { id: "curriculum-a" },
  });
  assert.deepEqual(calls.at(-1), {
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    curriculumCourseId: "curriculum-a",
    actorUserId: "department_admin-user",
    requestId: "request-a",
    ipAddress: "127.0.0.1",
    userAgent: "test",
  });
  const authorizationQuery = calls[0] as {
    where: {
      id: string;
      departmentId: string;
      status: string;
      archivedAt: null;
      deletedAt: null;
      department: unknown;
      userRoles: {
        some: {
          departmentId: string;
          revokedAt: null;
          OR: Array<{ expiresAt: null | { gt: Date } }>;
          role: unknown;
        };
      };
    };
  };
  assert.equal(authorizationQuery.where.id, "department_admin-user");
  assert.equal(authorizationQuery.where.departmentId, "department-a");
  assert.equal(authorizationQuery.where.status, "ACTIVE");
  assert.equal(authorizationQuery.where.archivedAt, null);
  assert.equal(authorizationQuery.where.deletedAt, null);
  assert.deepEqual(authorizationQuery.where.department, {
    id: "department-a",
    status: "ACTIVE",
    archivedAt: null,
    deletedAt: null,
  });
  const assignment = authorizationQuery.where.userRoles.some;
  assert.equal(assignment.departmentId, "department-a");
  assert.equal(assignment.revokedAt, null);
  assert.equal(assignment.OR[0]?.expiresAt, null);
  assert.ok(
    (assignment.OR[1]?.expiresAt as { gt: Date }).gt instanceof Date,
  );
  assert.deepEqual(assignment.role, {
    code: "department_admin",
    departmentId: "department-a",
    archivedAt: null,
  });
});

test("Teacher and Student cannot bind curriculum at the service boundary", async () => {
  for (const role of ["teacher", "student"] as const) {
    const { service, calls } = harness(role);
    await assert.rejects(
      service.bindCourseOfferingCurriculum("offering-a", "curriculum-a"),
      ForbiddenException,
    );
    assert.equal(
      calls.some(
        (call) =>
          typeof call === "object" &&
          call !== null &&
          "courseOfferingId" in call,
      ),
      false,
    );
  }
});

test("stale or invalid Department Admin database state is forbidden before mutation", async (t) => {
  for (const state of [
    "expired assignment",
    "revoked assignment",
    "archived role",
    "inactive user",
    "archived user",
    "deleted user",
    "wrong-department assignment",
  ]) {
    await t.test(state, async () => {
      const { service, calls } = harness(
        "department_admin",
        { outcome: "BOUND", offering: { id: "offering-a" } },
        false,
      );
      await assert.rejects(
        service.bindCourseOfferingCurriculum("offering-a", "curriculum-a"),
        ForbiddenException,
      );
      assert.equal(calls.length, 1);
    });
  }
});

test("binding outcomes map to safe HTTP errors", async () => {
  const cases: Array<[
    BindCourseOfferingCurriculumResult,
    typeof BadRequestException | typeof ConflictException | typeof NotFoundException,
  ]> = [
    [{ outcome: "OFFERING_NOT_FOUND" }, NotFoundException],
    [{ outcome: "CURRICULUM_COURSE_NOT_FOUND" }, NotFoundException],
    [{ outcome: "DEPENDENCY_SCOPE_MISMATCH" }, NotFoundException],
    [{ outcome: "COURSE_MISMATCH" }, BadRequestException],
    [{ outcome: "INACTIVE_CURRICULUM_VERSION" }, BadRequestException],
    [{ outcome: "INACTIVE_ASSESSMENT_TEMPLATE" }, BadRequestException],
    [{ outcome: "BINDING_CONFLICT" }, ConflictException],
  ];

  for (const [result, expected] of cases) {
    const { service } = harness("department_admin", result);
    await assert.rejects(
      service.bindCourseOfferingCurriculum("offering-a", "curriculum-a"),
      expected,
    );
  }
});

test("Teacher offering reads remain limited to active assignments", async () => {
  const { service, calls } = harness("teacher");
  await service.listCourseOfferings({});
  assert.deepEqual(calls.at(-1), {
    departmentId: "department-a",
    assignedTeacherUserId: "teacher-user",
    teacherAssignmentStatus: "ACTIVE",
  });
  assert.deepEqual(await service.getCourseOffering("assigned"), {
    id: "assigned",
  });
  await assert.rejects(service.getCourseOffering("unassigned"), NotFoundException);
});

test("Student /course-offerings/me semantics remain principal-scoped and unchanged", async () => {
  const { service, calls } = harness("student");
  const result = await service.listMyCourseOfferings({
    academicTermId: "term-a",
  });
  assert.deepEqual(result, [
    {
      id: "offering-a",
      myEnrollment: { id: "enrollment-a", status: "APPROVED" },
    },
  ]);
  const query = calls.at(-1) as Record<string, unknown>;
  assert.equal(query.departmentId, "department-a");
  assert.equal(query.studentUserId, "student-user");
  assert.equal(query.academicTermId, "term-a");
});
