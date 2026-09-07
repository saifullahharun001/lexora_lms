import assert from "node:assert/strict";
import test from "node:test";

import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { CourseOutlineStatus } from "@prisma/client";

import { AcademicService } from "./academic.service";

type Role = "department_admin" | "teacher" | "student" | "support";

function activationGrant(overrides: Record<string, unknown> = {}) {
  return {
    resource: "course-management.course-outline",
    action: "activate",
    scope: "department",
    source: {
      departmentId: "department-a",
      userRoleId: "support-user-role",
      roleId: "support-role",
    },
    ...overrides,
  };
}

function harness(options: {
  role?: Role;
  permissions?: Array<Record<string, unknown>>;
  stateResult?: Record<string, unknown>;
  replacementResult?: Record<string, unknown>;
  activationResult?: Record<string, unknown>;
} = {}) {
  const role = options.role ?? "teacher";
  const calls: Array<{ method: string; input: unknown }> = [];
  const repository = {
    getCourseOutlineState: async (input: unknown) => {
      calls.push({ method: "state", input });
      return (
        options.stateResult ?? {
          outcome: "FOUND",
          state: {
            activeVersion: null,
            openVersion: null,
            latestVersionNumber: null,
            versions: [],
          },
        }
      );
    },
    replaceActiveCourseOutlineVersion: async (input: unknown) => {
      calls.push({ method: "replace", input });
      return (
        options.replacementResult ?? {
          outcome: "REPLACED",
          courseOutlineVersion: {
            id: "replacement",
            status: CourseOutlineStatus.ACTIVE,
          },
        }
      );
    },
    activateCourseOutlineVersion: async (input: unknown) => {
      calls.push({ method: "activate", input });
      return (
        options.activationResult ?? {
          outcome: "ACTIVATED",
          courseOutlineVersion: {
            id: "replacement",
            status: CourseOutlineStatus.ACTIVE,
          },
        }
      );
    },
    updateCourseOutlineStructuredContent: async (input: unknown) => {
      calls.push({ method: "structured", input });
      return {
        outcome: "UPDATED",
        courseOutlineVersion: { id: "outline-a" },
      };
    },
  };
  const context = {
    requestId: "request-a",
    audit: { ipAddress: "127.0.0.1", userAgent: "test-agent" },
    department: {
      kind: "department",
      departmentId: "forged-header-department",
      source: "header",
    },
    principal: {
      isAuthenticated: true,
      actorType: "user",
      actorId: `${role}-user`,
      activeDepartmentId: "department-a",
      roleAssignments: [
        {
          userRoleId:
            role === "support" ? "support-user-role" : `${role}-user-role`,
          roleId: role === "support" ? "support-role" : `${role}-role`,
          departmentId: "department-a",
          role,
        },
      ],
      permissions: options.permissions ?? [],
    },
  };

  return {
    calls,
    context,
    service: new AcademicService(
      repository as never,
      {} as never,
      { get: () => context } as never,
    ),
  };
}

test("state read scopes Department Admin to the principal department", async () => {
  const h = harness({ role: "department_admin" });
  await h.service.getCourseOutlineState("offering-a");
  assert.deepEqual(h.calls[0], {
    method: "state",
    input: {
      departmentId: "department-a",
      courseOfferingId: "offering-a",
      access: { kind: "DEPARTMENT_ADMIN" },
    },
  });
});

test("state read scopes Teacher to the exact actor assignment lookup", async () => {
  const h = harness({ role: "teacher" });
  await h.service.getCourseOutlineState("offering-a");
  assert.deepEqual(h.calls[0], {
    method: "state",
    input: {
      departmentId: "department-a",
      courseOfferingId: "offering-a",
      access: {
        kind: "ASSIGNED_TEACHER",
        actorUserId: "teacher-user",
      },
    },
  });
});

test("unassigned and cross-department state IDs fail as safe not-found", async () => {
  for (const role of ["teacher", "department_admin"] as const) {
    const h = harness({ role, stateResult: { outcome: "NOT_FOUND" } });
    await assert.rejects(
      h.service.getCourseOutlineState("hidden-offering"),
      NotFoundException,
    );
  }
});

test("Student state read is forbidden before repository access", async () => {
  const h = harness({ role: "student" });
  await assert.rejects(
    h.service.getCourseOutlineState("offering-a"),
    ForbiddenException,
  );
  assert.deepEqual(h.calls, []);
});

test("state integrity failures map to controlled conflict", async () => {
  const h = harness({
    role: "department_admin",
    stateResult: { outcome: "INTEGRITY_CONFLICT" },
  });
  await assert.rejects(
    h.service.getCourseOutlineState("offering-a"),
    ConflictException,
  );
});

test("replacement uses exact loaded activation grant provenance and principal metadata", async () => {
  const h = harness({
    role: "support",
    permissions: [activationGrant()],
  });
  await h.service.replaceActiveCourseOutlineVersion(
    "offering-a",
    "replacement",
  );
  assert.deepEqual(h.calls[0], {
    method: "replace",
    input: {
      departmentId: "department-a",
      courseOfferingId: "offering-a",
      courseOutlineVersionId: "replacement",
      actorUserId: "support-user",
      authorizationUserRoleId: "support-user-role",
      authorizationRoleId: "support-role",
      requestId: "request-a",
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
    },
  });
});

test("wildcard, wrong action, wrong scope, and forged provenance cannot authorize replacement", async () => {
  for (const grant of [
    activationGrant({ resource: "course-management", action: "*" }),
    activationGrant({ action: "manage" }),
    activationGrant({ scope: "self" }),
    activationGrant({
      source: {
        departmentId: "department-b",
        userRoleId: "support-user-role",
        roleId: "support-role",
      },
    }),
  ]) {
    const h = harness({ role: "support", permissions: [grant] });
    await assert.rejects(
      h.service.replaceActiveCourseOutlineVersion(
        "offering-a",
        "replacement",
      ),
      ForbiddenException,
    );
    assert.deepEqual(h.calls, []);
  }
});

test("normal activation never calls replacement and preserves active conflict", async () => {
  const h = harness({
    role: "support",
    permissions: [activationGrant()],
    activationResult: { outcome: "ACTIVE_OUTLINE_ALREADY_EXISTS" },
  });
  await assert.rejects(
    h.service.activateCourseOutlineVersion("offering-a", "replacement"),
    ConflictException,
  );
  assert.deepEqual(
    h.calls.map((call) => call.method),
    ["activate"],
  );
});

test("structured mutation is Teacher-only and derives exact actor/department", async () => {
  const h = harness({ role: "teacher" });
  await h.service.updateCourseOutlineStructuredContent(
    "offering-a",
    "outline-a",
    { topicPlans: [] },
  );
  assert.deepEqual(h.calls[0], {
    method: "structured",
    input: {
      departmentId: "department-a",
      courseOfferingId: "offering-a",
      courseOutlineVersionId: "outline-a",
      actorUserId: "teacher-user",
      topicPlans: [],
      supplementalResources: undefined,
      assessmentSchedule: undefined,
      requestId: "request-a",
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
    },
  });

  const student = harness({ role: "student" });
  await assert.rejects(
    student.service.updateCourseOutlineStructuredContent(
      "offering-a",
      "outline-a",
      { topicPlans: [] },
    ),
    ForbiddenException,
  );
  assert.deepEqual(student.calls, []);
});
