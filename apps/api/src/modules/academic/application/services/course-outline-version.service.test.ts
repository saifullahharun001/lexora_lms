import assert from "node:assert/strict";
import test from "node:test";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { CourseOutlineStatus } from "@prisma/client";

import { AcademicService } from "./academic.service";

type Role =
  | "department_admin"
  | "teacher"
  | "student"
  | "auditor"
  | "support";

const outline = {
  id: "outline-a",
  departmentId: "department-a",
  courseOfferingId: "offering-a",
  curriculumCourseId: "curriculum-a",
  syllabusVersionId: "syllabus-a",
  versionNumber: 2,
  status: CourseOutlineStatus.DRAFT,
  courseSummary: "Summary",
  deliveryPlan: null,
  teachingStrategies: null,
  assessmentStrategy: null,
  evaluationPolicy: null,
  makeUpProcedure: null,
  submittedAt: null,
  approvedAt: null,
  activatedAt: null,
  archivedAt: null,
  createdAt: new Date("2026-08-20T00:00:00.000Z"),
  updatedAt: new Date("2026-08-20T00:00:00.000Z"),
};

function approvalGrant(
  role: Role,
  overrides: Record<string, unknown> = {},
) {
  return {
    resource: "course-management.course-outline",
    action: "approve",
    scope: "department",
    source: {
      departmentId: "department-a",
      userRoleId: `${role}-assignment-0`,
      roleId: `${role}-role-0`,
    },
    ...overrides,
  };
}

function activationGrant(role: Role, overrides: Record<string, unknown> = {}) {
  return {
    resource: "course-management.course-outline",
    action: "activate",
    scope: "department",
    source: {
      departmentId: "department-a",
      userRoleId: `${role}-assignment-0`,
      roleId: `${role}-role-0`,
    },
    ...overrides,
  };
}

function archivalGrant(role: Role, overrides: Record<string, unknown> = {}) {
  return {
    resource: "course-management.course-outline",
    action: "archive",
    scope: "department",
    source: {
      departmentId: "department-a",
      userRoleId: `${role}-assignment-0`,
      roleId: `${role}-role-0`,
    },
    ...overrides,
  };
}

