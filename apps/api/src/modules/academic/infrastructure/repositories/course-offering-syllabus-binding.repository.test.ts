import assert from "node:assert/strict";
import test from "node:test";

import { AcademicVersionStatus } from "@prisma/client";

import { PrismaAcademicRepository } from "./prisma-academic.repository";

type TestStatus = AcademicVersionStatus | "UNKNOWN";

function lifecycle(status: TestStatus) {
  return {
    status,
    approvedAt:
      status === AcademicVersionStatus.DRAFT
        ? null
        : new Date("2026-08-17T10:00:00.000Z"),
    archivedAt:
      status === AcademicVersionStatus.ARCHIVED
        ? new Date("2026-08-18T10:00:00.000Z")
        : null,
  };
}

function curriculum() {
  return {
    id: "curriculum-a",
    departmentId: "department-a",
    curriculumVersionId: "curriculum-version-a",
    courseId: "course-a",
    assessmentTemplateId: "template-a",
    categoryCode: "CORE",
    academicYearNumber: 1,
    semesterNumber: 1,
    displayOrder: 1,
    courseCodeSnapshot: "LAW101",
    courseTitleSnapshot: "Law",
    creditHoursSnapshot: "3.00",
    totalMarksSnapshot: "100.00",
    isRequired: true,
    course: {
      id: "course-a",
      departmentId: "department-a",
      academicProgramId: "program-a",
      code: "LAW101",
      title: "Law",
    },
    curriculumVersion: {
      id: "curriculum-version-a",
      departmentId: "department-a",
      academicProgramId: "program-a",
      code: "LLB-2026",
      name: "LL.B. 2026",
      status: AcademicVersionStatus.ACTIVE,
      effectiveAcademicSessionCode: "2026-2027",
      academicProgram: { id: "program-a", departmentId: "department-a" },
    },
    assessmentTemplate: {
      id: "template-a",
      departmentId: "department-a",
      academicProgramId: "program-a",
      code: "STANDARD",
      versionNumber: 1,
      name: "Standard",
      status: AcademicVersionStatus.ACTIVE,
      totalMarks: "100.00",
      academicProgram: { id: "program-a", departmentId: "department-a" },
    },
  };
}

function baseState(status: TestStatus = AcademicVersionStatus.APPROVED) {
  return {
    offering: {
      id: "offering-a",
      departmentId: "department-a",
      courseId: "course-a",
      curriculumCourseId: "curriculum-a" as string | null,
      syllabusVersionId: null as string | null,
      archivedAt: null as Date | null,
      course: {
        id: "course-a",
        departmentId: "department-a",
        academicProgramId: "program-a",
      },
    } as {
      id: string;
      departmentId: string;
      courseId: string;
      curriculumCourseId: string | null;
      syllabusVersionId: string | null;
      archivedAt: Date | null;
      course: {
        id: string;
        departmentId: string;
        academicProgramId: string | null;
      };
    } | null,
    curriculum: curriculum(),
    syllabus: {
      id: "syllabus-a",
      departmentId: "department-a",
      curriculumCourseId: "curriculum-a",
      code: "SYL-1",
      versionNumber: 1,
      ...lifecycle(status),
      effectiveFrom: null,
      effectiveTo: null,
      createdAt: new Date("2026-08-14T10:00:00.000Z"),
      updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    } as {
      id: string;
      departmentId: string;
      curriculumCourseId: string;
      code: string;
      versionNumber: number;
      status: TestStatus;
      approvedAt: Date | null;
      archivedAt: Date | null;
      effectiveFrom: Date | null;
      effectiveTo: Date | null;
      createdAt: Date;
      updatedAt: Date;
    } | null,
    syllabusCurriculum: curriculum(),
    audits: [] as unknown[],
  };
}

type State = ReturnType<typeof baseState>;

function bindingOffering(state: State) {
  const offering = state.offering;
  if (!offering) return null;
  return {
    ...offering,
    curriculumCourse: offering.curriculumCourseId ? state.curriculum : null,
  };
}

function compactOffering(state: State) {
  const offering = bindingOffering(state);
  return offering ? { ...offering, academicTerm: { id: "term-a" } } : null;
}

