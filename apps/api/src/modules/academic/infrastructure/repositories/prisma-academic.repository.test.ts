import assert from "node:assert/strict";
import test from "node:test";

import { PrismaAcademicRepository } from "./prisma-academic.repository";

interface State {
  offering: {
    id: string;
    departmentId: string;
    courseId: string;
    curriculumCourseId: string | null;
    archivedAt: Date | null;
    course: {
      id: string;
      departmentId: string;
      academicProgramId: string | null;
    };
  };
  curriculum: {
    id: string;
    departmentId: string;
    courseId: string;
    curriculumVersionId: string;
    assessmentTemplateId: string;
    course: {
      id: string;
      departmentId: string;
      academicProgramId: string | null;
    };
    curriculumVersion: {
      id: string;
      departmentId: string;
      academicProgramId: string;
      academicProgram: { id: string; departmentId: string };
      status: string;
      archivedAt: Date | null;
    };
    assessmentTemplate: {
      id: string;
      departmentId: string;
      academicProgramId: string | null;
      academicProgram: { id: string; departmentId: string } | null;
      status: string;
      archivedAt: Date | null;
    };
  };
  audits: unknown[];
}

function baseState(): State {
  return {
    offering: {
      id: "offering-a",
      departmentId: "department-a",
      courseId: "course-a",
      curriculumCourseId: null,
      archivedAt: null,
      course: {
        id: "course-a",
        departmentId: "department-a",
        academicProgramId: "program-a",
      },
    },
    curriculum: {
      id: "curriculum-a",
      departmentId: "department-a",
      courseId: "course-a",
      curriculumVersionId: "version-a",
      assessmentTemplateId: "template-a",
      course: {
        id: "course-a",
        departmentId: "department-a",
        academicProgramId: "program-a",
      },
      curriculumVersion: {
        id: "version-a",
        departmentId: "department-a",
        academicProgramId: "program-a",
        academicProgram: { id: "program-a", departmentId: "department-a" },
        status: "DRAFT",
        archivedAt: null,
      },
      assessmentTemplate: {
        id: "template-a",
        departmentId: "department-a",
        academicProgramId: "program-a",
        academicProgram: { id: "program-a", departmentId: "department-a" },
        status: "DRAFT",
        archivedAt: null,
      },
    },
    audits: [],
  };
}

function compactOffering(state: State) {
  return {
    ...state.offering,
    course: state.offering.course,
    academicTerm: { id: "term-a" },
    curriculumCourse: state.offering.curriculumCourseId
      ? {
          id: state.curriculum.id,
          departmentId: state.curriculum.departmentId,
          courseId: state.curriculum.courseId,
          curriculumVersionId: state.curriculum.curriculumVersionId,
          assessmentTemplateId: state.curriculum.assessmentTemplateId,
          course: state.curriculum.course,
          categoryCode: "CORE",
          academicYearNumber: 1,
          semesterNumber: 1,
          displayOrder: 1,
          courseCodeSnapshot: "LAW101",
          courseTitleSnapshot: "Law",
          creditHoursSnapshot: "3.00",
          totalMarksSnapshot: "100.00",
          isRequired: true,
          curriculumVersion: {
            ...state.curriculum.curriculumVersion,
            id: "version-a",
            code: "LLB-2025",
            name: "LL.B. 2025",
            status: state.curriculum.curriculumVersion.status,
            effectiveAcademicSessionCode: "2025-2026",
          },
          assessmentTemplate: {
            ...state.curriculum.assessmentTemplate,
            id: "template-a",
            code: "STANDARD",
            versionNumber: 1,
            name: "Standard",
            status: state.curriculum.assessmentTemplate.status,
            totalMarks: "100.00",
          },
        }
      : null,
  };
}

