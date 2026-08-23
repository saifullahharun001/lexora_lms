import assert from "node:assert/strict";
import test from "node:test";

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";

import { ACADEMIC_AUDIT_EVENTS } from "../../domain/academic.audit-events";
import type { UpdateCourseResult } from "../ports/academic.repository.port";
import { AcademicService } from "./academic.service";

function harness(result: UpdateCourseResult) {
  const calls: Array<{ kind: string; value: unknown }> = [];
  const repository = {
    updateCourse: async (...args: unknown[]) => {
      calls.push({ kind: "update", value: args });
      return result;
    },
  };
  const prisma = {
    auditLog: {
      create: async (value: unknown) => {
        calls.push({ kind: "audit", value });
        return value;
      },
    },
  };
  const context = {
    requestId: "request-a",
    principal: {
      actorId: "admin-a",
      activeDepartmentId: "department-a",
      roleAssignments: [
        {
          userRoleId: "assignment-a",
          roleId: "role-a",
          departmentId: "department-a",
          role: "department_admin",
        },
      ],
      permissions: [],
    },
    department: {
      kind: "department",
      departmentId: "forged-department",
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

test("successful Course update preserves principal scope and existing success audit", async () => {
  const course = { id: "course-a", academicProgramId: "program-b" };
  const h = harness({ outcome: "UPDATED", course });

  assert.equal(
    await h.service.updateCourse("course-a", {
      academicProgramId: "program-b",
      title: "Updated title",
    }),
    course,
  );
  const update = h.calls.find((call) => call.kind === "update")!;
  assert.deepEqual(update.value, [
    "department-a",
    "course-a",
    { academicProgramId: "program-b", title: "Updated title" },
  ]);
  const audits = h.calls.filter((call) => call.kind === "audit");
  assert.equal(audits.length, 1);
  assert.deepEqual(
    (audits[0]!.value as { data: Record<string, unknown> }).data,
    {
      requestId: "request-a",
      actorUserId: "admin-a",
      actorType: "USER",
      departmentId: "department-a",
      action: ACADEMIC_AUDIT_EVENTS.COURSE_UPDATED,
      targetType: "course",
      targetId: "course-a",
      outcome: "SUCCESS",
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
      contextJson: {
        updatedFields: ["academicProgramId", "title"],
      },
    },
  );
});

test("dependency conflict maps to sanitized 409 and creates no success audit", async () => {
  const h = harness({ outcome: "PROGRAMME_DEPENDENCY_CONFLICT" });

  await assert.rejects(
    h.service.updateCourse("course-a", { academicProgramId: "program-b" }),
    (error: unknown) =>
      error instanceof ConflictException &&
      error.message ===
        "Course academic program conflicts with existing curriculum dependencies",
  );
  assert.equal(h.calls.filter((call) => call.kind === "audit").length, 0);
});

test("scoped Course and AcademicProgram failures retain safe HTTP semantics", async () => {
  await assert.rejects(
    harness({ outcome: "COURSE_NOT_FOUND" }).service.updateCourse(
      "foreign-course",
      { academicProgramId: "program-b" },
    ),
    (error: unknown) =>
      error instanceof NotFoundException && error.message === "Course not found",
  );

  await assert.rejects(
    harness({ outcome: "ACADEMIC_PROGRAM_NOT_FOUND" }).service.updateCourse(
      "course-a",
      { academicProgramId: "foreign-program" },
    ),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message ===
        "Academic program does not belong to the active department",
  );
});
