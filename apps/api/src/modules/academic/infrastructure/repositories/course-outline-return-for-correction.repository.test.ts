import assert from "node:assert/strict";
import test from "node:test";

import {
  BatchCoordinatorAssignmentStatus,
  CourseOutlineStatus,
  DepartmentStatus,
  Prisma,
  UserStatus,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { ACADEMIC_AUDIT_EVENTS } from "../../domain/academic.audit-events";
import { PrismaAcademicRepository } from "./prisma-academic.repository";

const submittedAt = new Date("2026-08-25T08:00:00.000Z");
const assignedAt = new Date("2026-08-24T08:00:00.000Z");

function correctionInput(
  overrides: Partial<{
    departmentId: string;
    actorUserId: string;
    courseOfferingId: string;
    courseOutlineVersionId: string;
    reason: string;
  }> = {},
) {
  return {
    departmentId: "department-a",
    actorUserId: "coordinator-a",
    courseOfferingId: "offering-a",
    courseOutlineVersionId: "outline-a",
    reason: "Needs more info",
    requestId: "request-a",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
    ...overrides,
  };
}

function offering(overrides: Record<string, unknown> = {}) {
  return {
    id: "offering-a",
    departmentId: "department-a",
    studentBatchId: "batch-a" as string | null,
    academicTermId: "term-a",
    curriculumCourseId: "curriculum-a" as string | null,
    syllabusVersionId: "syllabus-a" as string | null,
    ...overrides,
  };
}

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: "coordinator-assignment-a",
    departmentId: "department-a",
    studentBatchId: "batch-a",
    academicTermId: "term-a",
    coordinatorUserId: "coordinator-a",
    status: BatchCoordinatorAssignmentStatus.ACTIVE,
    assignedAt,
    expiresAt: null as Date | null,
    unassignedAt: null as Date | null,
    archivedAt: null as Date | null,
    ...overrides,
  };
}

function outline(
  status: CourseOutlineStatus = CourseOutlineStatus.COORDINATOR_REVIEW,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "outline-a",
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    versionNumber: 4,
    status,
    courseSummary: "Sensitive summary",
    deliveryPlan: "Sensitive delivery plan",
    teachingStrategies: "Sensitive teaching strategies",
    assessmentStrategy: "Sensitive assessment strategy",
    evaluationPolicy: "Sensitive evaluation policy",
    makeUpProcedure: "Sensitive make-up procedure",
    submittedAt,
    approvedAt: null as Date | null,
    activatedAt: null as Date | null,
    archivedAt: null as Date | null,
    createdAt: new Date("2026-08-25T07:00:00.000Z"),
    updatedAt: new Date("2026-08-25T08:00:00.000Z"),
    ...overrides,
  };
}

type AssignmentRecord = ReturnType<typeof assignment>;
type OutlineRecord = ReturnType<typeof outline>;

function sqlText(query: unknown) {
  return (
    (query as { sql?: string; text?: string }).sql ??
    (query as { text?: string }).text ??
    String(query)
  );
}

function sqlValues(query: unknown) {
  return ((query as { values?: unknown[] }).values ?? []) as string[];
}

function knownRequestError(code: string, meta?: Record<string, unknown>) {
  return new PrismaClientKnownRequestError("test Prisma failure", {
    code,
    clientVersion: "6.19.3",
    meta,
  });
}

