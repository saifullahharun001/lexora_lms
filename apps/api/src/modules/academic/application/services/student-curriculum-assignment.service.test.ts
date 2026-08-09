import assert from "node:assert/strict";
import test from "node:test";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";

import type { CreateStudentCurriculumAssignmentResult } from "../ports/academic.repository.port";
import { AcademicService } from "./academic.service";

type Role = "department_admin" | "teacher" | "student";

function harness(
  role: Role,
  result: CreateStudentCurriculumAssignmentResult = {
    outcome: "CREATED",
    assignment: { id: "assignment-a" },
  },
  actorAuthorized = role === "department_admin",
) {
  const calls: unknown[] = [];
  const repository = {
    createStudentCurriculumAssignment: async (input: unknown) => {
      calls.push(input);
      return result;
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

test("active Department Admin uses principal department and actor identity", async () => {
  const { service, calls } = harness("department_admin");
  assert.deepEqual(
    await service.createStudentCurriculumAssignment(
      "student-a",
      "program-a",
      "version-a",
    ),
    { id: "assignment-a" },
  );
  assert.deepEqual(calls.at(-1), {
    departmentId: "department-a",
    studentUserId: "student-a",
    academicProgramId: "program-a",
    curriculumVersionId: "version-a",
    actorUserId: "department_admin-user",
    requestId: "request-a",
    ipAddress: "127.0.0.1",
    userAgent: "test",
  });

  const query = calls[0] as { where: Record<string, unknown> };
  assert.equal(query.where.id, "department_admin-user");
  assert.equal(query.where.departmentId, "department-a");
  assert.equal(query.where.status, "ACTIVE");
  assert.deepEqual(query.where.department, {
    id: "department-a",
    status: "ACTIVE",
    archivedAt: null,
    deletedAt: null,
  });
});

test("Teacher, Student, and stale Department Admin state are forbidden", async () => {
  for (const role of ["teacher", "student"] as const) {
    const { service, calls } = harness(role);
    await assert.rejects(
      service.createStudentCurriculumAssignment("student-a", "program-a", "version-a"),
      ForbiddenException,
    );
    assert.equal(calls.length, 1);
  }

  const stale = harness("department_admin", undefined, false);
  await assert.rejects(
    stale.service.createStudentCurriculumAssignment(
      "student-a",
      "program-a",
      "version-a",
    ),
    ForbiddenException,
  );
  assert.equal(stale.calls.length, 1);
});

test("repository outcomes map to sanitized HTTP errors", async () => {
  const cases: Array<[
    CreateStudentCurriculumAssignmentResult,
    typeof BadRequestException | typeof ConflictException | typeof NotFoundException,
  ]> = [
    [{ outcome: "STUDENT_NOT_FOUND" }, NotFoundException],
    [{ outcome: "ACADEMIC_PROGRAM_NOT_FOUND" }, NotFoundException],
    [{ outcome: "CURRICULUM_VERSION_NOT_FOUND" }, NotFoundException],
    [{ outcome: "DEPENDENCY_SCOPE_MISMATCH" }, NotFoundException],
    [{ outcome: "INACTIVE_CURRICULUM_VERSION" }, BadRequestException],
    [{ outcome: "ASSIGNMENT_CONFLICT" }, ConflictException],
  ];

  for (const [result, expected] of cases) {
    const { service } = harness("department_admin", result);
    await assert.rejects(
      service.createStudentCurriculumAssignment("student-a", "program-a", "version-a"),
      expected,
    );
  }
});
