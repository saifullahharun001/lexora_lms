import assert from "node:assert/strict";
import test from "node:test";

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { EnrollmentStatus, Prisma, UserStatus } from "@prisma/client";

import { SummativeCandidateRosterService } from "./summative-candidate-roster.service";

function sqlText(query: unknown) {
  const value = query as { sql?: string; text?: string };
  return value.sql ?? value.text ?? String(query);
}

interface EnrollmentFixture {
  id: string;
  departmentId: string;
  academicTermId: string;
  courseOfferingId: string;
  curriculumCourseId: string;
  studentUserId: string;
  studentCurriculumAssignmentId: string;
  status: EnrollmentStatus;
  enrolledAt: Date | null;
  droppedAt: Date | null;
  archivedAt: Date | null;
  assignment: {
    departmentId: string;
    studentUserId: string;
    academicProgramId: string;
    curriculumVersionId: string;
  };
  student: {
    departmentId: string;
    status: UserStatus;
    archivedAt: Date | null;
    deletedAt: Date | null;
    role: {
      departmentId: string;
      code: string;
      revokedAt: Date | null;
      expiresAt: Date | null;
      archivedAt: Date | null;
    } | null;
  };
}

function enrollmentFixture(
  overrides: Omit<Partial<EnrollmentFixture>, "assignment" | "student"> & {
    assignment?: Partial<EnrollmentFixture["assignment"]>;
    student?: Omit<Partial<EnrollmentFixture["student"]>, "role"> & {
      role?: Partial<NonNullable<EnrollmentFixture["student"]["role"]>> | null;
    };
  } = {},
): EnrollmentFixture {
  const assignment = {
    departmentId: "department-a",
    studentUserId: "student-a",
    academicProgramId: "program-a",
    curriculumVersionId: "curriculum-version-a",
    ...overrides.assignment,
  };
  const role =
    overrides.student?.role === null
      ? null
      : {
          departmentId: "department-a",
          code: "student",
          revokedAt: null,
          expiresAt: null,
          archivedAt: null,
          ...overrides.student?.role,
        };
  const student = {
    departmentId: "department-a",
    status: UserStatus.ACTIVE,
    archivedAt: null,
    deletedAt: null,
    ...overrides.student,
    role,
  };
  return {
    id: "enrollment-a",
    departmentId: "department-a",
    academicTermId: "term-a",
    courseOfferingId: "offering-a",
    curriculumCourseId: "curriculum-course-a",
    studentUserId: "student-a",
    studentCurriculumAssignmentId: "student-curriculum-a",
    status: EnrollmentStatus.APPROVED,
    enrolledAt: new Date("2026-08-01T00:00:00.000Z"),
    droppedAt: null,
    archivedAt: null,
    ...overrides,
    assignment,
    student,
  };
}

function matchesLockedEnrollment(fixture: EnrollmentFixture | null) {
  return Boolean(
    fixture &&
      fixture.id === "enrollment-a" &&
      fixture.departmentId === "department-a" &&
      fixture.academicTermId === "term-a" &&
      fixture.courseOfferingId === "offering-a" &&
      fixture.curriculumCourseId === "curriculum-course-a" &&
      fixture.status === EnrollmentStatus.APPROVED &&
      fixture.enrolledAt &&
      !fixture.droppedAt &&
      !fixture.archivedAt &&
      fixture.assignment.departmentId === fixture.departmentId &&
      fixture.assignment.studentUserId === fixture.studentUserId &&
      fixture.assignment.academicProgramId === "program-a" &&
      fixture.assignment.curriculumVersionId === "curriculum-version-a",
  );
}

function hasCurrentStudentAuthority(fixture: EnrollmentFixture | null) {
  const role = fixture?.student.role;
  return Boolean(
    matchesLockedEnrollment(fixture) &&
      fixture &&
      fixture.student.departmentId === fixture.departmentId &&
      fixture.student.status === UserStatus.ACTIVE &&
      !fixture.student.archivedAt &&
      !fixture.student.deletedAt &&
      role &&
      role.departmentId === fixture.departmentId &&
      role.code === "student" &&
      !role.revokedAt &&
      (!role.expiresAt || role.expiresAt > new Date()) &&
      !role.archivedAt,
  );
}