function harness(
  options: {
    offering?: ReturnType<typeof offering> | null;
    assignment?: AssignmentRecord | null;
    outline?: OutlineRecord | null;
    invalidParent?:
      | "department"
      | "batch"
      | "batch-program"
      | "batch-session"
      | "term"
      | "user";
    expiresAtEvaluation?: boolean;
    futureAssignedAt?: boolean;
    updateCount?: number;
    afterMiss?: OutlineRecord | null;
    auditError?: Error;
    transactionErrors?: unknown[];
  } = {},
) {
  const authoritativeOffering =
    options.offering === undefined ? offering() : options.offering;
  let authorityAssignment =
    options.assignment === undefined ? assignment() : options.assignment;
  let outlineRecord =
    options.outline === undefined ? outline() : options.outline;
  const calls: Array<{ kind: string; args: any }> = [];
  const audits: Array<{ data: Record<string, any> }> = [];
  const correctionRequests: Array<Record<string, any>> = [];
  const transactions: unknown[] = [];
  const transactionErrors = [...(options.transactionErrors ?? [])];

  const tx = {
    $queryRaw: async (query: unknown) => {
      const sql = sqlText(query);
      const values = sqlValues(query);
      if (/FROM "course_offerings" co/.test(sql)) {
        calls.push({ kind: "offering-lock", args: query });
        if (
          !authoritativeOffering ||
          values[0] !== authoritativeOffering.id ||
          values[1] !== authoritativeOffering.departmentId
        ) {
          return [];
        }
        return [structuredClone(authoritativeOffering)];
      }
      if (/FROM "batch_coordinator_assignments" bca/.test(sql)) {
        calls.push({ kind: "assignment-lock", args: query });
        if (
          !authorityAssignment ||
          values[0] !== authorityAssignment.departmentId ||
          values[1] !== authorityAssignment.studentBatchId ||
          values[2] !== authorityAssignment.academicTermId ||
          values[3] !== authorityAssignment.coordinatorUserId
        ) {
          return [];
        }
        return [{ id: authorityAssignment.id }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    batchCoordinatorAssignment: {
      findFirst: async (args: any) => {
        calls.push({ kind: "authority-revalidation", args });
        if (!authorityAssignment || options.invalidParent) return null;

        const evaluatedAt = args.where.assignedAt.lte as Date;
        if (options.expiresAtEvaluation) {
          authorityAssignment = {
            ...authorityAssignment,
            expiresAt: evaluatedAt,
          };
        }
        if (options.futureAssignedAt) {
          authorityAssignment = {
            ...authorityAssignment,
            assignedAt: new Date(evaluatedAt.getTime() + 1),
          };
        }

        const usable =
          authorityAssignment.id === args.where.id &&
          authorityAssignment.departmentId === args.where.departmentId &&
          authorityAssignment.studentBatchId === args.where.studentBatchId &&
          authorityAssignment.academicTermId === args.where.academicTermId &&
          authorityAssignment.coordinatorUserId ===
            args.where.coordinatorUserId &&
          authorityAssignment.status ===
            BatchCoordinatorAssignmentStatus.ACTIVE &&
          authorityAssignment.archivedAt === null &&
          authorityAssignment.unassignedAt === null &&
          authorityAssignment.assignedAt <= evaluatedAt &&
          (authorityAssignment.expiresAt === null ||
            authorityAssignment.expiresAt > evaluatedAt);
        return usable ? { id: authorityAssignment.id } : null;
      },
    },
    courseOutlineVersion: {
      findFirst: async (args: any) => {
        calls.push({ kind: "outline-read", args });
        if (
          !outlineRecord ||
          args.where.id !== outlineRecord.id ||
          args.where.departmentId !== outlineRecord.departmentId ||
          args.where.courseOfferingId !== outlineRecord.courseOfferingId
        ) {
          return null;
        }
        if (
          args.select?.status === true &&
          args.select?.id !== true &&
          Object.keys(args.select).length === 5
        ) {
          const afterMiss =
            options.afterMiss === undefined ? outlineRecord : options.afterMiss;
          return afterMiss
            ? {
                status: afterMiss.status,
                submittedAt: afterMiss.submittedAt,
                approvedAt: afterMiss.approvedAt,
                activatedAt: afterMiss.activatedAt,
                archivedAt: afterMiss.archivedAt,
              }
            : null;
        }
        return structuredClone(outlineRecord);
      },
      updateMany: async (args: any) => {
        calls.push({ kind: "update", args });
        const count = options.updateCount ?? 1;
        if (count === 1 && outlineRecord) {
          outlineRecord = { ...outlineRecord, ...args.data };
        }
        return { count };
      },
    },
    courseOutlineCorrectionRequest: {
      create: async (args: { data: Record<string, any> }) => {
        calls.push({ kind: "correction-request", args });
        const record = {
          id: `correction-req-${correctionRequests.length + 1}`,
          departmentId: args.data.departmentId,
          courseOfferingId: args.data.courseOfferingId,
          courseOutlineVersionId: args.data.courseOutlineVersionId,
          batchCoordinatorAssignmentId: args.data.batchCoordinatorAssignmentId,
          actorUserId: args.data.actorUserId,
          reason: args.data.reason,
          returnedAt: args.data.returnedAt,
          createdAt: new Date(),
        };
        correctionRequests.push(structuredClone(record));
        return structuredClone(record);
      },
    },
    auditLog: {
      create: async (args: { data: Record<string, any> }) => {
        calls.push({ kind: "audit", args });
        if (options.auditError) throw options.auditError;
        audits.push(structuredClone(args));
        return { id: `audit-${audits.length}` };
      },
    },
  };

  const prisma = {
    $transaction: async (
      operation: (client: typeof tx) => Promise<unknown>,
      transactionOptions: unknown,
    ) => {
      transactions.push(transactionOptions);
      const failure = transactionErrors.shift();
      if (failure) throw failure;

      const beforeOutline = structuredClone(outlineRecord);
      const auditCount = audits.length;
      const correctionRequestCount = correctionRequests.length;
      try {
        return await operation(tx);
      } catch (error) {
        outlineRecord = beforeOutline;
        audits.splice(auditCount);
        correctionRequests.splice(correctionRequestCount);
        throw error;
      }
    },
  };

  return {
    audits,
    correctionRequests,
    calls,
    transactions,
    outline: () => structuredClone(outlineRecord),
    setOutlineStatus: (status: CourseOutlineStatus) => {
      if (outlineRecord) outlineRecord.status = status;
    },
    repository: new PrismaAcademicRepository(prisma as never),
  };
}

test("exact assigned Coordinator returns for correction after offering and assignment locks", async () => {
  const h = harness();
  const before = h.outline()!;
  const result =
    await h.repository.returnCourseOutlineForCorrection(correctionInput());
  assert.equal(result.outcome, "RETURNED_FOR_CORRECTION");
  if (result.outcome !== "RETURNED_FOR_CORRECTION") return;

  assert.equal(
    result.courseOutlineVersion.status,
    CourseOutlineStatus.RETURNED_FOR_CORRECTION,
  );
  assert.deepEqual(
    h.calls.slice(0, 8).map((call) => call.kind),
    [
      "offering-lock",
      "assignment-lock",
      "authority-revalidation",
      "outline-read",
      "update",
      "correction-request",
      "outline-read",
      "audit",
    ],
  );
  assert.equal(h.transactions.length, 1);
  assert.equal(
    result.courseOutlineCorrectionRequest.id,
    "correction-req-1",
  );
  assert.equal(
    result.courseOutlineCorrectionRequest.reason,
    "Needs more info",
  );
  assert.deepEqual(
    result.courseOutlineCorrectionRequest,
    h.correctionRequests[0],
  );
  assert.deepEqual(h.transactions[0], {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 30_000,
  });

  const offeringLock = h.calls[0]!.args;
  const assignmentLock = h.calls[1]!.args;
  assert.match(sqlText(offeringLock), /FOR UPDATE OF co/);
  assert.deepEqual(sqlValues(offeringLock), ["offering-a", "department-a"]);
  assert.match(sqlText(assignmentLock), /FOR UPDATE OF bca/);
  assert.deepEqual(sqlValues(assignmentLock), [
    "department-a",
    "batch-a",
    "term-a",
    "coordinator-a",
  ]);

  const authority = h.calls.find(
    (call) => call.kind === "authority-revalidation",
  )!.args.where;
  assert.equal(authority.status, BatchCoordinatorAssignmentStatus.ACTIVE);
  assert.equal(authority.archivedAt, null);
  assert.equal(authority.unassignedAt, null);
  assert.ok(authority.assignedAt.lte instanceof Date);
  assert.equal(authority.OR[1].expiresAt.gt, authority.assignedAt.lte);
  assert.deepEqual(authority.department.is, {
    id: "department-a",
    status: DepartmentStatus.ACTIVE,
    archivedAt: null,
    deletedAt: null,
  });
  assert.equal(authority.studentBatch.is.id, "batch-a");
  assert.equal(authority.studentBatch.is.departmentId, "department-a");
  assert.equal(authority.studentBatch.is.archivedAt, null);
  assert.deepEqual(authority.studentBatch.is.academicProgram.is, {
    departmentId: "department-a",
    archivedAt: null,
  });
  assert.deepEqual(authority.studentBatch.is.academicSession.is, {
    departmentId: "department-a",
    archivedAt: null,
  });
  assert.deepEqual(authority.academicTerm.is, {
    id: "term-a",
    departmentId: "department-a",
    archivedAt: null,
  });
  assert.deepEqual(authority.coordinatorUser.is, {
    id: "coordinator-a",
    departmentId: "department-a",
    status: UserStatus.ACTIVE,
    archivedAt: null,
    deletedAt: null,
  });

  const after = h.outline()!;
  for (const field of [
    "submittedAt",
    "courseSummary",
    "deliveryPlan",
    "teachingStrategies",
    "assessmentStrategy",
    "evaluationPolicy",
    "makeUpProcedure",
    "departmentId",
    "courseOfferingId",
    "curriculumCourseId",
    "syllabusVersionId",
    "versionNumber",
    "approvedAt",
    "activatedAt",
    "archivedAt",
  ] as const) {
    assert.deepEqual(after[field], before[field]);
  }
});

test("null StudentBatch and cross-department offerings fail before assignment lookup", async () => {
  for (const [h, input] of [
    [harness({ offering: offering({ studentBatchId: null }) }), correctionInput()],
    [harness(), correctionInput({ departmentId: "department-b" })],
    [harness(), correctionInput({ courseOfferingId: "offering-b" })],
  ] as const) {
    assert.deepEqual(
      await h.repository.returnCourseOutlineForCorrection(input),
      {
        outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND",
      },
    );
    assert.equal(
      h.calls.some((call) => call.kind === "assignment-lock"),
      false,
    );
    assert.equal(h.audits.length, 0);
  }
});

test("missing or wrong four-part Coordinator assignment identity fails safely", async () => {
  for (const [h, input] of [
    [harness({ assignment: null }), correctionInput()],
    [harness(), correctionInput({ actorUserId: "coordinator-b" })],
    [
      harness({ assignment: assignment({ studentBatchId: "batch-b" }) }),
      correctionInput(),
    ],
    [
      harness({ assignment: assignment({ academicTermId: "term-b" }) }),
      correctionInput(),
    ],
  ] as const) {
    assert.deepEqual(
      await h.repository.returnCourseOutlineForCorrection(input),
      {
        outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND",
      },
    );
    assert.equal(h.audits.length, 0);
  }
});

test("inactive, archived, unassigned, expired, equality-expired, and future assignments fail after locking", async () => {
  const cases = [
    harness({
      assignment: assignment({
        status: BatchCoordinatorAssignmentStatus.INACTIVE,
      }),
    }),
    harness({
      assignment: assignment({
        status: BatchCoordinatorAssignmentStatus.ARCHIVED,
        archivedAt: submittedAt,
      }),
    }),
    harness({ assignment: assignment({ unassignedAt: submittedAt }) }),
    harness({ assignment: assignment({ expiresAt: submittedAt }) }),
    harness({ expiresAtEvaluation: true }),
    harness({ futureAssignedAt: true }),
  ];

  for (const h of cases) {
    assert.deepEqual(
      await h.repository.returnCourseOutlineForCorrection(correctionInput()),
      {
        outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND",
      },
    );
    assert.deepEqual(
      h.calls.slice(0, 3).map((call) => call.kind),
      ["offering-lock", "assignment-lock", "authority-revalidation"],
    );
    assert.equal(h.audits.length, 0);
  }
});

test("every invalid authority parent fails closed under the verified parent predicates", async () => {
  for (const invalidParent of [
    "department",
    "batch",
    "batch-program",
    "batch-session",
    "term",
    "user",
  ] as const) {
    const h = harness({ invalidParent });
    assert.deepEqual(
      await h.repository.returnCourseOutlineForCorrection(correctionInput()),
      {
        outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND",
      },
    );
    assert.equal(h.audits.length, 0);
  }
});

test("wrong nested outline and CurriculumCourse or SyllabusVersion mismatch are safe not-found", async () => {
  for (const [h, input] of [
    [harness(), correctionInput({ courseOutlineVersionId: "outline-b" })],
    [harness({ outline: null }), correctionInput()],
    [
      harness({ outline: outline(undefined, { curriculumCourseId: "other" }) }),
      correctionInput(),
    ],
    [
      harness({ outline: outline(undefined, { syllabusVersionId: "other" }) }),
      correctionInput(),
    ],
  ] as const) {
    assert.deepEqual(
      await h.repository.returnCourseOutlineForCorrection(input),
      {
        outcome: "OUTLINE_NOT_FOUND",
      },
    );
    assert.equal(
      h.calls.some((call) => call.kind === "update"),
      false,
    );
    assert.equal(h.audits.length, 0);
  }
});

test("only a well-formed COORDINATOR_REVIEW outline can be returned for correction", async () => {
  for (const status of [
    CourseOutlineStatus.DRAFT,
    CourseOutlineStatus.SUBMITTED_BY_TEACHER,
    CourseOutlineStatus.RETURNED_FOR_CORRECTION,
    CourseOutlineStatus.APPROVED,
    CourseOutlineStatus.ACTIVE,
    CourseOutlineStatus.ARCHIVED,
  ]) {
    const h = harness({ outline: outline(status) });
    assert.deepEqual(
      await h.repository.returnCourseOutlineForCorrection(correctionInput()),
      {
        outcome: "OUTLINE_NOT_RETURNABLE",
      },
    );
    assert.equal(h.audits.length, 0);
  }

  for (const malformed of [
    { submittedAt: null },
    { approvedAt: submittedAt },
    { activatedAt: submittedAt },
    { archivedAt: submittedAt },
  ]) {
    const h = harness({ outline: outline(undefined, malformed) });
    assert.deepEqual(
      await h.repository.returnCourseOutlineForCorrection(correctionInput()),
      {
        outcome: "OUTLINE_NOT_RETURNABLE",
      },
    );
    assert.equal(h.audits.length, 0);
  }
});

test("conditional transition uses exact identity and lifecycle predicates", async () => {
  const h = harness();
  await h.repository.returnCourseOutlineForCorrection(correctionInput());
  const mutation = h.calls.find((call) => call.kind === "update")!.args;
  assert.deepEqual(mutation.where, {
    id: "outline-a",
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    status: CourseOutlineStatus.COORDINATOR_REVIEW,
    submittedAt: { not: null },
    approvedAt: null,
    activatedAt: null,
    archivedAt: null,
  });
  assert.deepEqual(mutation.data, {
    status: CourseOutlineStatus.RETURNED_FOR_CORRECTION,
  });
});

test("conditional mutation miss distinguishes hidden object, lifecycle race, and write conflict", async () => {
  const missing = harness({ updateCount: 0, afterMiss: null });
  assert.deepEqual(
    await missing.repository.returnCourseOutlineForCorrection(correctionInput()),
    {
      outcome: "OUTLINE_NOT_FOUND",
    },
  );

  const lifecycle = harness({
    updateCount: 0,
    afterMiss: outline(CourseOutlineStatus.ACTIVE),
  });
  assert.deepEqual(
    await lifecycle.repository.returnCourseOutlineForCorrection(
      correctionInput(),
    ),
    {
      outcome: "OUTLINE_NOT_RETURNABLE",
    },
  );

  const conflict = harness({ updateCount: 0 });
  assert.deepEqual(
    await conflict.repository.returnCourseOutlineForCorrection(
      correctionInput(),
    ),
    {
      outcome: "CONCURRENT_CONFLICT",
    },
  );
  assert.equal(conflict.audits.length, 0);
});

test("repeated return-for-correction conflicts and commits exactly one success audit", async () => {
  const h = harness();
  assert.equal(
    (await h.repository.returnCourseOutlineForCorrection(correctionInput()))
      .outcome,
    "RETURNED_FOR_CORRECTION",
  );
  assert.deepEqual(
    await h.repository.returnCourseOutlineForCorrection(correctionInput()),
    {
      outcome: "OUTLINE_NOT_RETURNABLE",
    },
  );
  assert.equal(h.audits.length, 1);
});

test("success transition persists immutable correction history and uses exact authority assignment/structural context only", async () => {
  const h = harness();
  await h.repository.returnCourseOutlineForCorrection(correctionInput());

  const historyCalls = h.calls.filter((c) => c.kind === "correction-request");
  assert.equal(historyCalls.length, 1);
  assert.deepEqual(historyCalls[0]!.args.data, {
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    courseOutlineVersionId: "outline-a",
    batchCoordinatorAssignmentId: "coordinator-assignment-a",
    actorUserId: "coordinator-a",
    reason: "Needs more info",
    returnedAt: historyCalls[0]!.args.data.returnedAt,
  });

  assert.equal(h.audits.length, 1);
  const audit = h.audits[0]!.data;
  assert.equal(
    audit.action,
    ACADEMIC_AUDIT_EVENTS.COURSE_OUTLINE_RETURNED_FOR_CORRECTION,
  );
  assert.equal(audit.actorUserId, "coordinator-a");
  assert.equal(audit.departmentId, "department-a");
  assert.equal(audit.targetType, "course_outline_version");
  assert.equal(audit.targetId, "outline-a");
  assert.equal(audit.outcome, "SUCCESS");
  assert.ok(audit.occurredAt instanceof Date);
  assert.deepEqual(audit.contextJson, {
    courseOutlineVersionId: "outline-a",
    courseOfferingId: "offering-a",
    studentBatchId: "batch-a",
    academicTermId: "term-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    versionNumber: 4,
    batchCoordinatorAssignmentId: "coordinator-assignment-a",
    courseOutlineCorrectionRequestId: "correction-req-1",
    previousStatus: CourseOutlineStatus.COORDINATOR_REVIEW,
    newStatus: CourseOutlineStatus.RETURNED_FOR_CORRECTION,
    transitionTimestamp: audit.occurredAt.toISOString(),
  });
  assert.equal("reason" in audit.contextJson, false);
  const serialized = JSON.stringify(audit.contextJson);
  for (const narrative of [
    "Sensitive summary",
    "Sensitive delivery plan",
    "Sensitive teaching strategies",
    "Sensitive assessment strategy",
    "Sensitive evaluation policy",
    "Sensitive make-up procedure",
  ]) {
    assert.equal(serialized.includes(narrative), false);
  }
});

test("audit failure rolls the return-for-correction transition back", async () => {
  const h = harness({ auditError: new Error("audit unavailable") });
  await assert.rejects(
    h.repository.returnCourseOutlineForCorrection(correctionInput()),
    /audit unavailable/,
  );
  assert.equal(h.outline()!.status, CourseOutlineStatus.COORDINATOR_REVIEW);
  assert.equal(h.correctionRequests.length, 0);
  assert.equal(h.audits.length, 0);
});

test("retryable Serializable conflicts retry complete transactions and retain verified limits", async () => {
  for (const error of [
    knownRequestError("P2034"),
    knownRequestError("P2010", { code: "40001" }),
  ]) {
    const h = harness({ transactionErrors: [error, error] });
    assert.equal(
      (await h.repository.returnCourseOutlineForCorrection(correctionInput()))
        .outcome,
      "RETURNED_FOR_CORRECTION",
    );
    assert.equal(h.transactions.length, 3);
    assert.equal(h.audits.length, 1);
  }
});

test("only raw P2010 SQLSTATE 40001 retries", async () => {
  for (const error of [
    knownRequestError("P2010"),
    knownRequestError("P2010", { code: "42601" }),
    knownRequestError("P2010", { code: 40001 }),
    // 40P01 is PostgreSQL deadlock SQLSTATE. The lock-mode correction prevents
    // the deadlock from occurring; retrying it would hide the real winner.
    knownRequestError("P2010", { code: "40P01" }),
    knownRequestError("P2028"),
    new Error("application failure"),
  ]) {
    const h = harness({ transactionErrors: [error] });
    await assert.rejects(
      h.repository.returnCourseOutlineForCorrection(correctionInput()),
      (caught: unknown) => caught === error,
    );
    assert.equal(h.transactions.length, 1);
    assert.equal(h.audits.length, 0);
  }
});

test("three exhausted Serializable attempts return a controlled conflict", async () => {
  const error = knownRequestError("P2010", { code: "40001" });
  const h = harness({ transactionErrors: [error, error, error] });
  assert.deepEqual(
    await h.repository.returnCourseOutlineForCorrection(correctionInput()),
    {
      outcome: "CONCURRENT_CONFLICT",
    },
  );
  assert.equal(h.transactions.length, 3);
  assert.equal(h.audits.length, 0);
});

test("correction history is append-only across multiple legitimate cycles", async () => {
  const h = harness();

  // First cycle
  await h.repository.returnCourseOutlineForCorrection(
    correctionInput({ reason: "First return" }),
  );

  assert.equal(h.correctionRequests.length, 1);
  assert.equal(h.correctionRequests[0]!.reason, "First return");
  assert.equal(h.outline()!.status, CourseOutlineStatus.RETURNED_FOR_CORRECTION);

  // Simulate a later cycle
  h.setOutlineStatus(CourseOutlineStatus.COORDINATOR_REVIEW);

  // Second cycle
  await h.repository.returnCourseOutlineForCorrection(
    correctionInput({ reason: "Second return" }),
  );

  assert.equal(h.correctionRequests.length, 2);
  assert.equal(h.correctionRequests[0]!.reason, "First return");
  assert.equal(h.correctionRequests[1]!.reason, "Second return");
  assert.ok(h.correctionRequests[0]!.id);
  assert.ok(h.correctionRequests[1]!.id);
  assert.notEqual(h.correctionRequests[0]!.id, h.correctionRequests[1]!.id);
});
