import assert from "node:assert/strict";
import test from "node:test";

import { ForbiddenException, NotFoundException } from "@nestjs/common";

import { AcademicService } from "./academic.service";

type Role = "department_admin" | "teacher" | "student" | "auditor";

const safeLearningOutcomes = {
  courseOfferingId: "offering-a",
  curriculumCourse: {
    id: "curriculum-course-a",
    courseCodeSnapshot: "LAW101",
    courseTitleSnapshot: "Law",
    curriculumVersion: {
      id: "curriculum-version-a",
      code: "LLB-2026",
      name: "LL.B. 2026",
      status: "ACTIVE",
      effectiveAcademicSessionCode: "2026-2027",
    },
  },
  courseLearningOutcomes: [],
};

function harness(
  role: Role,
  options: { result?: unknown | null; additionalRoles?: Role[] } = {},
) {
  const calls: Array<{ kind: string; args: unknown[] }> = [];
  const mutationCalls: string[] = [];
  const result =
    options.result === undefined ? safeLearningOutcomes : options.result;
  const repository = {
    findApprovedLearningOutcomesForCourseOffering: async (
      ...args: unknown[]
    ) => {
      calls.push({ kind: "department-read", args });
      return result;
    },
    findApprovedLearningOutcomesForCourseOfferingForTeacher: async (
      ...args: unknown[]
    ) => {
      calls.push({ kind: "teacher-read", args });
      return result;
    },
    bindCourseOfferingCurriculum: async () => {
      mutationCalls.push("bind-curriculum");
      throw new Error("unexpected mutation");
    },
    bindCourseOfferingSyllabus: async () => {
      mutationCalls.push("bind-syllabus");
      throw new Error("unexpected mutation");
    },
    updateCourseOffering: async () => {
      mutationCalls.push("update-offering");
      throw new Error("unexpected mutation");
    },
    transitionCurriculumVersion: async () => {
      mutationCalls.push("transition-curriculum");
      throw new Error("unexpected mutation");
    },
  };
  const roles = [role, ...(options.additionalRoles ?? [])];
  const context = {
    principal: {
      actorId: `${role}-user`,
      activeDepartmentId: "department-a",
      roleAssignments: roles.map((assignedRole, index) => ({
        userRoleId: `${assignedRole}-assignment-${index}`,
        roleId: `${assignedRole}-role-${index}`,
        departmentId: "department-a",
        role: assignedRole,
      })),
      permissions: [],
    },
  };

  return {
    calls,
    mutationCalls,
    service: new AcademicService(
      repository as never,
      {} as never,
      { get: () => context } as never,
    ),
  };
}

test("assigned Teacher learning-outcomes read uses exact department, offering, and actor", async () => {
  const h = harness("teacher");

  assert.deepEqual(
    await h.service.getCourseOfferingLearningOutcomes("offering-a"),
    safeLearningOutcomes,
  );
  assert.deepEqual(h.calls, [
    {
      kind: "teacher-read",
      args: ["department-a", "offering-a", "teacher-user"],
    },
  ]);
  assert.deepEqual(h.mutationCalls, []);
});

test("Department Admin learning-outcomes read uses department-scoped authority path", async () => {
  const h = harness("department_admin");

  assert.deepEqual(
    await h.service.getCourseOfferingLearningOutcomes("offering-a"),
    safeLearningOutcomes,
  );
  assert.deepEqual(h.calls, [
    { kind: "department-read", args: ["department-a", "offering-a"] },
  ]);
  assert.deepEqual(h.mutationCalls, []);
});

test("Teacher plus Department Admin uses Admin-branch precedence", async () => {
  const h = harness("teacher", { additionalRoles: ["department_admin"] });

  await h.service.getCourseOfferingLearningOutcomes("offering-a");

  assert.deepEqual(h.calls, [
    { kind: "department-read", args: ["department-a", "offering-a"] },
  ]);
  assert.deepEqual(h.mutationCalls, []);
});

test("Student and unsupported roles fail before learning-outcomes repository access", async (t) => {
  for (const role of ["student", "auditor"] as const) {
    await t.test(role, async () => {
      const h = harness(role);

      await assert.rejects(
        h.service.getCourseOfferingLearningOutcomes("offering-a"),
        ForbiddenException,
      );
      assert.deepEqual(h.calls, []);
      assert.deepEqual(h.mutationCalls, []);
    });
  }
});

test("all inaccessible or malformed null results use one generic safe not-found", async () => {
  const h = harness("teacher", { result: null });

  await assert.rejects(
    h.service.getCourseOfferingLearningOutcomes("offering-secret"),
    (error: unknown) =>
      error instanceof NotFoundException &&
      error.message === "Course offering learning outcomes not found",
  );
  assert.deepEqual(h.calls, [
    {
      kind: "teacher-read",
      args: ["department-a", "offering-secret", "teacher-user"],
    },
  ]);
  assert.deepEqual(h.mutationCalls, []);
});
