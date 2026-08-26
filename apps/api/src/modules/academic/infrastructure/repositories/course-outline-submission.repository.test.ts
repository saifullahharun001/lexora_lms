import assert from "node:assert/strict";
import test from "node:test";

import { CourseOutlineStatus } from "@prisma/client";

import { ACADEMIC_AUDIT_EVENTS } from "../../domain/academic.audit-events";
import { PrismaAcademicRepository } from "./prisma-academic.repository";

const transitionAt = new Date("2026-08-20T08:30:00.000Z");
const previousSubmittedAt = new Date("2026-08-20T07:00:00.000Z");

function submissionInput(
  overrides: Partial<{
    departmentId: string;
    courseOfferingId: string;
    courseOutlineVersionId: string;
    actorUserId: string;
    transitionAt: Date;
  }> = {},
) {
  return {
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    courseOutlineVersionId: "outline-a",
    actorUserId: "teacher-a",
    transitionAt,
    requestId: "request-a",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
    ...overrides,
  };
}

function updateInput() {
  return {
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    courseOutlineVersionId: "outline-a",
    actorUserId: "teacher-a",
    requestId: "request-a",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
    courseSummary: "Edited before corrected resubmission",
  };
}

function initialOutline(status: CourseOutlineStatus) {
  return {
    id: "outline-a",
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    versionNumber: 5,
    status,
    courseSummary: "Sensitive narrative summary",
    deliveryPlan: "Sensitive delivery plan",
    teachingStrategies: "Sensitive teaching strategies",
    assessmentStrategy: "Sensitive assessment strategy",
    evaluationPolicy: "Sensitive evaluation policy",
    makeUpProcedure: "Sensitive make-up procedure",
    submittedAt:
      status === CourseOutlineStatus.DRAFT ? null : previousSubmittedAt,
    approvedAt: null as Date | null,
    activatedAt: null as Date | null,
    archivedAt: null as Date | null,
    createdAt: new Date("2026-08-20T00:00:00.000Z"),
    updatedAt: new Date("2026-08-20T00:00:00.000Z"),
  };
}

function correctionRequest(
  overrides: Partial<{
    id: string;
    returnedAt: Date;
    createdAt: Date;
    reason: string;
  }> = {},
) {
  return {
    id: "correction-request-a",
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    courseOutlineVersionId: "outline-a",
    batchCoordinatorAssignmentId: "coordinator-assignment-a",
    actorUserId: "coordinator-a",
    reason: "Sensitive correction reason",
    returnedAt: new Date("2026-08-20T07:30:00.000Z"),
    createdAt: new Date("2026-08-20T07:30:00.000Z"),
    ...overrides,
  };
}