function harness(initial = baseState()) {
  let state = structuredClone(initial);
  let failAudit = false;
  let forceConcurrentBinding: string | null = null;
  let updateCalls = 0;

  const prisma = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const working = structuredClone(state);
      const tx = {
        courseOffering: {
          findFirst: async (args: {
            where: { id: string; departmentId: string };
            include?: unknown;
            select?: { courseId?: boolean; curriculumCourseId?: boolean };
          }) => {
            if (
              working.offering.id !== args.where.id ||
              working.offering.departmentId !== args.where.departmentId ||
              working.offering.archivedAt
            ) {
              return null;
            }
            if (args.include) return compactOffering(working);
            if (args.select?.courseId) {
              return {
                id: working.offering.id,
                departmentId: working.offering.departmentId,
                courseId: working.offering.courseId,
                curriculumCourseId: working.offering.curriculumCourseId,
                course: working.offering.course,
                curriculumCourse: working.offering.curriculumCourseId
                  ? working.curriculum
                  : null,
              };
            }
            return {
              curriculumCourseId: working.offering.curriculumCourseId,
            };
          },
          updateMany: async () => {
            updateCalls += 1;
            if (forceConcurrentBinding) {
              working.offering.curriculumCourseId = forceConcurrentBinding;
              working.audits.push({ concurrentWinner: forceConcurrentBinding });
              return { count: 0 };
            }
            if (working.offering.curriculumCourseId !== null) {
              return { count: 0 };
            }
            working.offering.curriculumCourseId = working.curriculum.id;
            return { count: 1 };
          },
        },
        curriculumCourse: {
          findFirst: async (args: {
            where: { id: string; departmentId: string };
          }) =>
            working.curriculum.id === args.where.id &&
            working.curriculum.departmentId === args.where.departmentId
              ? working.curriculum
              : null,
        },
        auditLog: {
          create: async (entry: unknown) => {
            if (failAudit) throw new Error("audit unavailable");
            working.audits.push(entry);
            return entry;
          },
        },
      };

      const result = await callback(tx);
      state = working;
      return result;
    },
  };
  const repository = new PrismaAcademicRepository(prisma as never);
  const bind = () =>
    repository.bindCourseOfferingCurriculum({
      departmentId: "department-a",
      courseOfferingId: "offering-a",
      curriculumCourseId: "curriculum-a",
      actorUserId: "admin-a",
      requestId: "request-a",
    });

  return {
    bind,
    getState: () => state,
    getUpdateCalls: () => updateCalls,
    setFailAudit: () => {
      failAudit = true;
    },
    setConcurrentBinding: (id: string) => {
      forceConcurrentBinding = id;
    },
  };
}

test("first binding is atomic, audited once, compact, and idempotent", async () => {
  const h = harness();
  const first = await h.bind();
  assert.equal(first.outcome, "BOUND");
  assert.equal(h.getState().offering.curriculumCourseId, "curriculum-a");
  assert.equal(h.getState().audits.length, 1);
  assert.equal(
    (
      first as unknown as {
        offering: { curriculumCourse: { assessmentTemplate: { id: string } } };
      }
    ).offering.curriculumCourse.assessmentTemplate.id,
    "template-a",
  );

  const second = await h.bind();
  assert.equal(second.outcome, "ALREADY_BOUND");
  assert.equal(h.getState().audits.length, 1);
});

test("wrong-department identifiers are safely hidden", async () => {
  const wrongOffering = baseState();
  wrongOffering.offering.departmentId = "department-b";
  assert.equal(
    (await harness(wrongOffering).bind()).outcome,
    "OFFERING_NOT_FOUND",
  );

  const wrongCurriculum = baseState();
  wrongCurriculum.curriculum.departmentId = "department-b";
  assert.equal(
    (await harness(wrongCurriculum).bind()).outcome,
    "CURRICULUM_COURSE_NOT_FOUND",
  );
});