function harness(options: {
  enrollment?: EnrollmentFixture | null;
  authorityFailure?: Error;
  existingCandidate?: boolean;
  failAudit?: boolean;
} = {}) {
  const state = {
    candidate: options.existingCandidate
      ? {
          id: "candidate-a",
          departmentId: "department-a",
          examinationId: "examination-a",
          examinationCourseId: "exam-course-a",
          courseOfferingId: "offering-a",
          enrollmentId: "enrollment-a",
          studentUserId: "student-a",
          registeredByUserId: "admin-a",
          registeredAt: new Date("2026-08-30T00:00:00.000Z"),
        }
      : null,
    audits: [] as unknown[],
    rawSql: [] as string[],
    operations: [] as string[],
    authorityAssertions: 0,
    failAudit: options.failAudit ?? false,
  };
  const enrollmentFixtureState =
    options.enrollment === undefined ? enrollmentFixture() : options.enrollment;
  const tx = {
    $queryRaw: async (query: unknown) => {
      const sql = sqlText(query);
      state.rawSql.push(sql);
      if (/FROM "examinations"/.test(sql)) {
        state.operations.push("examination");
        return [{ id: "examination-a" }];
      }
      if (/FROM "examination_courses"/.test(sql)) {
        state.operations.push("course");
        return [{ id: "exam-course-a" }];
      }
      if (/FROM "enrollments"/.test(sql)) {
        state.operations.push("enrollment");
        return matchesLockedEnrollment(enrollmentFixtureState)
          ? [
              {
                id: enrollmentFixtureState!.id,
                studentUserId: enrollmentFixtureState!.studentUserId,
                studentCurriculumAssignmentId:
                  enrollmentFixtureState!.studentCurriculumAssignmentId,
              },
            ]
          : [];
      }
      return [];
    },
    examinationCourse: {
      findFirst: async () => ({
        id: "exam-course-a",
        examinationId: "examination-a",
        courseOfferingId: "offering-a",
        academicTermId: "term-a",
        academicProgramId: "program-a",
        curriculumVersionId: "curriculum-version-a",
        curriculumCourseId: "curriculum-course-a",
      }),
    },
    enrollment: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        assert.equal(args.where.status, EnrollmentStatus.APPROVED);
        assert.equal(args.where.departmentId, "department-a");
        assert.equal(args.where.academicTermId, "term-a");
        assert.equal(args.where.courseOfferingId, "offering-a");
        assert.equal(args.where.studentUserId, "student-a");
        assert.equal(
          args.where.studentCurriculumAssignmentId,
          "student-curriculum-a",
        );
        assert.equal(args.where.curriculumCourseId, "curriculum-course-a");
        assert.equal(args.where.droppedAt, null);
        const assignment = args.where.studentCurriculumAssignment as {
          is: Record<string, unknown>;
        };
        assert.equal(assignment.is.studentUserId, "student-a");
        assert.equal(assignment.is.academicProgramId, "program-a");
        assert.equal(
          assignment.is.curriculumVersionId,
          "curriculum-version-a",
        );
        return hasCurrentStudentAuthority(enrollmentFixtureState)
          ? {
              id: enrollmentFixtureState!.id,
              studentUserId: enrollmentFixtureState!.studentUserId,
              studentCurriculumAssignmentId:
                enrollmentFixtureState!.studentCurriculumAssignmentId,
            }
          : null;
      },
    },
    summativeExaminationCandidate: {
      findFirst: async () => state.candidate,
      create: async (args: { data: Record<string, unknown> }) => {
        state.candidate = { id: "candidate-a", ...args.data } as never;
        return state.candidate;
      },
    },
    auditLog: {
      create: async (args: { data: unknown }) => {
        if (state.failAudit) {
          state.failAudit = false;
          throw new Error("simulated candidate audit failure");
        }
        state.audits.push(args.data);
        return args.data;
      },
    },
  };
  const prisma = {
    $transaction: async (
      callback: (client: typeof tx) => Promise<unknown>,
      transactionOptions: { isolationLevel: string },
    ) => {
      assert.equal(
        transactionOptions.isolationLevel,
        Prisma.TransactionIsolationLevel.Serializable,
      );
      const before = state.candidate ? { ...state.candidate } : null;
      const auditsBefore = [...state.audits];
      try {
        return await callback(tx);
      } catch (error) {
        state.candidate = before as never;
        state.audits.splice(0, state.audits.length, ...auditsBefore);
        throw error;
      }
    },
  };
  const authorizer = {
    authorize: async () => ({
      departmentId: "department-a",
      actorUserId: "admin-a",
      userRoleId: "admin-user-role-a",
      roleId: "admin-role-a",
    }),
    assertCurrentAuthority: async () => {
      state.authorityAssertions += 1;
      state.operations.push("authority");
      if (options.authorityFailure) throw options.authorityFailure;
    },
  };
  const service = new SummativeCandidateRosterService(
    prisma as never,
    {
      get: () => ({
        requestId: "request-a",
        audit: { ipAddress: "127.0.0.1", userAgent: "test-agent" },
      }),
    } as never,
    authorizer as never,
  );
  return { service, state };
}