function harness(
  role: Role,
  options: {
    additionalRoles?: Role[];
    createResult?: unknown;
    updateResult?: unknown;
    submitResult?: unknown;
    coordinatorReviewResult?: unknown;
    returnForCorrectionResult?: unknown;
    approvalResult?: unknown;
    activationResult?: unknown;
    archivalResult?: unknown;
    permissions?: unknown[];
    listResult?: unknown;
    detailResult?: unknown;
  } = {},
) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const repository = {
    createCourseOutlineVersion: async (...args: unknown[]) => {
      calls.push({ method: "create", args });
      return options.createResult ?? {
        outcome: "CREATED",
        courseOutlineVersion: outline,
      };
    },
    findCourseOutlineVersions: async (...args: unknown[]) => {
      calls.push({ method: "admin-list", args });
      return options.listResult === undefined ? [outline] : options.listResult;
    },
    findCourseOutlineVersionsForTeacher: async (...args: unknown[]) => {
      calls.push({ method: "teacher-list", args });
      return options.listResult === undefined ? [outline] : options.listResult;
    },
    findCourseOutlineVersionById: async (...args: unknown[]) => {
      calls.push({ method: "admin-detail", args });
      return options.detailResult === undefined ? outline : options.detailResult;
    },
    findCourseOutlineVersionByIdForTeacher: async (...args: unknown[]) => {
      calls.push({ method: "teacher-detail", args });
      return options.detailResult === undefined ? outline : options.detailResult;
    },
    updateCourseOutlineVersion: async (...args: unknown[]) => {
      calls.push({ method: "update", args });
      return options.updateResult ?? {
        outcome: "UPDATED",
        courseOutlineVersion: outline,
      };
    },
    submitCourseOutlineVersion: async (...args: unknown[]) => {
      calls.push({ method: "submit", args });
      return (
        options.submitResult ?? {
          outcome: "SUBMITTED",
          courseOutlineVersion: {
            ...outline,
            status: CourseOutlineStatus.SUBMITTED_BY_TEACHER,
            submittedAt: new Date("2026-08-20T01:00:00.000Z"),
          },
        }
      );
    },
    startCourseOutlineCoordinatorReview: async (...args: unknown[]) => {
      calls.push({ method: "coordinator-review", args });
      return (
        options.coordinatorReviewResult ?? {
          outcome: "COORDINATOR_REVIEW_STARTED",
          courseOutlineVersion: {
            ...outline,
            status: CourseOutlineStatus.COORDINATOR_REVIEW,
            submittedAt: new Date("2026-08-20T01:00:00.000Z"),
          },
        }
      );
    },
    returnCourseOutlineForCorrection: async (...args: unknown[]) => {
      calls.push({ method: "return-for-correction", args });
      return (
        options.returnForCorrectionResult ?? {
          outcome: "RETURNED_FOR_CORRECTION",
          courseOutlineVersion: {
            ...outline,
            status: CourseOutlineStatus.RETURNED_FOR_CORRECTION,
            submittedAt: new Date("2026-08-20T01:00:00.000Z"),
          },
          courseOutlineCorrectionRequest: {
            id: "correction-req-1",
            departmentId: "department-a",
            courseOfferingId: "offering-a",
            courseOutlineVersionId: "outline-a",
            batchCoordinatorAssignmentId: "coordinator-assignment-a",
            actorUserId: "coordinator-a",
            reason: "Needs more info",
            returnedAt: new Date("2026-08-20T01:00:00.000Z"),
            createdAt: new Date("2026-08-20T01:00:00.000Z"),
          }
        }
      );
    },
    approveCourseOutlineVersion: async (...args: unknown[]) => {
      calls.push({ method: "approve", args });
      return (
        options.approvalResult ?? {
          outcome: "APPROVED",
          courseOutlineVersion: {
            ...outline,
            status: CourseOutlineStatus.APPROVED,
            submittedAt: new Date("2026-08-20T01:00:00.000Z"),
            approvedAt: new Date("2026-08-20T02:00:00.000Z"),
          },
        }
      );
    },
    activateCourseOutlineVersion: async (...args: unknown[]) => {
      calls.push({ method: "activate", args });
      return (
        options.activationResult ?? {
          outcome: "ACTIVATED",
          courseOutlineVersion: {
            ...outline,
            status: CourseOutlineStatus.ACTIVE,
            submittedAt: new Date("2026-08-20T01:00:00.000Z"),
            approvedAt: new Date("2026-08-20T02:00:00.000Z"),
            activatedAt: new Date("2026-08-20T03:00:00.000Z"),
          },
        }
      );
    },
    archiveCourseOutlineVersion: async (...args: unknown[]) => {
      calls.push({ method: "archive", args });
      return (
        options.archivalResult ?? {
          outcome: "ARCHIVED",
          courseOutlineVersion: {
            ...outline,
            status: CourseOutlineStatus.ARCHIVED,
            submittedAt: new Date("2026-08-20T01:00:00.000Z"),
            approvedAt: new Date("2026-08-20T02:00:00.000Z"),
            activatedAt: new Date("2026-08-20T03:00:00.000Z"),
            archivedAt: new Date("2026-08-20T04:00:00.000Z"),
          },
        }
      );
    },
  };
  const roles = [role, ...(options.additionalRoles ?? [])];
  const context = {
    requestId: "request-a",
    audit: { ipAddress: "127.0.0.1", userAgent: "test-agent" },
    department: { departmentId: "forged-header-department" },
    principal: {
      actorId: `${role}-user`,
      actorType: "user",
      isAuthenticated: true,
      activeDepartmentId: "department-a",
      roleAssignments: roles.map((assignedRole, index) => ({
        userRoleId: `${assignedRole}-assignment-${index}`,
        roleId: `${assignedRole}-role-${index}`,
        departmentId: "department-a",
        role: assignedRole,
      })),
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

test("assigned Teacher creation derives department, actor, offering identity, and audit request metadata from the server context", async () => {
  const h = harness("teacher");
  assert.equal(
    await h.service.createCourseOutlineVersion("offering-a", {
      courseSummary: "Summary",
      evaluationPolicy: null,
    }),
    outline,
  );

  const input = h.calls[0]?.args[0] as Record<string, unknown>;
  assert.equal(input.departmentId, "department-a");
  assert.equal(input.courseOfferingId, "offering-a");
  assert.equal(input.actorUserId, "teacher-user");
  assert.equal("teacherUserId" in input, false);
  assert.equal(input.requestId, "request-a");
  assert.equal(input.ipAddress, "127.0.0.1");
  assert.equal(input.userAgent, "test-agent");
  for (const serverField of [
    "curriculumCourseId",
    "syllabusVersionId",
    "versionNumber",
    "status",
  ]) {
    assert.equal(serverField in input, false);
  }
});

test("Department Admin without Teacher authority, Student, and unsupported roles cannot author", async () => {
  for (const h of [
    harness("department_admin"),
    harness("student"),
    harness("auditor"),
    harness("support"),
  ]) {
    await assert.rejects(
      h.service.createCourseOutlineVersion("offering-a", {}),
      ForbiddenException,
    );
    await assert.rejects(
      h.service.updateCourseOutlineVersion("offering-a", "outline-a", {
        courseSummary: "Changed",
      }),
      ForbiddenException,
    );
    assert.deepEqual(h.calls, []);
  }
});

test("Teacher plus Department Admin dual-role principal may author under mandatory Teacher assignment authority", async () => {
  const h = harness("teacher", { additionalRoles: ["department_admin"] });
  assert.equal(
    await h.service.createCourseOutlineVersion("offering-a", {
      courseSummary: "Summary",
    }),
    outline,
  );
  assert.equal(
    await h.service.updateCourseOutlineVersion("offering-a", "outline-a", {
      deliveryPlan: "Plan",
    }),
    outline,
  );
  assert.deepEqual(
    h.calls.map((call) => call.method),
    ["create", "update"],
  );
  for (const call of h.calls) {
    const input = call.args[0] as Record<string, unknown>;
    assert.equal(input.actorUserId, "teacher-user");
    assert.equal("teacherUserId" in input, false);
  }
});

test("Teacher reads use exact principal department, offering, actor assignment scope, and nested version id", async () => {
  const h = harness("teacher");
  assert.deepEqual(await h.service.listCourseOutlineVersions("offering-a"), [
    outline,
  ]);
  assert.equal(
    await h.service.getCourseOutlineVersion("offering-a", "outline-a"),
    outline,
  );
  assert.deepEqual(h.calls, [
    {
      method: "teacher-list",
      args: ["department-a", "offering-a", "teacher-user"],
    },
    {
      method: "teacher-detail",
      args: ["department-a", "offering-a", "outline-a", "teacher-user"],
    },
  ]);
});

test("Department Admin receives department-scoped reads without Teacher assignment scope", async () => {
  const h = harness("department_admin");
  await h.service.listCourseOutlineVersions("offering-a");
  await h.service.getCourseOutlineVersion("offering-a", "outline-a");
  assert.deepEqual(h.calls, [
    { method: "admin-list", args: ["department-a", "offering-a"] },
    {
      method: "admin-detail",
      args: ["department-a", "offering-a", "outline-a"],
    },
  ]);
});

test("Student and unsupported roles fail closed before Course Outline repository reads", async () => {
  for (const role of ["student", "auditor", "support"] as const) {
    const h = harness(role);
    await assert.rejects(
      h.service.listCourseOutlineVersions("offering-a"),
      ForbiddenException,
    );
    await assert.rejects(
      h.service.getCourseOutlineVersion("offering-a", "outline-a"),
      ForbiddenException,
    );
    assert.deepEqual(h.calls, []);
  }
});

test("inaccessible, cross-department, unassigned, inactive, unassignedAt, and archived assignment reads share safe not-found behavior", async () => {
  for (const scenario of [
    "missing",
    "cross-department",
    "unassigned",
    "inactive",
    "unassigned-at",
    "archived-assignment",
  ]) {
    const h = harness("teacher", { listResult: null, detailResult: null });
    await assert.rejects(
      h.service.listCourseOutlineVersions(`offering-${scenario}`),
      NotFoundException,
    );
    await assert.rejects(
      h.service.getCourseOutlineVersion(
        `offering-${scenario}`,
        "outline-direct-id",
      ),
      NotFoundException,
    );
  }
});

test("Teacher PATCH supplies exact nested scope, six-field input, and one server audit/authorization identity", async () => {
  const h = harness("teacher");
  assert.equal(
    await h.service.updateCourseOutlineVersion("offering-a", "outline-a", {
      courseSummary: "Changed",
      deliveryPlan: null,
    }),
    outline,
  );
  const input = h.calls[0]?.args[0] as Record<string, unknown>;
  assert.equal(input.departmentId, "department-a");
  assert.equal(input.courseOfferingId, "offering-a");
  assert.equal(input.courseOutlineVersionId, "outline-a");
  assert.equal(input.actorUserId, "teacher-user");
  assert.equal("teacherUserId" in input, false);
  assert.equal("changedFields" in input, false);
  assert.equal(input.courseSummary, "Changed");
  assert.equal(input.deliveryPlan, null);
});

test("direct service runtime input cannot forward lifecycle, version, or academic identity fields", async () => {
  const h = harness("teacher");
  await h.service.updateCourseOutlineVersion(
    "offering-a",
    "outline-a",
    {
      courseSummary: "  Safe change  ",
      status: CourseOutlineStatus.APPROVED,
      versionNumber: 99,
      departmentId: "department-b",
      courseOfferingId: "offering-b",
      curriculumCourseId: "curriculum-b",
      syllabusVersionId: "syllabus-b",
      submittedAt: new Date(),
      approvedAt: new Date(),
      activatedAt: new Date(),
      archivedAt: new Date(),
    } as never,
  );

  const input = h.calls[0]!.args[0] as Record<string, unknown>;
  assert.equal(input.courseSummary, "Safe change");
  assert.equal(input.departmentId, "department-a");
  assert.equal(input.courseOfferingId, "offering-a");
  assert.equal(input.courseOutlineVersionId, "outline-a");
  for (const forgedField of [
    "status",
    "versionNumber",
    "curriculumCourseId",
    "syllabusVersionId",
    "submittedAt",
    "approvedAt",
    "activatedAt",
    "archivedAt",
  ]) {
    assert.equal(forgedField in input, false);
  }
  assert.equal(outline.status, CourseOutlineStatus.DRAFT);
});

test("direct create service input forwards only the six narratives plus server-derived authority", async () => {
  const h = harness("teacher");
  await h.service.createCourseOutlineVersion("offering-a", {
    courseSummary: "  Allowed summary  ",
    status: CourseOutlineStatus.ACTIVE,
    versionNumber: 77,
    departmentId: "department-b",
    courseOfferingId: "offering-b",
    curriculumCourseId: "curriculum-b",
    syllabusVersionId: "syllabus-b",
    approvedAt: new Date(),
  } as never);

  const input = h.calls[0]!.args[0] as Record<string, unknown>;
  assert.equal(input.courseSummary, "Allowed summary");
  assert.equal(input.departmentId, "department-a");
  assert.equal(input.courseOfferingId, "offering-a");
  assert.equal(input.actorUserId, "teacher-user");
  for (const forgedField of [
    "status",
    "versionNumber",
    "curriculumCourseId",
    "syllabusVersionId",
    "approvedAt",
  ]) {
    assert.equal(forgedField in input, false);
  }
});

test("empty PATCH and repository-confirmed no-op PATCH are rejected without success", async () => {
  const empty = harness("teacher");
  await assert.rejects(
    empty.service.updateCourseOutlineVersion("offering-a", "outline-a", {}),
    BadRequestException,
  );
  assert.deepEqual(empty.calls, []);

  const noOp = harness("teacher", { updateResult: { outcome: "NO_CHANGES" } });
  await assert.rejects(
    noOp.service.updateCourseOutlineVersion("offering-a", "outline-a", {
      courseSummary: "Summary",
    }),
    BadRequestException,
  );
});

test("repository outcomes map to safe not-found and controlled conflicts", async () => {
  for (const outcome of ["OFFERING_NOT_FOUND", "OUTLINE_NOT_FOUND"] as const) {
    const h = harness("teacher", { updateResult: { outcome } });
    await assert.rejects(
      h.service.updateCourseOutlineVersion("offering-a", "outline-a", {
        courseSummary: "Changed",
      }),
      NotFoundException,
    );
  }
  for (const outcome of ["OUTLINE_NOT_EDITABLE", "VERSION_CONFLICT"] as const) {
    const h = harness("teacher", { updateResult: { outcome } });
    await assert.rejects(
      h.service.updateCourseOutlineVersion("offering-a", "outline-a", {
        courseSummary: "Changed",
      }),
      ConflictException,
    );
  }
  for (const outcome of [
    "OFFERING_NOT_FULLY_BOUND",
    "OPEN_VERSION_ALREADY_EXISTS",
    "VERSION_CONFLICT",
  ] as const) {
    const h = harness("teacher", { createResult: { outcome } });
    await assert.rejects(
      h.service.createCourseOutlineVersion("offering-a", {}),
      ConflictException,
    );
  }
});

test("assigned Teacher submission derives all authority, transition, and audit metadata from server context", async () => {
  const h = harness("teacher");
  const result = await h.service.submitCourseOutlineVersion(
    "offering-a",
    "outline-a",
  );
  assert.equal(result.status, CourseOutlineStatus.SUBMITTED_BY_TEACHER);

  const input = h.calls[0]!.args[0] as Record<string, unknown>;
  assert.equal(input.departmentId, "department-a");
  assert.equal(input.courseOfferingId, "offering-a");
  assert.equal(input.courseOutlineVersionId, "outline-a");
  assert.equal(input.actorUserId, "teacher-user");
  assert.ok(input.transitionAt instanceof Date);
  assert.equal(input.requestId, "request-a");
  assert.equal(input.ipAddress, "127.0.0.1");
  assert.equal(input.userAgent, "test-agent");
  for (const forbiddenField of [
    "status",
    "submittedAt",
    "curriculumCourseId",
    "syllabusVersionId",
    "versionNumber",
    "teacherUserId",
  ]) {
    assert.equal(forbiddenField in input, false);
  }
});

test("submission is Teacher-only at the service boundary, including against Department Admin wildcard authority", async () => {
  for (const role of [
    "department_admin",
    "student",
    "auditor",
    "support",
  ] as const) {
    const h = harness(role);
    await assert.rejects(
      h.service.submitCourseOutlineVersion("offering-a", "outline-a"),
      ForbiddenException,
    );
    assert.deepEqual(h.calls, []);
  }
});

test("Teacher plus Department Admin may submit only under Teacher repository assignment authority", async () => {
  const h = harness("teacher", { additionalRoles: ["department_admin"] });
  await h.service.submitCourseOutlineVersion("offering-a", "outline-a");
  assert.equal(h.calls[0]!.method, "submit");
  assert.equal(
    (h.calls[0]!.args[0] as { actorUserId: string }).actorUserId,
    "teacher-user",
  );
});

test("submission repository outcomes map to safe not-found and controlled conflict", async () => {
  for (const outcome of ["OFFERING_NOT_FOUND", "OUTLINE_NOT_FOUND"] as const) {
    const h = harness("teacher", { submitResult: { outcome } });
    await assert.rejects(
      h.service.submitCourseOutlineVersion("offering-a", "outline-a"),
      NotFoundException,
    );
  }
  for (const outcome of [
    "OUTLINE_NOT_SUBMITTABLE",
    "VERSION_CONFLICT",
  ] as const) {
    const h = harness("teacher", { submitResult: { outcome } });
    await assert.rejects(
      h.service.submitCourseOutlineVersion("offering-a", "outline-a"),
      ConflictException,
    );
  }
});

test("Coordinator review derives actor and department from the authenticated principal without forwarding authority identities", async () => {
  for (const role of ["teacher", "department_admin"] as const) {
    const h = harness(role);
    const result = await h.service.startCourseOutlineCoordinatorReview(
      "offering-a",
      "outline-a",
    );
    assert.equal(result.status, CourseOutlineStatus.COORDINATOR_REVIEW);

    const input = h.calls[0]!.args[0] as Record<string, unknown>;
    assert.equal(input.departmentId, "department-a");
    assert.equal(input.actorUserId, `${role}-user`);
    assert.equal(input.courseOfferingId, "offering-a");
    assert.equal(input.courseOutlineVersionId, "outline-a");
    assert.equal(input.requestId, "request-a");
    assert.equal(input.ipAddress, "127.0.0.1");
    assert.equal(input.userAgent, "test-agent");
    for (const forbiddenField of [
      "studentBatchId",
      "academicTermId",
      "batchCoordinatorAssignmentId",
      "status",
      "transitionAt",
    ]) {
      assert.equal(forbiddenField in input, false);
    }
  }
});

test("Teacher and Department Admin coarse admission does not bypass exact Coordinator assignment authority", async () => {
  for (const role of ["teacher", "department_admin"] as const) {
    const h = harness(role, {
      coordinatorReviewResult: {
        outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND",
      },
    });
    await assert.rejects(
      h.service.startCourseOutlineCoordinatorReview("offering-a", "outline-a"),
      NotFoundException,
    );
  }
});

test("Coordinator review maps hidden scope to 404 and lifecycle or exhausted concurrency to 409", async () => {
  for (const outcome of [
    "OFFERING_OR_AUTHORITY_NOT_FOUND",
    "OUTLINE_NOT_FOUND",
  ] as const) {
    const h = harness("teacher", { coordinatorReviewResult: { outcome } });
    await assert.rejects(
      h.service.startCourseOutlineCoordinatorReview("offering-a", "outline-a"),
      NotFoundException,
    );
  }

  for (const outcome of [
    "OUTLINE_NOT_REVIEWABLE",
    "CONCURRENT_CONFLICT",
  ] as const) {
    const h = harness("teacher", { coordinatorReviewResult: { outcome } });
    await assert.rejects(
      h.service.startCourseOutlineCoordinatorReview("offering-a", "outline-a"),
      ConflictException,
    );
  }
});

test("Coordinator review requires a complete authenticated user principal before repository access", async () => {
  for (const principalOverride of [
    { isAuthenticated: false },
    { actorType: "service" },
    { actorId: "" },
    { activeDepartmentId: null },
  ]) {
    const h = harness("teacher");
    Object.assign(h.context.principal, principalOverride);
    await assert.rejects(
      h.service.startCourseOutlineCoordinatorReview("offering-a", "outline-a"),
      BadRequestException,
    );
    assert.deepEqual(h.calls, []);
  }
});

test("Return for correction derives actor and department from authenticated principal without forwarding authority identities", async () => {
  for (const role of ["teacher", "department_admin"] as const) {
    const h = harness(role);
    const result = await h.service.returnCourseOutlineForCorrection(
      "offering-a",
      "outline-a",
      "Needs more details",
    );
    assert.equal(result.courseOutlineVersion.status, CourseOutlineStatus.RETURNED_FOR_CORRECTION);

    const input = h.calls[0]!.args[0] as Record<string, unknown>;
    assert.equal(input.departmentId, "department-a");
    assert.equal(input.actorUserId, `${role}-user`);
    assert.equal(input.courseOfferingId, "offering-a");
    assert.equal(input.courseOutlineVersionId, "outline-a");
    assert.equal(input.reason, "Needs more details");
    assert.equal(input.requestId, "request-a");
    assert.equal(input.ipAddress, "127.0.0.1");
    assert.equal(input.userAgent, "test-agent");
    for (const forbiddenField of [
      "studentBatchId",
      "academicTermId",
      "batchCoordinatorAssignmentId",
      "status",
      "returnedAt",
    ]) {
      assert.equal(forbiddenField in input, false);
    }
  }
});

test("Return for correction requires exact Coordinator assignment authority (coarse admission bypass fails)", async () => {
  for (const role of ["teacher", "department_admin"] as const) {
    const h = harness(role, {
      returnForCorrectionResult: {
        outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND",
      },
    });
    await assert.rejects(
      h.service.returnCourseOutlineForCorrection(
        "offering-a",
        "outline-a",
        "reason",
      ),
      NotFoundException,
    );
  }
});

test("Return for correction maps hidden scope to 404 and lifecycle or concurrency to 409", async () => {
  for (const outcome of [
    "OFFERING_OR_AUTHORITY_NOT_FOUND",
    "OUTLINE_NOT_FOUND",
  ] as const) {
    const h = harness("teacher", { returnForCorrectionResult: { outcome } });
    await assert.rejects(
      h.service.returnCourseOutlineForCorrection(
        "offering-a",
        "outline-a",
        "reason",
      ),
      NotFoundException,
    );
  }

  for (const outcome of [
    "OUTLINE_NOT_RETURNABLE",
    "CONCURRENT_CONFLICT",
  ] as const) {
    const h = harness("teacher", { returnForCorrectionResult: { outcome } });
    await assert.rejects(
      h.service.returnCourseOutlineForCorrection(
        "offering-a",
        "outline-a",
        "reason",
      ),
      ConflictException,
    );
  }
});

test("Return for correction requires a complete authenticated user principal before repository access", async () => {
  for (const principalOverride of [
    { isAuthenticated: false },
    { actorType: "service" },
    { actorId: "" },
    { activeDepartmentId: null },
  ]) {
    const h = harness("teacher");
    Object.assign(h.context.principal, principalOverride);
    await assert.rejects(
      h.service.returnCourseOutlineForCorrection(
        "offering-a",
        "outline-a",
        "reason",
      ),
      BadRequestException,
    );
    assert.deepEqual(h.calls, []);
  }
});

test("approval derives actor, department, audit metadata, and exact permission provenance only from the principal", async () => {
  const h = harness("support", { permissions: [approvalGrant("support")] });
  const result = await h.service.approveCourseOutlineVersion(
    "offering-a",
    "outline-a",
  );
  assert.equal(result.status, CourseOutlineStatus.APPROVED);

  const input = h.calls[0]!.args[0] as Record<string, unknown>;
  assert.deepEqual(input, {
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    courseOutlineVersionId: "outline-a",
    actorUserId: "support-user",
    authorizationUserRoleId: "support-assignment-0",
    authorizationRoleId: "support-role-0",
    requestId: "request-a",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
  });
  for (const clientControlledField of [
    "status",
    "approvedAt",
    "approverUserId",
    "studentBatchId",
    "academicTermId",
    "curriculumCourseId",
    "syllabusVersionId",
    "transitionAt",
  ]) {
    assert.equal(clientControlledField in input, false);
  }
});

test("ordinary role labels and malformed permission provenance cannot authorize approval", async () => {
  for (const role of [
    "department_admin",
    "teacher",
    "student",
    "auditor",
    "support",
  ] as const) {
    const h = harness(role);
    await assert.rejects(
      h.service.approveCourseOutlineVersion("offering-a", "outline-a"),
      ForbiddenException,
    );
    assert.deepEqual(h.calls, []);
  }

  for (const permission of [
    approvalGrant("support", { action: "manage" }),
    approvalGrant("support", { scope: "self" }),
    approvalGrant("support", {
      source: {
        departmentId: "department-b",
        userRoleId: "support-assignment-0",
        roleId: "support-role-0",
      },
    }),
  ]) {
    const h = harness("support", { permissions: [permission] });
    await assert.rejects(
      h.service.approveCourseOutlineVersion("offering-a", "outline-a"),
      ForbiddenException,
    );
    assert.deepEqual(h.calls, []);
  }
});

test("approval rejects incomplete authenticated user context before repository mutation", async () => {
  for (const principalOverride of [
    { isAuthenticated: false },
    { actorType: "service" },
    { actorId: "" },
    { activeDepartmentId: null },
  ]) {
    const h = harness("support", { permissions: [approvalGrant("support")] });
    Object.assign(h.context.principal, principalOverride);
    await assert.rejects(
      h.service.approveCourseOutlineVersion("offering-a", "outline-a"),
      BadRequestException,
    );
    assert.deepEqual(h.calls, []);
  }
});

test("approval maps hidden scope to 404 and lifecycle or concurrency outcomes to 409", async () => {
  for (const outcome of [
    "OFFERING_OR_AUTHORITY_NOT_FOUND",
    "OUTLINE_NOT_FOUND",
  ] as const) {
    const h = harness("support", {
      permissions: [approvalGrant("support")],
      approvalResult: { outcome },
    });
    await assert.rejects(
      h.service.approveCourseOutlineVersion("offering-a", "outline-a"),
      NotFoundException,
    );
  }
  for (const outcome of [
    "OUTLINE_NOT_APPROVABLE",
    "CONCURRENT_CONFLICT",
  ] as const) {
    const h = harness("support", {
      permissions: [approvalGrant("support")],
      approvalResult: { outcome },
    });
    await assert.rejects(
      h.service.approveCourseOutlineVersion("offering-a", "outline-a"),
      ConflictException,
    );
  }
});

test("an approved Course Outline remains non-editable by its Teacher author", async () => {
  const h = harness("teacher", {
    permissions: [approvalGrant("teacher")],
    updateResult: { outcome: "OUTLINE_NOT_EDITABLE" },
  });
  const approved = await h.service.approveCourseOutlineVersion(
    "offering-a",
    "outline-a",
  );
  assert.equal(approved.id, "outline-a");
  assert.equal(approved.status, CourseOutlineStatus.APPROVED);

  await assert.rejects(
    h.service.updateCourseOutlineVersion("offering-a", "outline-a", {
      courseSummary: "Attacker rewrite after approval",
    }),
    ConflictException,
  );
  assert.deepEqual(
    h.calls.map((call) => call.method),
    ["approve", "update"],
  );
});

test("activation derives department, actor, audit context, and exact permission provenance only from the principal", async () => {
  const h = harness("support", { permissions: [activationGrant("support")] });
  const result = await h.service.activateCourseOutlineVersion(
    "offering-a",
    "outline-a",
  );
  assert.equal(result.status, CourseOutlineStatus.ACTIVE);

  const input = h.calls[0]!.args[0] as Record<string, unknown>;
  assert.deepEqual(input, {
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    courseOutlineVersionId: "outline-a",
    actorUserId: "support-user",
    authorizationUserRoleId: "support-assignment-0",
    authorizationRoleId: "support-role-0",
    requestId: "request-a",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
  });
  for (const clientControlledField of [
    "status",
    "activatedAt",
    "activeCourseOutlineVersionId",
    "departmentHeader",
    "studentBatchId",
    "academicTermId",
    "curriculumCourseId",
    "syllabusVersionId",
    "transitionAt",
  ]) {
    assert.equal(clientControlledField in input, false);
  }
});

test("ordinary roles, wildcard authority, and malformed provenance cannot authorize activation", async () => {
  for (const role of [
    "department_admin",
    "teacher",
    "student",
    "auditor",
    "support",
  ] as const) {
    const h = harness(role);
    await assert.rejects(
      h.service.activateCourseOutlineVersion("offering-a", "outline-a"),
      ForbiddenException,
    );
    assert.deepEqual(h.calls, []);
  }

  for (const permission of [
    activationGrant("support", {
      resource: "course-management",
      action: "*",
    }),
    activationGrant("support", { action: "manage" }),
    activationGrant("support", { scope: "self" }),
    activationGrant("support", {
      source: {
        departmentId: "department-b",
        userRoleId: "support-assignment-0",
        roleId: "support-role-0",
      },
    }),
  ]) {
    const h = harness("support", { permissions: [permission] });
    await assert.rejects(
      h.service.activateCourseOutlineVersion("offering-a", "outline-a"),
      ForbiddenException,
    );
    assert.deepEqual(h.calls, []);
  }
});

test("activation rejects incomplete authenticated user context before repository mutation", async () => {
  for (const principalOverride of [
    { isAuthenticated: false },
    { actorType: "service" },
    { actorId: "" },
    { activeDepartmentId: null },
  ]) {
    const h = harness("support", {
      permissions: [activationGrant("support")],
    });
    Object.assign(h.context.principal, principalOverride);
    await assert.rejects(
      h.service.activateCourseOutlineVersion("offering-a", "outline-a"),
      BadRequestException,
    );
    assert.deepEqual(h.calls, []);
  }
});

test("activation maps hidden outcomes to 404 and lifecycle, existing-active, or concurrent outcomes to 409", async () => {
  for (const outcome of [
    "OFFERING_OR_AUTHORITY_NOT_FOUND",
    "OUTLINE_NOT_FOUND",
  ] as const) {
    const h = harness("support", {
      permissions: [activationGrant("support")],
      activationResult: { outcome },
    });
    await assert.rejects(
      h.service.activateCourseOutlineVersion("offering-a", "outline-a"),
      NotFoundException,
    );
  }
  for (const outcome of [
    "OUTLINE_NOT_ACTIVATABLE",
    "ACTIVE_OUTLINE_ALREADY_EXISTS",
    "CONCURRENT_CONFLICT",
  ] as const) {
    const h = harness("support", {
      permissions: [activationGrant("support")],
      activationResult: { outcome },
    });
    await assert.rejects(
      h.service.activateCourseOutlineVersion("offering-a", "outline-a"),
      ConflictException,
    );
  }
});

test("archival derives department, actor, audit context, and exact permission provenance only from the principal", async () => {
  const h = harness("support", { permissions: [archivalGrant("support")] });
  const result = await h.service.archiveCourseOutlineVersion(
    "offering-a",
    "outline-a",
  );
  assert.equal(result.status, CourseOutlineStatus.ARCHIVED);

  const input = h.calls[0]!.args[0] as Record<string, unknown>;
  assert.deepEqual(input, {
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    courseOutlineVersionId: "outline-a",
    actorUserId: "support-user",
    authorizationUserRoleId: "support-assignment-0",
    authorizationRoleId: "support-role-0",
    requestId: "request-a",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
  });
  for (const clientControlledField of [
    "status",
    "archivedAt",
    "activatedAt",
    "activeCourseOutlineVersionId",
    "departmentHeader",
    "studentBatchId",
    "academicTermId",
    "curriculumCourseId",
    "syllabusVersionId",
    "transitionAt",
  ]) {
    assert.equal(clientControlledField in input, false);
  }
});

test("ordinary roles, wildcard authority, and malformed provenance cannot authorize archival", async () => {
  for (const role of [
    "department_admin",
    "teacher",
    "student",
    "auditor",
    "support",
  ] as const) {
    const h = harness(role);
    await assert.rejects(
      h.service.archiveCourseOutlineVersion("offering-a", "outline-a"),
      ForbiddenException,
    );
    assert.deepEqual(h.calls, []);
  }

  for (const permission of [
    archivalGrant("support", {
      resource: "course-management",
      action: "*",
    }),
    archivalGrant("support", { action: "manage" }),
    archivalGrant("support", { scope: "self" }),
    archivalGrant("support", {
      source: {
        departmentId: "department-b",
        userRoleId: "support-assignment-0",
        roleId: "support-role-0",
      },
    }),
    archivalGrant("support", {
      source: {
        departmentId: "department-a",
        userRoleId: "other-assignment",
        roleId: "support-role-0",
      },
    }),
  ]) {
    const h = harness("support", { permissions: [permission] });
    await assert.rejects(
      h.service.archiveCourseOutlineVersion("offering-a", "outline-a"),
      ForbiddenException,
    );
    assert.deepEqual(h.calls, []);
  }
});

test("archival rejects incomplete authenticated user context before repository mutation", async () => {
  for (const principalOverride of [
    { isAuthenticated: false },
    { actorType: "service" },
    { actorId: "" },
    { activeDepartmentId: null },
  ]) {
    const h = harness("support", {
      permissions: [archivalGrant("support")],
    });
    Object.assign(h.context.principal, principalOverride);
    await assert.rejects(
      h.service.archiveCourseOutlineVersion("offering-a", "outline-a"),
      BadRequestException,
    );
    assert.deepEqual(h.calls, []);
  }
});

test("archival maps hidden outcomes to 404 and lifecycle, binding, or concurrency outcomes to 409", async () => {
  for (const outcome of [
    "OFFERING_OR_AUTHORITY_NOT_FOUND",
    "OUTLINE_NOT_FOUND",
  ] as const) {
    const h = harness("support", {
      permissions: [archivalGrant("support")],
      archivalResult: { outcome },
    });
    await assert.rejects(
      h.service.archiveCourseOutlineVersion("offering-a", "outline-a"),
      NotFoundException,
    );
  }
  for (const outcome of [
    "OUTLINE_NOT_ARCHIVABLE",
    "ACTIVE_BINDING_MISMATCH",
    "CONCURRENT_CONFLICT",
  ] as const) {
    const h = harness("support", {
      permissions: [archivalGrant("support")],
      archivalResult: { outcome },
    });
    await assert.rejects(
      h.service.archiveCourseOutlineVersion("offering-a", "outline-a"),
      ConflictException,
    );
  }
});