test("course mismatch, inactive versions, and inactive templates are rejected", async () => {
  const mismatch = baseState();
  mismatch.curriculum.courseId = "course-b";
  mismatch.curriculum.course.id = "course-b";
  assert.equal((await harness(mismatch).bind()).outcome, "COURSE_MISMATCH");

  for (const status of ["RETIRED", "ARCHIVED"] as const) {
    const inactiveVersion = baseState();
    inactiveVersion.curriculum.curriculumVersion.status = status;
    assert.equal(
      (await harness(inactiveVersion).bind()).outcome,
      "INACTIVE_CURRICULUM_VERSION",
    );

    const inactiveTemplate = baseState();
    inactiveTemplate.curriculum.assessmentTemplate.status = status;
    assert.equal(
      (await harness(inactiveTemplate).bind()).outcome,
      "INACTIVE_ASSESSMENT_TEMPLATE",
    );
  }

  const archivedVersion = baseState();
  archivedVersion.curriculum.curriculumVersion.archivedAt = new Date();
  assert.equal(
    (await harness(archivedVersion).bind()).outcome,
    "INACTIVE_CURRICULUM_VERSION",
  );
  const archivedTemplate = baseState();
  archivedTemplate.curriculum.assessmentTemplate.archivedAt = new Date();
  assert.equal(
    (await harness(archivedTemplate).bind()).outcome,
    "INACTIVE_ASSESSMENT_TEMPLATE",
  );

  const futureVersion = baseState();
  futureVersion.curriculum.curriculumVersion.status = "FUTURE_STATUS";
  assert.equal(
    (await harness(futureVersion).bind()).outcome,
    "INACTIVE_CURRICULUM_VERSION",
  );
});

test("DRAFT, APPROVED, and ACTIVE dependencies are eligible for configuration binding", async () => {
  for (const status of ["DRAFT", "APPROVED", "ACTIVE"] as const) {
    const state = baseState();
    state.curriculum.curriculumVersion.status = status;
    state.curriculum.assessmentTemplate.status = status;
    assert.equal((await harness(state).bind()).outcome, "BOUND");
  }
});

test("same binding remains idempotent after dependency retirement or archival", async () => {
  const variants: State[] = [];
  for (const dependency of [
    "curriculumVersion",
    "assessmentTemplate",
  ] as const) {
    const retired = baseState();
    retired.offering.curriculumCourseId = "curriculum-a";
    retired.audits.push({ originalBinding: true });
    retired.curriculum[dependency].status = "RETIRED";
    variants.push(retired);

    const archived = baseState();
    archived.offering.curriculumCourseId = "curriculum-a";
    archived.audits.push({ originalBinding: true });
    archived.curriculum[dependency].archivedAt = new Date();
    variants.push(archived);
  }

  for (const state of variants) {
    const h = harness(state);
    assert.equal((await h.bind()).outcome, "ALREADY_BOUND");
    assert.equal(h.getUpdateCalls(), 0);
    assert.equal(h.getState().audits.length, 1);
  }
});

test("same-binding historical status exception does not bypass department isolation", async () => {
  const state = baseState();
  state.offering.curriculumCourseId = "curriculum-a";
  state.curriculum.curriculumVersion.departmentId = "department-b";
  const h = harness(state);
  assert.equal((await h.bind()).outcome, "DEPENDENCY_SCOPE_MISMATCH");
  assert.equal(h.getUpdateCalls(), 0);
  assert.equal(h.getState().audits.length, 0);
});

test("complete dependency-chain department mismatches fail without update or audit", async () => {
  const variants = [
    (state: State) => {
      state.offering.course.departmentId = "department-b";
    },
    (state: State) => {
      state.curriculum.course.departmentId = "department-b";
    },
    (state: State) => {
      state.curriculum.curriculumVersion.departmentId = "department-b";
    },
    (state: State) => {
      state.curriculum.assessmentTemplate.departmentId = "department-b";
    },
    (state: State) => {
      state.curriculum.course.id = "course-other";
    },
    (state: State) => {
      state.curriculum.curriculumVersion.id = "version-other";
    },
    (state: State) => {
      state.curriculum.assessmentTemplate.id = "template-other";
    },
  ];

  for (const mutate of variants) {
    const state = baseState();
    mutate(state);
    const h = harness(state);
    assert.equal((await h.bind()).outcome, "DEPENDENCY_SCOPE_MISMATCH");
    assert.equal(h.getUpdateCalls(), 0);
    assert.equal(h.getState().audits.length, 0);
  }
});

