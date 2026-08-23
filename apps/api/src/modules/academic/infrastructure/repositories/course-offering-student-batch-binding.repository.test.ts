import assert from "node:assert/strict";
import test from "node:test";

import { AcademicVersionStatus, CourseOfferingStatus } from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { PrismaAcademicRepository } from "./prisma-academic.repository";

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
      academicProgram: { id: "program-a", departmentId: "department-a" },
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

function batch(id = "batch-a", programme = "program-a") {
  return {
    id,
    departmentId: "department-a",
    academicProgramId: programme,
    academicSessionId: "session-a",
    code: id.toUpperCase(),
    name: id,
    archivedAt: null as Date | null,
    academicProgram: { id: programme, departmentId: "department-a" },
    academicSession: { id: "session-a", departmentId: "department-a" },
  };
}

function baseState() {
  return {
    offering: {
      id: "offering-a",
      departmentId: "department-a",
      courseId: "course-a",
      academicTermId: "term-a",
      studentBatchId: null as string | null,
      curriculumCourseId: "curriculum-a" as string | null,
      syllabusVersionId: null as string | null,
      sectionCode: "A",
      status: CourseOfferingStatus.PLANNED,
      archivedAt: null as Date | null,
      course: {
        id: "course-a",
        departmentId: "department-a",
        academicProgramId: "program-a",
        academicProgram: { id: "program-a", departmentId: "department-a" },
      },
    } as null | {
      id: string;
      departmentId: string;
      courseId: string;
      academicTermId: string;
      studentBatchId: string | null;
      curriculumCourseId: string | null;
      syllabusVersionId: string | null;
      sectionCode: string;
      status: CourseOfferingStatus;
      archivedAt: Date | null;
      course: {
        id: string;
        departmentId: string;
        academicProgramId: string | null;
        academicProgram: null | { id: string; departmentId: string };
      };
    },
    curriculum: curriculum(),
    batches: [batch(), batch("batch-b")],
    otherOfferings: [] as Array<{
      id: string;
      departmentId: string;
      academicTermId: string;
      studentBatchId: string;
      curriculumCourseId: string;
      sectionCode: string;
    }>,
    audits: [] as unknown[],
  };
}

type State = ReturnType<typeof baseState>;

function bindingOffering(state: State) {
  if (!state.offering) return null;
  return {
    ...state.offering,
    curriculumCourse: state.offering.curriculumCourseId
      ? state.curriculum
      : null,
  };
}

function readOffering(state: State) {
  const offering = bindingOffering(state);
  if (!offering) return null;
  return {
    ...offering,
    academicTerm: { id: "term-a" },
    studentBatch: offering.studentBatchId
      ? (state.batches.find((item) => item.id === offering.studentBatchId) ??
        null)
      : null,
  };
}