function syllabusRecord(state: State) {
  return state.syllabus
    ? { ...state.syllabus, curriculumCourse: state.syllabusCurriculum }
    : null;
}

function harness(initial = baseState()) {
  let state = structuredClone(initial);
  let failAudit = false;
  let updateError: Error | null = null;
  let concurrentTarget: string | null = null;
  let forceGuardMiss = false;
  let lifecycleRaceStatus: TestStatus | null = null;
  let updateCalls = 0;
  const lockQueries: string[] = [];

  const prisma = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const working = structuredClone(state);
      const tx = {
        $queryRaw: async (query: { sql?: string; text?: string }) => {
          lockQueries.push(query.sql ?? query.text ?? String(query));
          if (lifecycleRaceStatus && working.syllabus) {
            Object.assign(working.syllabus, lifecycle(lifecycleRaceStatus));
          }
          return working.syllabus?.id === "syllabus-a" &&
            working.syllabus.departmentId === "department-a"
            ? [{ id: working.syllabus.id }]
            : [];
        },
        courseOffering: {
          findFirst: async (args: {
            where: { id: string; departmentId: string; archivedAt: null };
            include?: unknown;
          }) => {
            if (
              !working.offering ||
              working.offering.id !== args.where.id ||
              working.offering.departmentId !== args.where.departmentId ||
              working.offering.archivedAt
            ) {
              return null;
            }
            return args.include
              ? compactOffering(working)
              : bindingOffering(working);
          },
          updateMany: async () => {
            updateCalls += 1;
            if (updateError) throw updateError;
            if (!working.offering) return { count: 0 };
            if (forceGuardMiss) return { count: 0 };
            if (concurrentTarget) {
              working.offering.syllabusVersionId = concurrentTarget;
              working.audits.push({ concurrentWinner: concurrentTarget });
              return { count: 0 };
            }
            if (
              working.offering.curriculumCourseId !== "curriculum-a" ||
              working.offering.syllabusVersionId !== null
            ) {
              return { count: 0 };
            }
            working.offering.syllabusVersionId = "syllabus-a";
            return { count: 1 };
          },
        },
        syllabusVersion: {
          findFirst: async (args: {
            where: { id: string; departmentId: string };
          }) => {
            const syllabus = syllabusRecord(working);
            return syllabus?.id === args.where.id &&
              syllabus.departmentId === args.where.departmentId
              ? syllabus
              : null;
          },
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

  return {
    bind: (syllabusVersionId = "syllabus-a") =>
      repository.bindCourseOfferingSyllabus({
        departmentId: "department-a",
        courseOfferingId: "offering-a",
        syllabusVersionId,
        actorUserId: "admin-a",
        requestId: "request-a",
        ipAddress: "127.0.0.1",
        userAgent: "test-agent",
      }),
    getState: () => state,
    getUpdateCalls: () => updateCalls,
    getLockQueries: () => lockQueries,
    setFailAudit: () => {
      failAudit = true;
    },
    setConcurrentTarget: (target: string) => {
      concurrentTarget = target;
    },
    setUpdateError: (error: Error) => {
      updateError = error;
    },
    setForceGuardMiss: () => {
      forceGuardMiss = true;
    },
    setLifecycleRace: (status: TestStatus) => {
      lifecycleRaceStatus = status;
    },
  };
}

test("offering scope and existing curriculum binding are required", async () => {
  const missing = baseState();
  missing.offering = null;
  assert.equal((await harness(missing).bind()).outcome, "OFFERING_NOT_FOUND");

  const unbound = baseState();
  unbound.offering!.curriculumCourseId = null;
  assert.equal(
    (await harness(unbound).bind()).outcome,
    "OFFERING_CURRICULUM_NOT_BOUND",
  );

  const foreign = baseState();
  foreign.offering!.departmentId = "department-b";
  assert.equal((await harness(foreign).bind()).outcome, "OFFERING_NOT_FOUND");
});

test("cross-department syllabus is hidden and wrong CurriculumCourse is rejected", async () => {
  const foreign = baseState();
  foreign.syllabus!.departmentId = "department-b";
  assert.equal(
    (await harness(foreign).bind()).outcome,
    "SYLLABUS_VERSION_NOT_FOUND",
  );

  const wrongCurriculum = baseState();
  wrongCurriculum.syllabus!.curriculumCourseId = "curriculum-b";
  wrongCurriculum.syllabusCurriculum.id = "curriculum-b";
  assert.equal(
    (await harness(wrongCurriculum).bind()).outcome,
    "SYLLABUS_CURRICULUM_MISMATCH",
  );
});

test("malformed offering and syllabus dependency chains fail before mutation", async () => {
  const variants = [
    (state: State) => {
      state.offering!.course.departmentId = "department-b";
    },
    (state: State) => {
      state.curriculum.courseId = "course-b";
    },
    (state: State) => {
      state.curriculum.curriculumVersion.departmentId = "department-b";
    },
    (state: State) => {
      state.syllabusCurriculum.course.departmentId = "department-b";
    },
    (state: State) => {
      state.syllabusCurriculum.assessmentTemplateId = "template-b";
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

test("only lifecycle-valid APPROVED and ACTIVE versions are eligible for new binding", async () => {
  for (const status of [
    AcademicVersionStatus.APPROVED,
    AcademicVersionStatus.ACTIVE,
  ]) {
    const h = harness(baseState(status));
    assert.equal((await h.bind()).outcome, "BOUND");
    assert.equal(h.getState().offering!.syllabusVersionId, "syllabus-a");
    assert.equal(h.getState().audits.length, 1);
  }

  for (const status of [
    AcademicVersionStatus.DRAFT,
    AcademicVersionStatus.RETIRED,
    AcademicVersionStatus.ARCHIVED,
  ]) {
    const h = harness(baseState(status));
    assert.equal((await h.bind()).outcome, "INELIGIBLE_SYLLABUS_VERSION");
    assert.equal(h.getState().offering!.syllabusVersionId, null);
    assert.equal(h.getState().audits.length, 0);
  }

  const unknown = harness(baseState("UNKNOWN"));
  assert.equal((await unknown.bind()).outcome, "MALFORMED_SYLLABUS_VERSION");
});

test("malformed lifecycle timestamps fail closed", async () => {
  const malformedApproved = baseState(AcademicVersionStatus.APPROVED);
  malformedApproved.syllabus!.approvedAt = null;
  assert.equal(
    (await harness(malformedApproved).bind()).outcome,
    "MALFORMED_SYLLABUS_VERSION",
  );

  const malformedArchived = baseState(AcademicVersionStatus.ARCHIVED);
  malformedArchived.syllabus!.archivedAt = null;
  assert.equal(
    (await harness(malformedArchived).bind()).outcome,
    "MALFORMED_SYLLABUS_VERSION",
  );
});

test("first binding and success audit are atomic and contain safe context", async () => {
  const success = harness();
  assert.equal((await success.bind()).outcome, "BOUND");
  const audit = success.getState().audits[0] as {
    data: {
      action: string;
      actorType: string;
      contextJson: Record<string, unknown>;
    };
  };
  assert.equal(audit.data.action, "course-management.offering.syllabus-bound");
  assert.equal(audit.data.actorType, "USER");
  assert.deepEqual(audit.data.contextJson, {
    courseOfferingId: "offering-a",
    courseId: "course-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    syllabusCode: "SYL-1",
    syllabusVersionNumber: 1,
    syllabusStatusAtBinding: AcademicVersionStatus.APPROVED,
    previousBindingValue: null,
    newBindingValue: "syllabus-a",
  });

  const rollback = harness();
  rollback.setFailAudit();
  await assert.rejects(rollback.bind(), /audit unavailable/);
  assert.equal(rollback.getState().offering!.syllabusVersionId, null);
  assert.equal(rollback.getState().audits.length, 0);
});

test("valid exact bindings are idempotent, including RETIRED and ARCHIVED history", async () => {
  for (const status of [
    AcademicVersionStatus.APPROVED,
    AcademicVersionStatus.ACTIVE,
    AcademicVersionStatus.RETIRED,
    AcademicVersionStatus.ARCHIVED,
  ]) {
    const state = baseState(status);
    state.offering!.syllabusVersionId = "syllabus-a";
    state.audits.push({ originalBinding: true });
    const h = harness(state);
    assert.equal((await h.bind()).outcome, "ALREADY_BOUND");
    assert.equal(h.getUpdateCalls(), 0);
    assert.equal(h.getState().audits.length, 1);
  }
});

test("DRAFT and malformed exact targets do not receive historical idempotency", async () => {
  const draft = baseState(AcademicVersionStatus.DRAFT);
  draft.offering!.syllabusVersionId = "syllabus-a";
  assert.equal(
    (await harness(draft).bind()).outcome,
    "INELIGIBLE_SYLLABUS_VERSION",
  );

  const malformed = baseState(AcademicVersionStatus.RETIRED);
  malformed.offering!.syllabusVersionId = "syllabus-a";
  malformed.syllabus!.approvedAt = null;
  assert.equal(
    (await harness(malformed).bind()).outcome,
    "MALFORMED_SYLLABUS_VERSION",
  );
});

test("existing different binding conflicts without overwrite or audit", async () => {
  const state = baseState();
  state.offering!.syllabusVersionId = "syllabus-other";
  const h = harness(state);
  assert.equal((await h.bind()).outcome, "BINDING_CONFLICT");
  assert.equal(h.getUpdateCalls(), 0);
  assert.equal(h.getState().offering!.syllabusVersionId, "syllabus-other");
  assert.equal(h.getState().audits.length, 0);
});

test("idempotency never bypasses department or CurriculumCourse corruption", async () => {
  const departmentMismatch = baseState(AcademicVersionStatus.RETIRED);
  departmentMismatch.offering!.syllabusVersionId = "syllabus-a";
  departmentMismatch.syllabusCurriculum.curriculumVersion.departmentId =
    "department-b";
  assert.equal(
    (await harness(departmentMismatch).bind()).outcome,
    "DEPENDENCY_SCOPE_MISMATCH",
  );

  const curriculumMismatch = baseState(AcademicVersionStatus.ARCHIVED);
  curriculumMismatch.offering!.syllabusVersionId = "syllabus-a";
  curriculumMismatch.syllabus!.curriculumCourseId = "curriculum-b";
  assert.equal(
    (await harness(curriculumMismatch).bind()).outcome,
    "SYLLABUS_CURRICULUM_MISMATCH",
  );
});

test("guarded concurrent same target converges and different target cannot overwrite", async () => {
  const same = harness();
  same.setConcurrentTarget("syllabus-a");
  assert.equal((await same.bind()).outcome, "ALREADY_BOUND");
  assert.equal(same.getState().offering!.syllabusVersionId, "syllabus-a");
  assert.equal(same.getState().audits.length, 1);

  const different = harness();
  different.setConcurrentTarget("syllabus-b");
  assert.equal((await different.bind()).outcome, "BINDING_CONFLICT");
  assert.equal(different.getState().offering!.syllabusVersionId, "syllabus-b");
  assert.equal(different.getState().audits.length, 1);
});

test("unexpected update failures and unexplained guard misses propagate", async () => {
  const failure = harness();
  failure.setUpdateError(new Error("unexpected database failure"));
  await assert.rejects(failure.bind(), /unexpected database failure/);

  const miss = harness();
  miss.setForceGuardMiss();
  await assert.rejects(miss.bind(), /SYLLABUS_BINDING_GUARD_MISSED/);
});

test("row lock and fresh lifecycle read close stale eligibility races", async () => {
  const h = harness();
  h.setLifecycleRace(AcademicVersionStatus.RETIRED);
  assert.equal((await h.bind()).outcome, "INELIGIBLE_SYLLABUS_VERSION");
  assert.equal(h.getState().offering!.syllabusVersionId, null);
  assert.equal(h.getState().audits.length, 0);
  assert.equal(h.getLockQueries().length, 1);
  assert.match(h.getLockQueries()[0]!, /FOR UPDATE/);
});