test("programme-chain mismatches fail without update or success audit", async () => {
  const variants = [
    (state: State) => {
      state.curriculum.curriculumVersion.academicProgramId = "program-b";
      state.curriculum.curriculumVersion.academicProgram.id = "program-b";
    },
    (state: State) => {
      state.curriculum.curriculumVersion.academicProgram.departmentId =
        "department-b";
    },
    (state: State) => {
      state.curriculum.assessmentTemplate.academicProgramId = "program-b";
      state.curriculum.assessmentTemplate.academicProgram = {
        id: "program-b",
        departmentId: "department-a",
      };
    },
  ];

  for (const mutate of variants) {
    const state = baseState();
    mutate(state);
    const h = harness(state);
    assert.equal((await h.bind()).outcome, "DEPENDENCY_SCOPE_MISMATCH");
    assert.equal(h.getUpdateCalls(), 0);
    assert.equal(h.getState().audits.length, 0);
  }
});

test("department-scoped generic template with null programme remains bindable", async () => {
  const state = baseState();
  state.curriculum.assessmentTemplate.academicProgramId = null;
  state.curriculum.assessmentTemplate.academicProgram = null;
  const h = harness(state);
  assert.equal((await h.bind()).outcome, "BOUND");
  assert.equal(h.getState().audits.length, 1);
});

test("historical exact binding fails closed when programme identity is corrupted", async () => {
  const state = baseState();
  state.offering.curriculumCourseId = "curriculum-a";
  state.curriculum.curriculumVersion.academicProgramId = "program-b";
  state.curriculum.curriculumVersion.academicProgram.id = "program-b";
  const h = harness(state);
  assert.equal((await h.bind()).outcome, "DEPENDENCY_SCOPE_MISMATCH");
  assert.equal(h.getUpdateCalls(), 0);
  assert.equal(h.getState().audits.length, 0);
});

test("different existing binding conflicts without success audit", async () => {
  const existing = baseState();
  existing.offering.curriculumCourseId = "curriculum-other";
  const existingHarness = harness(existing);
  assert.equal((await existingHarness.bind()).outcome, "BINDING_CONFLICT");
  assert.equal(existingHarness.getState().audits.length, 0);
});

test("concurrent same-target binding resolves idempotently with one audit", async () => {
  const h = harness();
  h.setConcurrentBinding("curriculum-a");
  assert.equal((await h.bind()).outcome, "ALREADY_BOUND");
  assert.equal(h.getState().offering.curriculumCourseId, "curriculum-a");
  assert.equal(h.getState().audits.length, 1);
});

test("concurrent different-target binding conflicts without overwrite and has one winner audit", async () => {
  const h = harness();
  h.setConcurrentBinding("curriculum-other");
  assert.equal((await h.bind()).outcome, "BINDING_CONFLICT");
  assert.equal(h.getState().offering.curriculumCourseId, "curriculum-other");
  assert.equal(h.getState().audits.length, 1);
});

test("audit failure rolls back binding", async () => {
  const h = harness();
  h.setFailAudit();
  await assert.rejects(h.bind(), /audit unavailable/);
  assert.equal(h.getState().offering.curriculumCourseId, null);
  assert.equal(h.getState().audits.length, 0);
});

