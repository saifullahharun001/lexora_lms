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
      roleAssignments: [
        {
          userRoleId: `${role}-assignment-a`,
          roleId: `${role}-role-a`,
          departmentId: "department-a",
          role,
        },
      ],
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
  assert.ok((assignment.OR[1]?.expiresAt as { gt: Date }).gt instanceof Date);
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

function enrollmentServiceHarness(
  result: Awaited<
    ReturnType<
      import("../ports/academic.repository.port").AcademicRepositoryPort["createEnrollment"]
    >
  >,
) {
  const calls: unknown[] = [];
  const enrollment = {
    id: "enrollment-a",
    departmentId: "department-a",
    studentUserId: "student-a",
    studentCurriculumAssignmentId: "assignment-a",
    curriculumCourseId: "curriculum-course-a",
  };
  const repository = {
    createEnrollment: async (input: unknown) => {
      calls.push({ kind: "create", input });
      return result;
    },
    findEnrollmentById: async () => enrollment,
    findEnrollmentByIdForStudent: async (...args: unknown[]) => {
      calls.push({ kind: "student-read", args });
      return enrollment;
    },
    findEnrollments: async (input: unknown) => {
      calls.push({ kind: "list", input });
      return [enrollment];
    },
  };
  const prisma = {
    auditLog: {
      create: async (input: unknown) => {
        calls.push({ kind: "audit", input });
        return input;
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
          userRoleId: "department-admin-assignment-a",
          roleId: "department-admin-role-a",
          departmentId: "department-a",
          role: "department_admin",
        },
      ],
      permissions: [],
    },
    department: {
      kind: "department",
      departmentId: "forged",
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

test("Enrollment service sends no caller-authoritative curriculum identity and audits derived IDs", async () => {
  const enrollment = {
    id: "enrollment-a",
    studentCurriculumAssignmentId: "assignment-a",
    curriculumCourseId: "curriculum-course-a",
  };
  const h = enrollmentServiceHarness({ outcome: "CREATED", enrollment });
  await h.service.createEnrollment({
    academicTermId: "term-a",
    courseOfferingId: "offering-a",
    studentUserId: "student-a",
    studentCurriculumAssignmentId: "attacker-assignment",
    curriculumCourseId: "attacker-course",
    curriculumVersionId: "attacker-version",
    academicProgramId: "attacker-program",
  } as never);
  const create = h.calls.find(
    (call) => (call as { kind?: string }).kind === "create",
  ) as { input: Record<string, unknown> };
  assert.equal(create.input.departmentId, "department-a");
  for (const key of [
    "studentCurriculumAssignmentId",
    "curriculumCourseId",
    "curriculumVersionId",
    "academicProgramId",
  ])
    assert.equal(key in create.input, false);
  const audit = h.calls.find(
    (call) => (call as { kind?: string }).kind === "audit",
  ) as { input: { data: { contextJson: Record<string, unknown> } } };
  assert.equal(
    audit.input.data.contextJson.studentCurriculumAssignmentId,
    "assignment-a",
  );
  assert.equal(
    audit.input.data.contextJson.curriculumCourseId,
    "curriculum-course-a",
  );
});

test("Enrollment repository outcomes map to safe existing HTTP semantics", async () => {
  const cases = [
    ["OFFERING_NOT_FOUND", BadRequestException],
    ["OFFERING_CURRICULUM_NOT_BOUND", BadRequestException],
    ["TERM_MISMATCH", BadRequestException],
    ["STUDENT_NOT_FOUND", BadRequestException],
    ["STUDENT_CURRICULUM_ASSIGNMENT_NOT_FOUND", BadRequestException],
    ["CURRICULUM_DEPENDENCY_MISMATCH", NotFoundException],
    ["STUDENT_CURRICULUM_VERSION_MISMATCH", BadRequestException],
    ["DUPLICATE_ENROLLMENT", ConflictException],
  ] as const;
  for (const [outcome, exception] of cases)
    await assert.rejects(
      enrollmentServiceHarness({ outcome }).service.createEnrollment({
        academicTermId: "term-a",
        courseOfferingId: "offering-a",
        studentUserId: "student-a",
      }),
      exception,
    );
});

test("legacy Enrollment reads and student own-resource scoping remain unchanged", async () => {
  const h = enrollmentServiceHarness({ outcome: "DUPLICATE_ENROLLMENT" });
  await h.service.listMyEnrollments({});
  await h.service.getMyEnrollment("legacy-enrollment");
  const list = h.calls.find(
    (call) => (call as { kind?: string }).kind === "list",
  ) as { input: Record<string, unknown> };
  assert.equal(list.input.departmentId, "department-a");
  assert.equal(list.input.studentUserId, "admin-a");
  const ownRead = h.calls.find(
    (call) => (call as { kind?: string }).kind === "student-read",
  ) as { args: unknown[] };
  assert.deepEqual(ownRead.args, [
    "department-a",
    "legacy-enrollment",
    "admin-a",
  ]);
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
  const cases: Array<
    [
      BindCourseOfferingCurriculumResult,
      (
        | typeof BadRequestException
        | typeof ConflictException
        | typeof NotFoundException
      ),
    ]
  > = [
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
  await assert.rejects(
    service.getCourseOffering("unassigned"),
    NotFoundException,
  );
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
