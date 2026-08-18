import assert from "node:assert/strict";
import test from "node:test";

import { ForbiddenException, NotFoundException } from "@nestjs/common";

import { AcademicService } from "./academic.service";

type Role = "department_admin" | "teacher" | "student";

const safeSyllabus = {
  id: "syllabus-a",
  code: "SYL-1",
  versionNumber: 1,
  status: "RETIRED",
  curriculumCourse: { id: "curriculum-a" },
};

function harness(
  role: Role,
  options: {
    result?: unknown | null;
    additionalRoles?: Role[];
  } = {},
) {
  const calls: Array<{ kind: string; args: unknown[] }> = [];
  const mutationCalls: string[] = [];
  const result = options.result === undefined ? safeSyllabus : options.result;
  const repository = {
    findBoundSyllabusVersionForCourseOffering: async (...args: unknown[]) => {
      calls.push({ kind: "department-read", args });
      return result;
    },
    findBoundSyllabusVersionForCourseOfferingForTeacher: async (
      ...args: unknown[]
    ) => {
      calls.push({ kind: "teacher-read", args });
      return result;
    },
    bindCourseOfferingSyllabus: async () => {
      mutationCalls.push("bind");
      throw new Error("unexpected mutation");
    },
    updateCourseOffering: async () => {
      mutationCalls.push("update-offering");
      throw new Error("unexpected mutation");
    },
    transitionSyllabusVersion: async () => {
      mutationCalls.push("transition-syllabus");
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

test("assigned Teacher read uses exact department, offering, and actor and returns bound safe syllabus", async () => {
  const h = harness("teacher");

  assert.deepEqual(
    await h.service.getCourseOfferingSyllabus("offering-a"),
    safeSyllabus,
  );
  assert.deepEqual(h.calls, [
    {
      kind: "teacher-read",
      args: ["department-a", "offering-a", "teacher-user"],
    },
  ]);
  assert.deepEqual(h.mutationCalls, []);
});

test("Teacher inaccessible, cross-department, and unbound results share safe NotFound behavior", async (t) => {
  for (const scenario of ["unassigned", "cross-department", "unbound"]) {
    await t.test(scenario, async () => {
      const h = harness("teacher", { result: null });
      await assert.rejects(
        h.service.getCourseOfferingSyllabus(`offering-${scenario}`),
        (error: unknown) =>
          error instanceof NotFoundException &&
          error.message === "Syllabus version not found",
      );
      assert.deepEqual(h.mutationCalls, []);
    });
  }
});

test("Department Admin and Teacher plus Department Admin use department-scoped read", async () => {
  for (const h of [
    harness("department_admin"),
    harness("teacher", { additionalRoles: ["department_admin"] }),
  ]) {
    assert.deepEqual(
      await h.service.getCourseOfferingSyllabus("offering-a"),
      safeSyllabus,
    );
    assert.deepEqual(h.calls, [
      {
        kind: "department-read",
        args: ["department-a", "offering-a"],
      },
    ]);
    assert.deepEqual(h.mutationCalls, []);
  }
});

test("Student fails closed before any bound-syllabus repository access", async () => {
  const h = harness("student");

  await assert.rejects(
    h.service.getCourseOfferingSyllabus("offering-a"),
    ForbiddenException,
  );
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.mutationCalls, []);
});