function harness(initial = baseState()) {
  let state = structuredClone(initial);
  let failAudit = false;
  let updateError: Error | null = null;
  let concurrentTarget: string | null = null;
  let requestedBatchId = "batch-a";
  let forceGuardMiss = false;
  let updateCalls = 0;
  const offeringQueries: unknown[] = [];
  const batchQueries: unknown[] = [];
  const lockQueries: string[] = [];
  const operationOrder: string[] = [];

  const prisma = {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const working = structuredClone(state);
      const tx = {
        $queryRaw: async (query: { sql?: string; text?: string }) => {
          const sql = query.sql ?? query.text ?? String(query);
          lockQueries.push(sql);
          if (/FROM "course_offerings"/.test(sql)) {
            operationOrder.push("course-offering-lock");
            const offering = working.offering;
            return offering &&
              offering.id === "offering-a" &&
              offering.departmentId === "department-a" &&
              !offering.archivedAt &&
              offering.status !== CourseOfferingStatus.ARCHIVED
              ? [{ id: offering.id, courseId: offering.courseId }]
              : [];
          }
          if (/FROM "courses"/.test(sql)) {
            operationOrder.push("course-lock");
            const offering = working.offering;
            return offering &&
              offering.course.id === offering.courseId &&
              offering.course.departmentId === "department-a"
              ? [{ id: offering.course.id }]
              : [];
          }
          operationOrder.push("student-batch-lock");
          const requiresActiveBatch = /"archived_at" IS NULL/.test(sql);
          const target = working.batches.find(
            (item) =>
              item.id === requestedBatchId &&
              item.departmentId === "department-a" &&
              (!requiresActiveBatch || item.archivedAt === null),
          );
          return target ? [{ id: target.id }] : [];
        },
        courseOffering: {
          findFirst: async (args: {
            where: Record<string, unknown>;
            include?: unknown;
          }) => {
            offeringQueries.push(args);
            operationOrder.push("authoritative-offering-read");
            if (typeof args.where.id === "object") {
              return (
                working.otherOfferings.find(
                  (item) =>
                    item.departmentId === args.where.departmentId &&
                    item.academicTermId === args.where.academicTermId &&
                    item.studentBatchId === args.where.studentBatchId &&
                    item.curriculumCourseId === args.where.curriculumCourseId &&
                    item.sectionCode === args.where.sectionCode,
                ) ?? null
              );
            }

            const offering = working.offering;
            if (
              !offering ||
              offering.id !== args.where.id ||
              offering.departmentId !== args.where.departmentId ||
              offering.archivedAt ||
              offering.status === CourseOfferingStatus.ARCHIVED
            ) {
              return null;
            }
            return args.include
              ? readOffering(working)
              : bindingOffering(working);
          },
          updateMany: async () => {
            updateCalls += 1;
            if (updateError) throw updateError;
            if (!working.offering || forceGuardMiss) return { count: 0 };
            if (concurrentTarget) {
              working.offering.studentBatchId = concurrentTarget;
              working.audits.push({ concurrentWinner: concurrentTarget });
              return { count: 0 };
            }
            if (
              working.offering.studentBatchId !== null ||
              working.offering.curriculumCourseId !== "curriculum-a"
            ) {
              return { count: 0 };
            }
            working.offering.studentBatchId = "batch-a";
            return { count: 1 };
          },
        },
        studentBatch: {
          findFirst: async (args: { where: Record<string, unknown> }) => {
            batchQueries.push(args);
            const requiresActiveBatch = args.where.archivedAt === null;
            return (
              working.batches.find(
                (item) =>
                  item.id === args.where.id &&
                  item.departmentId === args.where.departmentId &&
                  (!requiresActiveBatch || item.archivedAt === null),
              ) ?? null
            );
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
    bind: (studentBatchId = "batch-a") => {
      requestedBatchId = studentBatchId;
      return repository.bindCourseOfferingStudentBatch({
        departmentId: "department-a",
        courseOfferingId: "offering-a",
        studentBatchId,
        actorUserId: "admin-a",
        requestId: "request-a",
        ipAddress: "127.0.0.1",
        userAgent: "test-agent",
      });
    },
    getState: () => state,
    getOfferingQueries: () => offeringQueries,
    getBatchQueries: () => batchQueries,
    getLockQueries: () => lockQueries,
    getOperationOrder: () => operationOrder,
    getUpdateCalls: () => updateCalls,
    setFailAudit: () => {
      failAudit = true;
    },
    setConcurrentTarget: (target: string) => {
      concurrentTarget = target;
    },
    setForceGuardMiss: () => {
      forceGuardMiss = true;
    },
    setUpdateError: (error: Error) => {
      updateError = error;
    },
  };
}

test("CourseOffering and Course locks precede authoritative programme validation and StudentBatch locking", async () => {
  const h = harness();
  assert.equal((await h.bind()).outcome, "BOUND");
  assert.deepEqual(h.getOperationOrder().slice(0, 4), [
    "course-offering-lock",
    "course-lock",
    "authoritative-offering-read",
    "student-batch-lock",
  ]);
  assert.equal(h.getLockQueries().length, 3);
  assert.match(h.getLockQueries()[0]!, /FROM "course_offerings"/);
  assert.match(h.getLockQueries()[0]!, /"department_id"/);
  assert.match(h.getLockQueries()[0]!, /FOR UPDATE/);
  assert.match(h.getLockQueries()[1]!, /FROM "courses"/);
  assert.match(h.getLockQueries()[1]!, /"department_id"/);
  assert.match(h.getLockQueries()[1]!, /FOR UPDATE/);
  assert.match(h.getLockQueries()[2]!, /FROM "student_batches"/);
  assert.match(h.getLockQueries()[2]!, /FOR UPDATE/);

  const firstOfferingQuery = h.getOfferingQueries()[0] as {
    where: Record<string, unknown>;
  };
  assert.deepEqual(firstOfferingQuery.where, {
    id: "offering-a",
    departmentId: "department-a",
    archivedAt: null,
    status: { not: CourseOfferingStatus.ARCHIVED },
  });
  assert.deepEqual(
    (h.getBatchQueries()[0] as { where: Record<string, unknown> }).where,
    {
      id: "batch-a",
      departmentId: "department-a",
      archivedAt: null,
    },
  );

  const wrongDepartment = baseState();
  wrongDepartment.batches[0]!.departmentId = "department-b";
  assert.equal(
    (await harness(wrongDepartment).bind()).outcome,
    "STUDENT_BATCH_NOT_FOUND",
  );
});

test("missing or archived offering and missing curriculum fail before StudentBatch lookup", async () => {
  for (const state of [
    (() => {
      const value = baseState();
      value.offering = null;
      return value;
    })(),
    (() => {
      const value = baseState();
      value.offering!.status = CourseOfferingStatus.ARCHIVED;
      return value;
    })(),
  ]) {
    const h = harness(state);
    assert.equal((await h.bind()).outcome, "OFFERING_NOT_FOUND");
    assert.equal(h.getBatchQueries().length, 0);
  }

  const unbound = baseState();
  unbound.offering!.curriculumCourseId = null;
  const h = harness(unbound);
  assert.equal((await h.bind()).outcome, "OFFERING_CURRICULUM_NOT_BOUND");
  assert.equal(h.getBatchQueries().length, 0);
});

test("missing, archived, and cross-department StudentBatch targets are hidden as not found", async () => {
  for (const state of [
    (() => {
      const value = baseState();
      value.batches = [];
      return value;
    })(),
    (() => {
      const value = baseState();
      value.batches[0]!.archivedAt = new Date("2026-08-23T00:00:00.000Z");
      return value;
    })(),
    (() => {
      const value = baseState();
      value.batches[0]!.departmentId = "department-b";
      return value;
    })(),
  ]) {
    assert.equal(
      (await harness(state).bind()).outcome,
      "STUDENT_BATCH_NOT_FOUND",
    );
  }
});

test("dependency corruption and exact programme mismatches fail closed", async () => {
  const corruptVersion = baseState();
  corruptVersion.curriculum.curriculumVersion.departmentId = "department-b";
  assert.equal(
    (await harness(corruptVersion).bind()).outcome,
    "DEPENDENCY_SCOPE_MISMATCH",
  );

  const courseMismatch = baseState();
  courseMismatch.offering!.course.academicProgramId = "program-b";
  courseMismatch.offering!.course.academicProgram = {
    id: "program-b",
    departmentId: "department-a",
  };
  courseMismatch.curriculum.course.academicProgramId = "program-b";
  courseMismatch.curriculum.course.academicProgram = {
    id: "program-b",
    departmentId: "department-a",
  };
  assert.equal(
    (await harness(courseMismatch).bind()).outcome,
    "PROGRAMME_MISMATCH",
  );

  const curriculumMismatch = baseState();
  curriculumMismatch.curriculum.curriculumVersion.academicProgramId =
    "program-b";
  curriculumMismatch.curriculum.curriculumVersion.academicProgram = {
    id: "program-b",
    departmentId: "department-a",
  };
  assert.equal(
    (await harness(curriculumMismatch).bind()).outcome,
    "PROGRAMME_MISMATCH",
  );

  const batchMismatch = baseState();
  batchMismatch.batches[0] = batch("batch-a", "program-b");
  assert.equal(
    (await harness(batchMismatch).bind()).outcome,
    "PROGRAMME_MISMATCH",
  );
});

test("first exact binding and success audit commit atomically with programme accountability", async () => {
  const h = harness();
  const result = await h.bind();
  assert.equal(result.outcome, "BOUND");
  if (result.outcome !== "BOUND") throw new Error("expected bound offering");
  assert.deepEqual(
    (result.offering as { studentBatch: unknown }).studentBatch,
    {
      id: "batch-a",
      academicProgramId: "program-a",
      academicSessionId: "session-a",
      code: "BATCH-A",
      name: "batch-a",
      archivedAt: null,
    },
  );
  assert.equal(h.getState().offering!.studentBatchId, "batch-a");
  assert.equal(h.getState().audits.length, 1);
  const audit = h.getState().audits[0] as {
    data: { action: string; contextJson: Record<string, unknown> };
  };
  assert.equal(
    audit.data.action,
    "course-management.offering.student-batch-bound",
  );
  assert.deepEqual(audit.data.contextJson, {
    courseOfferingId: "offering-a",
    studentBatchId: "batch-a",
    courseId: "course-a",
    curriculumCourseId: "curriculum-a",
    curriculumVersionId: "curriculum-version-a",
    academicProgramId: "program-a",
    courseAcademicProgramId: "program-a",
    curriculumAcademicProgramId: "program-a",
    studentBatchAcademicProgramId: "program-a",
    previousBindingValue: null,
    newBindingValue: "batch-a",
  });

  const rollback = harness();
  rollback.setFailAudit();
  await assert.rejects(rollback.bind(), /audit unavailable/);
  assert.equal(rollback.getState().offering!.studentBatchId, null);
  assert.equal(rollback.getState().audits.length, 0);
});

test("same target is idempotent without duplicate audit and a different target cannot overwrite", async () => {
  const same = harness();
  assert.equal((await same.bind()).outcome, "BOUND");
  assert.equal((await same.bind()).outcome, "ALREADY_BOUND");
  assert.equal(same.getState().audits.length, 1);

  const differentState = baseState();
  differentState.offering!.studentBatchId = "batch-a";
  const different = harness(differentState);
  assert.equal((await different.bind("batch-b")).outcome, "BINDING_CONFLICT");
  assert.equal(different.getState().offering!.studentBatchId, "batch-a");
  assert.equal(different.getState().audits.length, 0);
});

test("archived historical exact binding remains idempotent without a new audit", async () => {
  const state = baseState();
  state.offering!.studentBatchId = "batch-a";
  state.batches[0]!.archivedAt = new Date("2026-08-23T00:00:00.000Z");
  const h = harness(state);

  const result = await h.bind();
  assert.equal(result.outcome, "ALREADY_BOUND");
  assert.equal(h.getState().offering!.studentBatchId, "batch-a");
  assert.equal(h.getState().audits.length, 0);
  assert.doesNotMatch(h.getLockQueries()[2]!, /"archived_at" IS NULL/);
  assert.deepEqual(
    (h.getBatchQueries()[0] as { where: Record<string, unknown> }).where,
    {
      id: "batch-a",
      departmentId: "department-a",
    },
  );
});

test("historical archive exception cannot enable rebinding or cross-department substitution", async () => {
  const differentTargetState = baseState();
  differentTargetState.offering!.studentBatchId = "batch-a";
  differentTargetState.batches[0]!.archivedAt = new Date(
    "2026-08-23T00:00:00.000Z",
  );
  const differentTarget = harness(differentTargetState);
  assert.equal(
    (await differentTarget.bind("batch-b")).outcome,
    "BINDING_CONFLICT",
  );
  assert.equal(differentTarget.getState().offering!.studentBatchId, "batch-a");
  assert.equal(differentTarget.getState().audits.length, 0);

  const crossDepartmentState = baseState();
  crossDepartmentState.offering!.studentBatchId = "batch-a";
  crossDepartmentState.batches[0]!.departmentId = "department-b";
  crossDepartmentState.batches[0]!.archivedAt = new Date(
    "2026-08-23T00:00:00.000Z",
  );
  const crossDepartment = harness(crossDepartmentState);
  assert.equal(
    (await crossDepartment.bind()).outcome,
    "STUDENT_BATCH_NOT_FOUND",
  );
  assert.equal(crossDepartment.getState().audits.length, 0);
});

test("dependency- and programme-corrupt historical exact bindings fail closed", async () => {
  const dependencyState = baseState();
  dependencyState.offering!.studentBatchId = "batch-a";
  dependencyState.batches[0]!.archivedAt = new Date(
    "2026-08-23T00:00:00.000Z",
  );
  dependencyState.batches[0]!.academicSession.departmentId = "department-b";
  const dependency = harness(dependencyState);
  assert.equal(
    (await dependency.bind()).outcome,
    "DEPENDENCY_SCOPE_MISMATCH",
  );
  assert.equal(dependency.getState().audits.length, 0);

  const programmeState = baseState();
  programmeState.offering!.studentBatchId = "batch-a";
  programmeState.batches[0] = batch("batch-a", "program-b");
  programmeState.batches[0]!.archivedAt = new Date(
    "2026-08-23T00:00:00.000Z",
  );
  const programme = harness(programmeState);
  assert.equal((await programme.bind()).outcome, "PROGRAMME_MISMATCH");
  assert.equal(programme.getState().offering!.studentBatchId, "batch-a");
  assert.equal(programme.getState().audits.length, 0);
});

test("batch-aware uniqueness allows different StudentBatches and rejects the same exact batch identity", async () => {
  const differentBatch = baseState();
  differentBatch.otherOfferings.push({
    id: "offering-b",
    departmentId: "department-a",
    academicTermId: "term-a",
    studentBatchId: "batch-b",
    curriculumCourseId: "curriculum-a",
    sectionCode: "A",
  });
  assert.equal((await harness(differentBatch).bind()).outcome, "BOUND");

  const sameBatch = baseState();
  sameBatch.otherOfferings.push({
    ...differentBatch.otherOfferings[0]!,
    studentBatchId: "batch-a",
  });
  const duplicate = harness(sameBatch);
  assert.equal((await duplicate.bind()).outcome, "BINDING_CONFLICT");
  assert.equal(duplicate.getUpdateCalls(), 0);
  assert.equal(duplicate.getState().offering!.studentBatchId, null);
});

test("guarded concurrent same target converges and different targets remain immutable", async () => {
  const same = harness();
  same.setConcurrentTarget("batch-a");
  assert.equal((await same.bind()).outcome, "ALREADY_BOUND");
  assert.equal(same.getState().offering!.studentBatchId, "batch-a");
  assert.equal(same.getState().audits.length, 1);

  const different = harness();
  different.setConcurrentTarget("batch-b");
  assert.equal((await different.bind()).outcome, "BINDING_CONFLICT");
  assert.equal(different.getState().offering!.studentBatchId, "batch-b");
  assert.equal(different.getState().audits.length, 1);
});

test("known exact batched unique conflicts map deterministically and unrelated errors propagate", async () => {
  const unique = harness();
  unique.setUpdateError(
    new PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "6.6.0",
      meta: {
        target: "course_offering_bound_batched_curriculum_identity_uq",
      },
    }),
  );
  assert.equal((await unique.bind()).outcome, "BINDING_CONFLICT");
  assert.equal(unique.getState().offering!.studentBatchId, null);

  const unrelated = harness();
  unrelated.setUpdateError(new Error("database unavailable"));
  await assert.rejects(unrelated.bind(), /database unavailable/);

  const guardMiss = harness();
  guardMiss.setForceGuardMiss();
  await assert.rejects(guardMiss.bind(), /STUDENT_BATCH_BINDING_GUARD_MISSED/);
});