test("department-scoped list and detail reads use compact nullable curriculum summaries", async () => {
  const queries: unknown[] = [];
  const prisma = {
    courseOffering: {
      findMany: async (args: unknown) => {
        queries.push(args);
        return [];
      },
      findFirst: async (args: unknown) => {
        queries.push(args);
        return null;
      },
    },
  };
  const repository = new PrismaAcademicRepository(prisma as never);
  await repository.findCourseOfferings({ departmentId: "department-a" });
  await repository.findCourseOfferingById("department-a", "offering-a");

  for (const query of queries) {
    const include = (
      query as {
        include: {
          curriculumCourse: { select: Record<string, unknown> };
        };
      }
    ).include;
    const summary = include.curriculumCourse.select;
    assert.equal(summary.id, true);
    assert.ok("curriculumVersion" in summary);
    assert.ok("assessmentTemplate" in summary);
    assert.equal("components" in summary, false);
    assert.equal(
      "components" in
        (summary.assessmentTemplate as { select: Record<string, unknown> })
          .select,
      false,
    );
  }
});

test("ordinary and Teacher reads hide malformed cross-department curriculum metadata", async () => {
  const state = baseState();
  state.offering.curriculumCourseId = "curriculum-a";
  state.curriculum.curriculumVersion.departmentId = "department-b";
  const malformed = compactOffering(state);
  const prisma = {
    courseOffering: {
      findMany: async () => [malformed],
      findFirst: async () => malformed,
    },
  };
  const repository = new PrismaAcademicRepository(prisma as never);

  assert.deepEqual(
    await repository.findCourseOfferings({ departmentId: "department-a" }),
    [],
  );
  assert.equal(
    await repository.findCourseOfferingById("department-a", "offering-a"),
    null,
  );
  assert.equal(
    await repository.findCourseOfferingByIdForTeacher(
      "department-a",
      "offering-a",
      "teacher-a",
    ),
    null,
  );
});

interface EnrollmentState {
  offering: {
    id: string;
    departmentId: string;
    academicTermId: string;
    courseId: string;
    curriculumCourseId: string | null;
    archivedAt: Date | null;
    academicTerm: { departmentId: string; archivedAt: Date | null };
    course: { id: string; departmentId: string };
  };
  curriculumCourse: {
    id: string;
    departmentId: string;
    courseId: string;
    curriculumVersionId: string;
    curriculumVersion: {
      id: string;
      departmentId: string;
      academicProgramId: string;
      academicProgram: { id: string; departmentId: string };
    };
    course: { id: string; departmentId: string };
  };
  student: {
    id: string;
    departmentId: string;
    status: string;
    archivedAt: Date | null;
    deletedAt: Date | null;
    department: {
      id: string;
      status: string;
      archivedAt: Date | null;
      deletedAt: Date | null;
    };
    userRoles: Array<{
      departmentId: string;
      revokedAt: Date | null;
      expiresAt: Date | null;
      role: { code: string; departmentId: string; archivedAt: Date | null };
    }>;
  } | null;
  assignment: {
    id: string;
    departmentId: string;
    studentUserId: string;
    academicProgramId: string;
    curriculumVersionId: string;
  } | null;
  enrollments: Array<Record<string, unknown>>;
}

function enrollmentState(): EnrollmentState {
  return {
    offering: {
      id: "offering-a",
      departmentId: "department-a",
      academicTermId: "term-a",
      courseId: "course-a",
      curriculumCourseId: "curriculum-course-a",
      archivedAt: null,
      academicTerm: { departmentId: "department-a", archivedAt: null },
      course: { id: "course-a", departmentId: "department-a" },
    },
    curriculumCourse: {
      id: "curriculum-course-a",
      departmentId: "department-a",
      courseId: "course-a",
      curriculumVersionId: "version-a",
      curriculumVersion: {
        id: "version-a",
        departmentId: "department-a",
        academicProgramId: "program-a",
        academicProgram: { id: "program-a", departmentId: "department-a" },
      },
      course: { id: "course-a", departmentId: "department-a" },
    },
    student: {
      id: "student-a",
      departmentId: "department-a",
      status: "ACTIVE",
      archivedAt: null,
      deletedAt: null,
      department: {
        id: "department-a",
        status: "ACTIVE",
        archivedAt: null,
        deletedAt: null,
      },
      userRoles: [
        {
          departmentId: "department-a",
          revokedAt: null,
          expiresAt: null,
          role: {
            code: "student",
            departmentId: "department-a",
            archivedAt: null,
          },
        },
      ],
    },
    assignment: {
      id: "assignment-a",
      departmentId: "department-a",
      studentUserId: "student-a",
      academicProgramId: "program-a",
      curriculumVersionId: "version-a",
    },
    enrollments: [],
  };
}