function harness(
  status: CourseOutlineStatus = CourseOutlineStatus.DRAFT,
  options: {
    assignment?: "ACTIVE" | "INACTIVE" | "UNASSIGNED" | "ARCHIVED";
    authorityLocked?: boolean;
    offeringFound?: boolean;
    outlineFound?: boolean;
    identityMatches?: boolean;
    outlineOverrides?: Partial<ReturnType<typeof initialOutline>>;
    offeringOverrides?: Partial<{
      departmentId: string;
      studentBatchId: string | null;
      academicTermId: string;
      curriculumCourseId: string | null;
      syllabusVersionId: string | null;
    }>;
    correctionRequests?: Array<ReturnType<typeof correctionRequest>>;
    updateCount?: number;
    statusAfterMiss?: CourseOutlineStatus | null;
    auditError?: Error;
    serializeTransactions?: boolean;
  } = {},
) {
  let record = { ...initialOutline(status), ...options.outlineOverrides };
  const authoritativeOffering = {
    id: "offering-a",
    departmentId: "department-a",
    studentBatchId: "batch-a" as string | null,
    academicTermId: "term-a",
    curriculumCourseId: "curriculum-a" as string | null,
    syllabusVersionId: "syllabus-a" as string | null,
    ...options.offeringOverrides,
  };
  const correctionRequests = structuredClone(
    options.correctionRequests ??
      (status === CourseOutlineStatus.RETURNED_FOR_CORRECTION
        ? [correctionRequest()]
        : []),
  );
  const audits: unknown[] = [];
  const calls: Array<{ kind: string; args: any }> = [];
  let transactionTail = Promise.resolve();

  const tx = {
    $queryRaw: async (args: any) => {
      calls.push({ kind: "authority-lock", args });
      if (
        options.authorityLocked === false ||
        options.offeringFound === false ||
        options.assignment === "INACTIVE" ||
        options.assignment === "UNASSIGNED" ||
        options.assignment === "ARCHIVED" ||
        args.values[0] !== "department-a" ||
        args.values[1] !== "teacher-a" ||
        args.values[2] !== "offering-a" ||
        args.values[3] !== "department-a"
      ) {
        return [];
      }
      return [
        {
          courseOfferingId: authoritativeOffering.id,
          departmentId: authoritativeOffering.departmentId,
          studentBatchId: authoritativeOffering.studentBatchId,
          academicTermId: authoritativeOffering.academicTermId,
          curriculumCourseId: authoritativeOffering.curriculumCourseId,
          syllabusVersionId: authoritativeOffering.syllabusVersionId,
          teacherCourseAssignmentId: "assignment-a",
        },
      ];
    },
    courseOffering: {
      findFirst: async (args: any) => {
        calls.push({ kind: "offering", args });
        if (
          options.offeringFound === false ||
          args.where.id !== "offering-a" ||
          args.where.departmentId !== "department-a" ||
          options.assignment === "INACTIVE" ||
          options.assignment === "UNASSIGNED" ||
          options.assignment === "ARCHIVED"
        ) {
          return null;
        }
        return { ...authoritativeOffering };
      },
    },
    courseOutlineVersion: {
      findFirst: async (args: any) => {
        calls.push({ kind: "outline", args });
        if (
          options.outlineFound === false ||
          args.where.id !== "outline-a" ||
          args.where.departmentId !== "department-a" ||
          args.where.courseOfferingId !== "offering-a"
        ) {
          return null;
        }
        if (args.select?.status === true && args.select?.id !== true) {
          return options.statusAfterMiss === null
            ? null
            : {
                status: options.statusAfterMiss ?? record.status,
                submittedAt: record.submittedAt,
                approvedAt: record.approvedAt,
                activatedAt: record.activatedAt,
                archivedAt: record.archivedAt,
              };
        }
        if (options.identityMatches === false) {
          return { ...record, syllabusVersionId: "syllabus-other" };
        }
        return { ...record };
      },
      updateMany: async (args: any) => {
        calls.push({ kind: "update", args });
        const count = options.updateCount ?? 1;
        if (count === 1) record = { ...record, ...args.data };
        return { count };
      },
    },
    courseOutlineCorrectionRequest: {
      findFirst: async (args: any) => {
        calls.push({ kind: "correction-history", args });
        return (
          [...correctionRequests]
            .filter(
              (request) =>
                request.departmentId === args.where.departmentId &&
                request.courseOfferingId === args.where.courseOfferingId &&
                request.courseOutlineVersionId ===
                  args.where.courseOutlineVersionId &&
                request.returnedAt >= args.where.returnedAt.gte &&
                request.returnedAt <= args.where.returnedAt.lte,
            )
            .sort(
              (left, right) =>
                right.returnedAt.getTime() - left.returnedAt.getTime() ||
                right.createdAt.getTime() - left.createdAt.getTime() ||
                right.id.localeCompare(left.id),
            )[0] ?? null
        );
      },
    },
    auditLog: {
      create: async (args: any) => {
        calls.push({ kind: "audit", args });
        if (options.auditError) throw options.auditError;
        audits.push(args);
        return args;
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
      const previousTransaction = transactionTail;
      let releaseTransaction!: () => void;
      if (options.serializeTransactions) {
        transactionTail = new Promise<void>((resolve) => {
          releaseTransaction = resolve;
        });
        await previousTransaction;
      }
      const recordBefore = { ...record };
      const auditCountBefore = audits.length;
      try {
        return await callback(tx);
      } catch (error) {
        record = recordBefore;
        audits.splice(auditCountBefore);
        throw error;
      } finally {
        releaseTransaction?.();
      }
    },
  };

  return {
    audits,
    calls,
    correctionRequests,
    record: () => ({ ...record }),
    repository: new PrismaAcademicRepository(prisma as never),
  };
}

test("assigned Teacher submits exact DRAFT with server timestamp while identity, version, and narratives remain immutable", async () => {
  const h = harness();
  const before = h.record();
  const result =
    await h.repository.submitCourseOutlineVersion(submissionInput());
  assert.equal(result.outcome, "SUBMITTED");
  if (result.outcome !== "SUBMITTED") return;

  assert.equal(
    result.courseOutlineVersion.status,
    CourseOutlineStatus.SUBMITTED_BY_TEACHER,
  );
  assert.equal(result.courseOutlineVersion.submittedAt, transitionAt);
  for (const field of [
    "departmentId",
    "courseOfferingId",
    "curriculumCourseId",
    "syllabusVersionId",
    "versionNumber",
    "courseSummary",
    "deliveryPlan",
    "teachingStrategies",
    "assessmentStrategy",
    "evaluationPolicy",
    "makeUpProcedure",
    "approvedAt",
    "activatedAt",
    "archivedAt",
  ] as const) {
    assert.equal(h.record()[field], before[field]);
  }

  const offeringQuery = h.calls.find((call) => call.kind === "offering")!.args;
  assert.deepEqual(offeringQuery.where.teacherAssignments, {
    some: {
      departmentId: "department-a",
      courseOfferingId: "offering-a",
      teacherUserId: "teacher-a",
      status: "ACTIVE",
      unassignedAt: null,
      archivedAt: null,
    },
  });
  const authorityLock = h.calls.find((call) => call.kind === "authority-lock")!
    .args as { strings: string[]; values: unknown[] };
  const authoritySql = authorityLock.strings.join("?");
  assert.equal(h.calls[0]?.kind, "authority-lock");
  assert.match(authoritySql, /FROM "course_offerings" co/);
  assert.match(authoritySql, /INNER JOIN "teacher_course_assignments" tca/);
  assert.match(authoritySql, /tca\."course_offering_id" = co\."id"/);
  assert.match(authoritySql, /tca\."department_id" = \?/);
  assert.match(authoritySql, /tca\."teacher_user_id" = \?/);
  assert.match(authoritySql, /tca\."status" = 'ACTIVE'/);
  assert.match(authoritySql, /tca\."unassigned_at" IS NULL/);
  assert.match(authoritySql, /tca\."archived_at" IS NULL/);
  assert.match(authoritySql, /co\."archived_at" IS NULL/);
  assert.match(authoritySql, /co\."id" = \?/);
  assert.match(authoritySql, /co\."department_id" = \?/);
  assert.match(authoritySql, /FOR UPDATE OF co, tca/);
  assert.deepEqual(authorityLock.values, [
    "department-a",
    "teacher-a",
    "offering-a",
    "department-a",
  ]);
  const update = h.calls.find((call) => call.kind === "update")!.args;
  assert.deepEqual(update.where, {
    id: "outline-a",
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    status: CourseOutlineStatus.DRAFT,
    submittedAt: null,
    approvedAt: null,
    activatedAt: null,
    archivedAt: null,
  });
  assert.deepEqual(update.data, {
    status: CourseOutlineStatus.SUBMITTED_BY_TEACHER,
    submittedAt: transitionAt,
  });
});

test("assigned Teacher resubmits the same corrected version with edited content and immutable correction history", async () => {
  const h = harness(CourseOutlineStatus.RETURNED_FOR_CORRECTION, {
    outlineOverrides: {
      courseSummary: "Teacher-corrected summary",
      deliveryPlan: "Teacher-corrected delivery plan",
    },
  });
  const before = h.record();
  const historyBefore = structuredClone(h.correctionRequests);

  const result =
    await h.repository.submitCourseOutlineVersion(submissionInput());
  assert.equal(result.outcome, "SUBMITTED");
  if (result.outcome !== "SUBMITTED") return;

  assert.equal(result.courseOutlineVersion.id, before.id);
  assert.equal(result.courseOutlineVersion.versionNumber, before.versionNumber);
  assert.equal(result.courseOutlineVersion.courseSummary, before.courseSummary);
  assert.equal(result.courseOutlineVersion.deliveryPlan, before.deliveryPlan);
  assert.equal(
    result.courseOutlineVersion.status,
    CourseOutlineStatus.SUBMITTED_BY_TEACHER,
  );
  assert.equal(result.courseOutlineVersion.submittedAt, transitionAt);
  assert.notEqual(result.courseOutlineVersion.submittedAt, previousSubmittedAt);
  assert.equal(result.courseOutlineVersion.approvedAt, null);
  assert.equal(result.courseOutlineVersion.activatedAt, null);
  assert.equal(result.courseOutlineVersion.archivedAt, null);
  assert.deepEqual(h.correctionRequests, historyBefore);

  const historyRead = h.calls.find(
    (call) => call.kind === "correction-history",
  )!.args;
  assert.deepEqual(historyRead.where, {
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    courseOutlineVersionId: "outline-a",
    returnedAt: {
      gte: previousSubmittedAt,
      lte: transitionAt,
    },
  });
  assert.deepEqual(historyRead.orderBy, [
    { returnedAt: "desc" },
    { createdAt: "desc" },
    { id: "desc" },
  ]);
  const update = h.calls.find((call) => call.kind === "update")!.args;
  assert.deepEqual(update.where, {
    id: "outline-a",
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    status: CourseOutlineStatus.RETURNED_FOR_CORRECTION,
    submittedAt: previousSubmittedAt,
    approvedAt: null,
    activatedAt: null,
    archivedAt: null,
  });
  assert.deepEqual(update.data, {
    status: CourseOutlineStatus.SUBMITTED_BY_TEACHER,
    submittedAt: transitionAt,
  });
});

test("corrected resubmission always replaces the prior submittedAt with a distinct server timestamp", async () => {
  const h = harness(CourseOutlineStatus.RETURNED_FOR_CORRECTION, {
    correctionRequests: [
      correctionRequest({
        returnedAt: previousSubmittedAt,
        createdAt: previousSubmittedAt,
      }),
    ],
  });
  const result = await h.repository.submitCourseOutlineVersion(
    submissionInput({ transitionAt: previousSubmittedAt }),
  );
  assert.equal(result.outcome, "SUBMITTED");
  if (result.outcome !== "SUBMITTED") return;
  const expectedTimestamp = new Date(previousSubmittedAt.getTime() + 1);
  assert.deepEqual(result.courseOutlineVersion.submittedAt, expectedTimestamp);
  assert.notDeepEqual(
    result.courseOutlineVersion.submittedAt,
    previousSubmittedAt,
  );
  assert.equal(
    (h.audits[0] as any).data.occurredAt.getTime(),
    expectedTimestamp.getTime(),
  );
  assert.equal(
    (h.audits[0] as any).data.contextJson.transitionTimestamp,
    expectedTimestamp.toISOString(),
  );
});

test("inactive, unassignedAt, archived, missing, wrong-department, and wrong-offering authorization fail safely without audit", async () => {
  const cases = [
    [
      harness(CourseOutlineStatus.DRAFT, { assignment: "INACTIVE" }),
      submissionInput(),
    ],
    [
      harness(CourseOutlineStatus.DRAFT, { assignment: "UNASSIGNED" }),
      submissionInput(),
    ],
    [
      harness(CourseOutlineStatus.DRAFT, { assignment: "ARCHIVED" }),
      submissionInput(),
    ],
    [
      harness(CourseOutlineStatus.DRAFT, { offeringFound: false }),
      submissionInput(),
    ],
    [harness(), submissionInput({ departmentId: "department-other" })],
    [harness(), submissionInput({ courseOfferingId: "offering-other" })],
  ] as const;
  for (const [h, input] of cases) {
    assert.deepEqual(await h.repository.submitCourseOutlineVersion(input), {
      outcome: "OFFERING_NOT_FOUND",
    });
    assert.equal(
      h.calls.some((call) => call.kind === "update"),
      false,
    );
    assert.equal(h.audits.length, 0);
  }
});

test("revoked authority cannot proceed beyond the authorization lock", async () => {
  const h = harness(CourseOutlineStatus.DRAFT, { authorityLocked: false });
  assert.deepEqual(
    await h.repository.submitCourseOutlineVersion(submissionInput()),
    { outcome: "OFFERING_NOT_FOUND" },
  );
  assert.deepEqual(
    h.calls.map((call) => call.kind),
    ["authority-lock"],
  );
  assert.equal(h.record().status, CourseOutlineStatus.DRAFT);
  assert.equal(h.audits.length, 0);
});

test("wrong nested outline, another-offering outline, and academic binding mismatch fail safely without mutation or audit", async () => {
  const cases = [
    [harness(), submissionInput({ courseOutlineVersionId: "outline-other" })],
    [
      harness(CourseOutlineStatus.DRAFT, { outlineFound: false }),
      submissionInput(),
    ],
    [
      harness(CourseOutlineStatus.DRAFT, { identityMatches: false }),
      submissionInput(),
    ],
  ] as const;
  for (const [h, input] of cases) {
    assert.deepEqual(await h.repository.submitCourseOutlineVersion(input), {
      outcome: "OUTLINE_NOT_FOUND",
    });
    assert.equal(
      h.calls.some((call) => call.kind === "update"),
      false,
    );
    assert.equal(h.audits.length, 0);
  }
});

test("only DRAFT and well-formed returned outlines are submittable; every other state conflicts without success audit", async () => {
  for (const status of [
    CourseOutlineStatus.SUBMITTED_BY_TEACHER,
    CourseOutlineStatus.COORDINATOR_REVIEW,
    CourseOutlineStatus.APPROVED,
    CourseOutlineStatus.ACTIVE,
    CourseOutlineStatus.ARCHIVED,
  ]) {
    const h = harness(status);
    assert.deepEqual(
      await h.repository.submitCourseOutlineVersion(submissionInput()),
      { outcome: "OUTLINE_NOT_SUBMITTABLE" },
    );
    assert.equal(
      h.calls.some((call) => call.kind === "update"),
      false,
    );
    assert.equal(h.audits.length, 0);
  }
});

test("returned outline without corresponding correction history fails closed", async () => {
  const h = harness(CourseOutlineStatus.RETURNED_FOR_CORRECTION, {
    correctionRequests: [],
  });
  assert.deepEqual(
    await h.repository.submitCourseOutlineVersion(submissionInput()),
    { outcome: "OUTLINE_NOT_SUBMITTABLE" },
  );
  assert.equal(h.record().status, CourseOutlineStatus.RETURNED_FOR_CORRECTION);
  assert.equal(h.record().submittedAt, previousSubmittedAt);
  assert.equal(h.audits.length, 0);
});

test("previous-cycle correction history cannot authorize a malformed later returned cycle", async () => {
  const currentSubmittedAt = new Date("2026-08-20T08:00:00.000Z");
  const staleCorrection = correctionRequest({
    returnedAt: new Date("2026-08-20T07:30:00.000Z"),
    createdAt: new Date("2026-08-20T07:30:00.000Z"),
  });
  const h = harness(CourseOutlineStatus.RETURNED_FOR_CORRECTION, {
    outlineOverrides: { submittedAt: currentSubmittedAt },
    correctionRequests: [staleCorrection],
  });
  const historyBefore = structuredClone(h.correctionRequests);

  assert.deepEqual(
    await h.repository.submitCourseOutlineVersion(submissionInput()),
    { outcome: "OUTLINE_NOT_SUBMITTABLE" },
  );
  assert.equal(h.record().status, CourseOutlineStatus.RETURNED_FOR_CORRECTION);
  assert.equal(h.record().submittedAt, currentSubmittedAt);
  assert.deepEqual(h.correctionRequests, historyBefore);
  assert.equal(
    h.calls.some((call) => call.kind === "update"),
    false,
  );
  assert.equal(h.audits.length, 0);

  const historyRead = h.calls.find(
    (call) => call.kind === "correction-history",
  )!.args;
  assert.deepEqual(historyRead.where.returnedAt, {
    gte: currentSubmittedAt,
    lte: transitionAt,
  });
});

test("correction history later than the attempted server transition fails closed", async () => {
  const futureCorrection = correctionRequest({
    returnedAt: new Date("2026-08-20T09:00:00.000Z"),
    createdAt: new Date("2026-08-20T09:00:00.000Z"),
  });
  const h = harness(CourseOutlineStatus.RETURNED_FOR_CORRECTION, {
    correctionRequests: [futureCorrection],
  });
  const historyBefore = structuredClone(h.correctionRequests);

  assert.deepEqual(
    await h.repository.submitCourseOutlineVersion(submissionInput()),
    { outcome: "OUTLINE_NOT_SUBMITTABLE" },
  );
  assert.equal(h.record().status, CourseOutlineStatus.RETURNED_FOR_CORRECTION);
  assert.equal(h.record().submittedAt, previousSubmittedAt);
  assert.deepEqual(h.correctionRequests, historyBefore);
  assert.equal(
    h.calls.some((call) => call.kind === "update"),
    false,
  );
  assert.equal(h.audits.length, 0);
});

test("malformed returned lifecycle timestamps cannot be resubmitted or audited", async () => {
  for (const outlineOverrides of [
    { submittedAt: null },
    { approvedAt: new Date("2026-08-20T07:10:00.000Z") },
    { activatedAt: new Date("2026-08-20T07:20:00.000Z") },
    { archivedAt: new Date("2026-08-20T07:30:00.000Z") },
  ]) {
    const h = harness(CourseOutlineStatus.RETURNED_FOR_CORRECTION, {
      outlineOverrides,
    });
    assert.deepEqual(
      await h.repository.submitCourseOutlineVersion(submissionInput()),
      { outcome: "OUTLINE_NOT_SUBMITTABLE" },
    );
    assert.equal(
      h.calls.some((call) => call.kind === "update"),
      false,
    );
    assert.equal(h.audits.length, 0);
  }
});

test("corrected resubmission fails closed when the offering loses its complete structural identity", async () => {
  for (const [offeringOverrides, outcome] of [
    [{ studentBatchId: null }, "OFFERING_NOT_FOUND"],
    [{ curriculumCourseId: "curriculum-other" }, "OUTLINE_NOT_FOUND"],
    [{ syllabusVersionId: "syllabus-other" }, "OUTLINE_NOT_FOUND"],
  ] as const) {
    const h = harness(CourseOutlineStatus.RETURNED_FOR_CORRECTION, {
      offeringOverrides,
    });
    assert.deepEqual(
      await h.repository.submitCourseOutlineVersion(submissionInput()),
      { outcome },
    );
    assert.equal(h.audits.length, 0);
  }
});

test("malformed DRAFT lifecycle metadata cannot be submitted or audited", async () => {
  for (const [field, value] of [
    ["submittedAt", new Date("2026-08-20T01:00:00.000Z")],
    ["approvedAt", new Date("2026-08-20T02:00:00.000Z")],
    ["activatedAt", new Date("2026-08-20T03:00:00.000Z")],
    ["archivedAt", new Date("2026-08-20T04:00:00.000Z")],
  ] as const) {
    const h = harness(CourseOutlineStatus.DRAFT, {
      outlineOverrides: { [field]: value },
    });
    assert.deepEqual(
      await h.repository.submitCourseOutlineVersion(submissionInput()),
      { outcome: "OUTLINE_NOT_SUBMITTABLE" },
    );
    assert.equal(
      h.calls.some((call) => call.kind === "update"),
      false,
    );
    assert.equal(h.audits.length, 0);
  }
});

test("repeated submission is a conflict and creates no second success audit", async () => {
  const h = harness();
  assert.equal(
    (await h.repository.submitCourseOutlineVersion(submissionInput())).outcome,
    "SUBMITTED",
  );
  assert.deepEqual(
    await h.repository.submitCourseOutlineVersion(submissionInput()),
    { outcome: "OUTLINE_NOT_SUBMITTABLE" },
  );
  assert.equal(h.audits.length, 1);
});

test("repeated corrected resubmission is a conflict and creates exactly one resubmission audit", async () => {
  const h = harness(CourseOutlineStatus.RETURNED_FOR_CORRECTION);
  assert.equal(
    (await h.repository.submitCourseOutlineVersion(submissionInput())).outcome,
    "SUBMITTED",
  );
  assert.deepEqual(
    await h.repository.submitCourseOutlineVersion(submissionInput()),
    { outcome: "OUTLINE_NOT_SUBMITTABLE" },
  );
  assert.equal(h.audits.length, 1);
  assert.equal(
    (h.audits[0] as any).data.action,
    ACADEMIC_AUDIT_EVENTS.COURSE_OUTLINE_RESUBMITTED,
  );
});

test("simultaneous duplicate corrected resubmission has one winner and one success audit", async () => {
  const h = harness(CourseOutlineStatus.RETURNED_FOR_CORRECTION, {
    serializeTransactions: true,
  });
  const results = await Promise.all([
    h.repository.submitCourseOutlineVersion(submissionInput()),
    h.repository.submitCourseOutlineVersion(submissionInput()),
  ]);
  assert.deepEqual(results.map((result) => result.outcome).sort(), [
    "OUTLINE_NOT_SUBMITTABLE",
    "SUBMITTED",
  ]);
  assert.equal(h.audits.length, 1);
  assert.equal(h.record().status, CourseOutlineStatus.SUBMITTED_BY_TEACHER);
});

test("conditional mutation miss distinguishes inaccessible target, raced state, and write conflict without audit", async () => {
  for (const [statusAfterMiss, outcome] of [
    [null, "OUTLINE_NOT_FOUND"],
    [CourseOutlineStatus.SUBMITTED_BY_TEACHER, "OUTLINE_NOT_SUBMITTABLE"],
    [CourseOutlineStatus.DRAFT, "VERSION_CONFLICT"],
  ] as const) {
    const h = harness(CourseOutlineStatus.DRAFT, {
      updateCount: 0,
      statusAfterMiss,
    });
    assert.deepEqual(
      await h.repository.submitCourseOutlineVersion(submissionInput()),
      { outcome },
    );
    assert.equal(h.audits.length, 0);
  }
});

test("submission audit uses the assignment-authorized actor and structural metadata only", async () => {
  const h = harness();
  await h.repository.submitCourseOutlineVersion(submissionInput());
  assert.equal(h.audits.length, 1);
  const audit = h.audits[0] as any;
  assert.equal(
    audit.data.action,
    ACADEMIC_AUDIT_EVENTS.COURSE_OUTLINE_SUBMITTED,
  );
  assert.equal(audit.data.actorUserId, "teacher-a");
  assert.equal(audit.data.departmentId, "department-a");
  assert.equal(audit.data.targetType, "course_outline_version");
  assert.equal(audit.data.targetId, "outline-a");
  assert.equal(audit.data.outcome, "SUCCESS");
  assert.equal(audit.data.occurredAt, transitionAt);
  assert.deepEqual(audit.data.contextJson, {
    courseOutlineVersionId: "outline-a",
    courseOfferingId: "offering-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    versionNumber: 5,
    previousStatus: CourseOutlineStatus.DRAFT,
    newStatus: CourseOutlineStatus.SUBMITTED_BY_TEACHER,
    transitionTimestamp: transitionAt.toISOString(),
  });
  const serialized = JSON.stringify(audit.data.contextJson);
  for (const narrative of [
    "Sensitive narrative summary",
    "Sensitive delivery plan",
    "Sensitive teaching strategies",
    "Sensitive assessment strategy",
    "Sensitive evaluation policy",
    "Sensitive make-up procedure",
  ]) {
    assert.equal(serialized.includes(narrative), false);
  }
});

test("corrected resubmission audit captures the prior submission and latest correction structurally without narratives", async () => {
  const staleCorrection = correctionRequest({
    id: "correction-request-stale",
    reason: "First sensitive reason",
    returnedAt: new Date("2026-08-19T07:30:00.000Z"),
    createdAt: new Date("2026-08-19T07:30:00.000Z"),
  });
  const earlierCurrentCycleCorrection = correctionRequest({
    id: "correction-request-1",
    reason: "Earlier current-cycle sensitive reason",
    returnedAt: new Date("2026-08-20T07:15:00.000Z"),
    createdAt: new Date("2026-08-20T07:15:00.000Z"),
  });
  const latestCorrection = correctionRequest({
    id: "correction-request-2",
    reason: "Latest sensitive reason",
  });
  const h = harness(CourseOutlineStatus.RETURNED_FOR_CORRECTION, {
    correctionRequests: [
      staleCorrection,
      earlierCurrentCycleCorrection,
      latestCorrection,
    ],
  });
  const historyBefore = structuredClone(h.correctionRequests);

  await h.repository.submitCourseOutlineVersion(submissionInput());

  assert.deepEqual(h.correctionRequests, historyBefore);
  assert.equal(h.audits.length, 1);
  const audit = h.audits[0] as any;
  assert.equal(
    audit.data.action,
    ACADEMIC_AUDIT_EVENTS.COURSE_OUTLINE_RESUBMITTED,
  );
  assert.equal(audit.data.actorUserId, "teacher-a");
  assert.equal(audit.data.departmentId, "department-a");
  assert.equal(audit.data.targetType, "course_outline_version");
  assert.equal(audit.data.targetId, "outline-a");
  assert.equal(audit.data.outcome, "SUCCESS");
  assert.equal(audit.data.occurredAt, transitionAt);
  assert.deepEqual(audit.data.contextJson, {
    courseOutlineVersionId: "outline-a",
    courseOfferingId: "offering-a",
    studentBatchId: "batch-a",
    academicTermId: "term-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    versionNumber: 5,
    courseOutlineCorrectionRequestId: "correction-request-2",
    previousSubmittedAt: previousSubmittedAt.toISOString(),
    previousStatus: CourseOutlineStatus.RETURNED_FOR_CORRECTION,
    newStatus: CourseOutlineStatus.SUBMITTED_BY_TEACHER,
    transitionTimestamp: transitionAt.toISOString(),
  });
  const serialized = JSON.stringify(audit.data.contextJson);
  for (const sensitiveText of [
    "First sensitive reason",
    "Earlier current-cycle sensitive reason",
    "Latest sensitive reason",
    "Sensitive narrative summary",
    "Sensitive delivery plan",
    "Sensitive teaching strategies",
    "Sensitive assessment strategy",
    "Sensitive evaluation policy",
    "Sensitive make-up procedure",
  ]) {
    assert.equal(serialized.includes(sensitiveText), false);
  }
});

test("Teacher edit before corrected resubmission is retained and edit after resubmission is blocked", async () => {
  const h = harness(CourseOutlineStatus.RETURNED_FOR_CORRECTION);

  const edit = await h.repository.updateCourseOutlineVersion(updateInput());
  assert.equal(edit.outcome, "UPDATED");
  assert.equal(
    h.record().courseSummary,
    "Edited before corrected resubmission",
  );

  const resubmission =
    await h.repository.submitCourseOutlineVersion(submissionInput());
  assert.equal(resubmission.outcome, "SUBMITTED");
  assert.equal(
    h.record().courseSummary,
    "Edited before corrected resubmission",
  );

  assert.deepEqual(
    await h.repository.updateCourseOutlineVersion(updateInput()),
    {
      outcome: "OUTLINE_NOT_EDITABLE",
    },
  );
  assert.equal(
    h.record().courseSummary,
    "Edited before corrected resubmission",
  );
});

test("audit failure rolls the transition back", async () => {
  const h = harness(CourseOutlineStatus.DRAFT, {
    auditError: new Error("audit unavailable"),
  });
  await assert.rejects(
    h.repository.submitCourseOutlineVersion(submissionInput()),
    /audit unavailable/,
  );
  assert.equal(h.record().status, CourseOutlineStatus.DRAFT);
  assert.equal(h.record().submittedAt, null);
  assert.equal(h.audits.length, 0);
});

test("audit failure rolls corrected resubmission back without changing correction history", async () => {
  const h = harness(CourseOutlineStatus.RETURNED_FOR_CORRECTION, {
    auditError: new Error("audit unavailable"),
  });
  const historyBefore = structuredClone(h.correctionRequests);
  await assert.rejects(
    h.repository.submitCourseOutlineVersion(submissionInput()),
    /audit unavailable/,
  );
  assert.equal(h.record().status, CourseOutlineStatus.RETURNED_FOR_CORRECTION);
  assert.equal(h.record().submittedAt, previousSubmittedAt);
  assert.deepEqual(h.correctionRequests, historyBefore);
  assert.equal(h.audits.length, 0);
});