test("candidate registration derives immutable scope only from the exact approved Enrollment", async () => {
  const h = harness();
  const candidate = await h.service.registerCandidate(
    "exam-course-a",
    "enrollment-a",
  );
  assert.deepEqual(
    {
      departmentId: candidate?.departmentId,
      examinationId: candidate?.examinationId,
      examinationCourseId: candidate?.examinationCourseId,
      courseOfferingId: candidate?.courseOfferingId,
      enrollmentId: candidate?.enrollmentId,
      studentUserId: candidate?.studentUserId,
      registeredByUserId: candidate?.registeredByUserId,
    },
    {
      departmentId: "department-a",
      examinationId: "examination-a",
      examinationCourseId: "exam-course-a",
      courseOfferingId: "offering-a",
      enrollmentId: "enrollment-a",
      studentUserId: "student-a",
      registeredByUserId: "admin-a",
    },
  );
  assert.equal(h.state.authorityAssertions, 1);
  assert.equal(h.state.audits.length, 1);
  const enrollmentLock = h.state.rawSql.find((sql) =>
    /FROM "enrollments" e/.test(sql),
  );
  assert.ok(enrollmentLock);
  for (const evidence of [
    /JOIN "student_curriculum_assignments" sca/,
    /sca\."student_user_id" = e\."student_user_id"/,
    /sca\."academic_program_id"/,
    /sca\."curriculum_version_id"/,
    /e\."curriculum_course_id"/,
    /e\."dropped_at" IS NULL/,
    /FOR UPDATE OF e, sca/,
  ]) {
    assert.match(enrollmentLock, evidence);
  }
  assert.deepEqual(h.state.operations, [
    "authority",
    "examination",
    "course",
    "enrollment",
  ]);
});

test("distinct ineligible Enrollment, curriculum and Student authority states fail safely", async () => {
  const expiredAt = new Date("2026-01-01T00:00:00.000Z");
  const changedAt = new Date("2026-08-20T00:00:00.000Z");
  const cases: Array<[string, EnrollmentFixture]> = [
    [
      "pending Enrollment",
      enrollmentFixture({ status: EnrollmentStatus.PENDING }),
    ],
    ["archived Enrollment", enrollmentFixture({ archivedAt: changedAt })],
    [
      "dropped Enrollment",
      enrollmentFixture({
        status: EnrollmentStatus.DROPPED,
        droppedAt: changedAt,
      }),
    ],
    [
      "wrong-course Enrollment",
      enrollmentFixture({ courseOfferingId: "offering-b" }),
    ],
    [
      "wrong-term Enrollment",
      enrollmentFixture({ academicTermId: "term-b" }),
    ],
    [
      "wrong-department Enrollment",
      enrollmentFixture({ departmentId: "department-b" }),
    ],
    [
      "curriculum-course mismatch",
      enrollmentFixture({ curriculumCourseId: "curriculum-course-b" }),
    ],
    [
      "StudentCurriculumAssignment mismatch",
      enrollmentFixture({
        assignment: { curriculumVersionId: "curriculum-version-b" },
      }),
    ],
    [
      "missing Student UserRole",
      enrollmentFixture({ student: { role: null } }),
    ],
    [
      "wrong role code",
      enrollmentFixture({ student: { role: { code: "teacher" } } }),
    ],
    [
      "revoked Student UserRole",
      enrollmentFixture({ student: { role: { revokedAt: changedAt } } }),
    ],
    [
      "expired Student UserRole",
      enrollmentFixture({ student: { role: { expiresAt: expiredAt } } }),
    ],
    [
      "archived Student role",
      enrollmentFixture({ student: { role: { archivedAt: changedAt } } }),
    ],
    [
      "inactive Student User",
      enrollmentFixture({ student: { status: UserStatus.SUSPENDED } }),
    ],
    [
      "archived Student User",
      enrollmentFixture({ student: { archivedAt: changedAt } }),
    ],
    [
      "deleted Student User",
      enrollmentFixture({ student: { deletedAt: changedAt } }),
    ],
  ];

  for (const [label, enrollment] of cases) {
    const h = harness({ enrollment });
    await assert.rejects(
      h.service.registerCandidate("exam-course-a", "enrollment-a"),
      NotFoundException,
      label,
    );
    assert.equal(h.state.candidate, null);
  }
});

test("repeat candidate registration is idempotent and creates no duplicate or second audit", async () => {
  const h = harness({ existingCandidate: true });
  const candidate = await h.service.registerCandidate(
    "exam-course-a",
    "enrollment-a",
  );
  assert.equal(candidate?.id, "candidate-a");
  assert.equal(h.state.audits.length, 0);
});

test("transactional management authority loss prevents candidate creation", async () => {
  const h = harness({ authorityFailure: new ForbiddenException("revoked") });
  await assert.rejects(
    h.service.registerCandidate("exam-course-a", "enrollment-a"),
    ForbiddenException,
  );
  assert.equal(h.state.candidate, null);
  assert.deepEqual(h.state.operations, ["authority"]);
});

test("candidate audit failure rolls candidate creation back in the fake transaction", async () => {
  const h = harness({ failAudit: true });
  await assert.rejects(
    h.service.registerCandidate("exam-course-a", "enrollment-a"),
    /simulated candidate audit failure/,
  );
  assert.equal(h.state.candidate, null);
  assert.equal(h.state.audits.length, 0);
});