function enrollmentHarness(initial = enrollmentState()) {
  const state = structuredClone(initial);
  const events: string[] = [];
  let studentQuery: unknown;
  const prisma = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      events.push("transaction");
      return callback({
        courseOffering: {
          findFirst: async (args: {
            where: { id: string; departmentId: string };
          }) => {
            events.push("offering-read");
            const row = state.offering;
            if (
              row.id !== args.where.id ||
              row.departmentId !== args.where.departmentId ||
              row.archivedAt
            )
              return null;
            return {
              ...row,
              curriculumCourse:
                row.curriculumCourseId === state.curriculumCourse.id
                  ? state.curriculumCourse
                  : null,
            };
          },
        },
        user: {
          findFirst: async (args: {
            where: {
              id: string;
              departmentId: string;
              status: string;
              archivedAt: null;
              deletedAt: null;
              department: {
                id: string;
                status: string;
                archivedAt: null;
                deletedAt: null;
              };
              userRoles: {
                some: {
                  departmentId: string;
                  revokedAt: null;
                  OR: Array<{ expiresAt: null | { gt: Date } }>;
                  role: {
                    code: string;
                    departmentId: string;
                    archivedAt: null;
                  };
                };
              };
            };
          }) => {
            events.push("student-read");
            studentQuery = args;
            const row = state.student;
            const role = row?.userRoles.find(
              (candidate) =>
                candidate.departmentId ===
                  args.where.userRoles.some.departmentId &&
                candidate.revokedAt === null &&
                (candidate.expiresAt === null ||
                  candidate.expiresAt >
                    args.where.userRoles.some.OR[1]!.expiresAt!.gt) &&
                candidate.role.code === args.where.userRoles.some.role.code &&
                candidate.role.departmentId ===
                  args.where.userRoles.some.role.departmentId &&
                candidate.role.archivedAt === null,
            );
            return row &&
              row.id === args.where.id &&
              row.departmentId === args.where.departmentId &&
              row.status === args.where.status &&
              row.archivedAt === null &&
              row.deletedAt === null &&
              row.department.id === args.where.department.id &&
              row.department.status === args.where.department.status &&
              row.department.archivedAt === null &&
              row.department.deletedAt === null &&
              Boolean(role)
              ? row
              : null;
          },
        },
        studentCurriculumAssignment: {
          findFirst: async (args: {
            where: {
              departmentId: string;
              studentUserId: string;
              academicProgramId: string;
            };
          }) => {
            events.push("assignment-read");
            const row = state.assignment;
            return row &&
              row.departmentId === args.where.departmentId &&
              row.studentUserId === args.where.studentUserId &&
              row.academicProgramId === args.where.academicProgramId
              ? row
              : null;
          },
        },
        enrollment: {
          findUnique: async () => {
            events.push("duplicate-read");
            return (
              state.enrollments.find(
                (row) =>
                  row.courseOfferingId === "offering-a" &&
                  row.studentUserId === "student-a",
              ) ?? null
            );
          },
          create: async (args: { data: Record<string, unknown> }) => {
            events.push("create");
            const row = { id: "enrollment-new", ...args.data };
            state.enrollments.push(row);
            return row;
          },
        },
      });
    },
  };
  const repository = new PrismaAcademicRepository(prisma as never);
  const create = () =>
    repository.createEnrollment({
      departmentId: "department-a",
      academicTermId: "term-a",
      courseOfferingId: "offering-a",
      studentUserId: "student-a",
    });
  return { state, events, create, getStudentQuery: () => studentQuery };
}

test("Enrollment transaction derives and persists both curriculum identities", async () => {
  const h = enrollmentHarness();
  assert.equal((await h.create()).outcome, "CREATED");
  assert.deepEqual(h.events, [
    "transaction",
    "offering-read",
    "student-read",
    "assignment-read",
    "duplicate-read",
    "create",
  ]);
  assert.equal(
    h.state.enrollments[0]?.studentCurriculumAssignmentId,
    "assignment-a",
  );
  assert.equal(
    h.state.enrollments[0]?.curriculumCourseId,
    "curriculum-course-a",
  );
  const studentWhere = (
    h.getStudentQuery() as { where: Record<string, unknown> }
  ).where;
  assert.equal(studentWhere.status, "ACTIVE");
  assert.deepEqual(studentWhere.department, {
    id: "department-a",
    status: "ACTIVE",
    archivedAt: null,
    deletedAt: null,
  });
  assert.deepEqual(
    (studentWhere.userRoles as { some: Record<string, unknown> }).some.role,
    { code: "student", departmentId: "department-a", archivedAt: null },
  );
});

for (const [name, mutate, outcome] of [
  [
    "unbound offering",
    (s: EnrollmentState) => {
      s.offering.curriculumCourseId = null;
    },
    "OFFERING_CURRICULUM_NOT_BOUND",
  ],
  [
    "missing programme assignment",
    (s: EnrollmentState) => {
      s.assignment = null;
    },
    "STUDENT_CURRICULUM_ASSIGNMENT_NOT_FOUND",
  ],
  [
    "missing valid department-scoped student",
    (s: EnrollmentState) => {
      s.student = null;
    },
    "STUDENT_NOT_FOUND",
  ],
  [
    "INVITED target user",
    (s: EnrollmentState) => {
      s.student!.status = "INVITED";
    },
    "STUDENT_NOT_FOUND",
  ],
  [
    "inactive target user",
    (s: EnrollmentState) => {
      s.student!.status = "INACTIVE";
    },
    "STUDENT_NOT_FOUND",
  ],
  [
    "archived target user",
    (s: EnrollmentState) => {
      s.student!.archivedAt = new Date();
    },
    "STUDENT_NOT_FOUND",
  ],
  [
    "deleted target user",
    (s: EnrollmentState) => {
      s.student!.deletedAt = new Date();
    },
    "STUDENT_NOT_FOUND",
  ],
  [
    "wrong-department target user",
    (s: EnrollmentState) => {
      s.student!.departmentId = "department-b";
    },
    "STUDENT_NOT_FOUND",
  ],
  [
    "target user without Student role",
    (s: EnrollmentState) => {
      s.student!.userRoles = [];
    },
    "STUDENT_NOT_FOUND",
  ],
  [
    "revoked Student role",
    (s: EnrollmentState) => {
      s.student!.userRoles[0]!.revokedAt = new Date();
    },
    "STUDENT_NOT_FOUND",
  ],
  [
    "expired Student role",
    (s: EnrollmentState) => {
      s.student!.userRoles[0]!.expiresAt = new Date("2000-01-01T00:00:00Z");
    },
    "STUDENT_NOT_FOUND",
  ],
  [
    "archived Student role",
    (s: EnrollmentState) => {
      s.student!.userRoles[0]!.role.archivedAt = new Date();
    },
    "STUDENT_NOT_FOUND",
  ],
  [
    "wrong-department Student role assignment",
    (s: EnrollmentState) => {
      s.student!.userRoles[0]!.departmentId = "department-b";
    },
    "STUDENT_NOT_FOUND",
  ],
  [
    "wrong-department Student role",
    (s: EnrollmentState) => {
      s.student!.userRoles[0]!.role.departmentId = "department-b";
    },
    "STUDENT_NOT_FOUND",
  ],
  [
    "inactive Student Department",
    (s: EnrollmentState) => {
      s.student!.department.status = "INACTIVE";
    },
    "STUDENT_NOT_FOUND",
  ],
  [
    "archived Student Department",
    (s: EnrollmentState) => {
      s.student!.department.archivedAt = new Date();
    },
    "STUDENT_NOT_FOUND",
  ],
  [
    "deleted Student Department",
    (s: EnrollmentState) => {
      s.student!.department.deletedAt = new Date();
    },
    "STUDENT_NOT_FOUND",
  ],
  [
    "different assigned curriculum version",
    (s: EnrollmentState) => {
      s.assignment!.curriculumVersionId = "version-b";
    },
    "STUDENT_CURRICULUM_VERSION_MISMATCH",
  ],
  [
    "curriculum course mismatch",
    (s: EnrollmentState) => {
      s.curriculumCourse.courseId = "course-b";
    },
    "CURRICULUM_DEPENDENCY_MISMATCH",
  ],
  [
    "curriculum department mismatch",
    (s: EnrollmentState) => {
      s.curriculumCourse.departmentId = "department-b";
    },
    "CURRICULUM_DEPENDENCY_MISMATCH",
  ],
  [
    "CourseOffering actual Course belongs to another department",
    (s: EnrollmentState) => {
      s.offering.course.departmentId = "department-b";
    },
    "CURRICULUM_DEPENDENCY_MISMATCH",
  ],
  [
    "CurriculumCourse actual Course relation is inconsistent",
    (s: EnrollmentState) => {
      s.curriculumCourse.course.id = "course-b";
    },
    "CURRICULUM_DEPENDENCY_MISMATCH",
  ],
  [
    "CurriculumCourse actual Course belongs to another department",
    (s: EnrollmentState) => {
      s.curriculumCourse.course.departmentId = "department-b";
    },
    "CURRICULUM_DEPENDENCY_MISMATCH",
  ],
  [
    "CurriculumVersion AcademicProgram belongs to another department",
    (s: EnrollmentState) => {
      s.curriculumCourse.curriculumVersion.academicProgram.departmentId =
        "department-b";
    },
    "CURRICULUM_DEPENDENCY_MISMATCH",
  ],
  [
    "CurriculumVersion AcademicProgram relation is inconsistent",
    (s: EnrollmentState) => {
      s.curriculumCourse.curriculumVersion.academicProgram.id = "program-b";
    },
    "CURRICULUM_DEPENDENCY_MISMATCH",
  ],
] as const) {
  test(`${name} fails closed without creation`, async () => {
    const state = enrollmentState();
    mutate(state);
    const h = enrollmentHarness(state);
    assert.deepEqual(await h.create(), { outcome });
    assert.equal(h.events.includes("create"), false);
  });
}

test("Enrollment term mismatch remains rejected transactionally", async () => {
  const h = enrollmentHarness();
  h.state.offering.academicTermId = "term-b";
  assert.deepEqual(await h.create(), { outcome: "TERM_MISMATCH" });
  assert.equal(h.events.includes("student-read"), false);
});

test("duplicate Enrollment is conflict-safe and legacy null bindings remain untouched", async () => {
  const state = enrollmentState();
  state.enrollments.push({
    id: "legacy",
    courseOfferingId: "offering-a",
    studentUserId: "student-a",
    studentCurriculumAssignmentId: null,
    curriculumCourseId: null,
  });
  const h = enrollmentHarness(state);
  assert.deepEqual(await h.create(), { outcome: "DUPLICATE_ENROLLMENT" });
  assert.equal(h.events.includes("create"), false);
  assert.equal(h.state.enrollments[0]?.studentCurriculumAssignmentId, null);
  assert.equal(h.state.enrollments[0]?.curriculumCourseId, null);
});
