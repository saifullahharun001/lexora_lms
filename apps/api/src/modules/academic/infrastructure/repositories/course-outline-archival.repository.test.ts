import assert from "node:assert/strict";
import test from "node:test";

import {
  CourseOfferingStatus,
  CourseOutlineStatus,
  Prisma,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { PERMISSIONS } from "@/modules/identity-access/authorization/permissions.constants";

import { ACADEMIC_AUDIT_EVENTS } from "../../domain/academic.audit-events";
import { PrismaAcademicRepository } from "./prisma-academic.repository";

const submittedAt = new Date("2026-08-27T08:00:00.000Z");
const approvedAt = new Date("2026-08-27T09:00:00.000Z");
const activatedAt = new Date("2026-08-27T10:00:00.000Z");

function archivalInput(
  overrides: Partial<{
    departmentId: string;
    actorUserId: string;
    courseOfferingId: string;
    courseOutlineVersionId: string;
    authorizationUserRoleId: string;
    authorizationRoleId: string;
  }> = {},
) {
  return {
    departmentId: "department-a",
    actorUserId: "archiver-a",
    courseOfferingId: "offering-a",
    courseOutlineVersionId: "outline-a",
    authorizationUserRoleId: "user-role-a",
    authorizationRoleId: "role-a",
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
    courseId: "course-a",
    studentBatchId: "batch-a" as string | null,
    academicTermId: "term-a",
    curriculumCourseId: "curriculum-a" as string | null,
    syllabusVersionId: "syllabus-a" as string | null,
    activeCourseOutlineVersionId: "outline-a" as string | null,
    status: CourseOfferingStatus.IN_PROGRESS as CourseOfferingStatus,
    archivedAt: null as Date | null,
    ...overrides,
  };
}

function outline(
  status: CourseOutlineStatus = CourseOutlineStatus.ACTIVE,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "outline-a",
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    versionNumber: 7,
    status,
    courseSummary: "Sensitive authored summary",
    deliveryPlan: "Sensitive authored delivery plan",
    teachingStrategies: "Sensitive authored teaching strategies",
    assessmentStrategy: "Sensitive authored assessment strategy",
    evaluationPolicy: "Sensitive authored evaluation policy",
    makeUpProcedure: "Sensitive authored make-up procedure",
    submittedAt,
    approvedAt,
    activatedAt,
    archivedAt: null as Date | null,
    createdAt: new Date("2026-08-27T07:00:00.000Z"),
    updatedAt: activatedAt,
    ...overrides,
  };
}

type OfferingRecord = ReturnType<typeof offering>;
type OutlineRecord = ReturnType<typeof outline>;

function sqlText(query: unknown) {
  return (
    (query as { sql?: string; text?: string }).sql ??
    (query as { text?: string }).text ??
    String(query)
  );
}

function sqlValues(query: unknown) {
  return ((query as { values?: unknown[] }).values ?? []) as unknown[];
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
    offering?: OfferingRecord | null;
    outline?: OutlineRecord | null;
    authorityValid?: boolean;
    academicChainValid?: boolean;
    outlineUpdateCount?: number;
    bindingUpdateCount?: number;
    auditError?: Error;
    transactionErrors?: unknown[];
  } = {},
) {
  let offeringRecord =
    options.offering === undefined ? offering() : options.offering;
  let outlineRecord =
    options.outline === undefined ? outline() : options.outline;
  const calls: Array<{ kind: string; args: any }> = [];
  const audits: Array<{ data: Record<string, any> }> = [];
  const transactionErrors = [...(options.transactionErrors ?? [])];
  let transactionTail = Promise.resolve();

  const tx = {
    $queryRaw: async (query: unknown) => {
      const sql = sqlText(query);
      const values = sqlValues(query);
      if (
        /FROM "course_offerings" co/.test(sql) &&
        /FOR UPDATE OF co/.test(sql)
      ) {
        calls.push({ kind: "offering-lock", args: query });
        if (
          !offeringRecord ||
          values[0] !== offeringRecord.id ||
          values[1] !== offeringRecord.departmentId ||
          offeringRecord.archivedAt !== null ||
          offeringRecord.status === CourseOfferingStatus.ARCHIVED
        ) {
          return [];
        }
        return [structuredClone(offeringRecord)];
      }
      if (/FROM "users" u/.test(sql)) {
        calls.push({ kind: "authority-lock", args: query });
        return options.authorityValid === false ? [] : [{ id: "archiver-a" }];
      }
      if (/JOIN "curriculum_versions" cv/.test(sql)) {
        calls.push({ kind: "academic-chain-lock", args: query });
        return options.academicChainValid === false
          ? []
          : [{ id: "offering-a" }];
      }
      if (
        /FROM "course_outline_versions" cov/.test(sql) &&
        /cov\."id" =/.test(sql)
      ) {
        calls.push({ kind: "target-lock", args: query });
        if (
          !outlineRecord ||
          values[0] !== outlineRecord.id ||
          values[1] !== outlineRecord.departmentId ||
          values[2] !== outlineRecord.courseOfferingId
        ) {
          return [];
        }
        return [{ id: outlineRecord.id }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    courseOutlineVersion: {
      findFirst: async (args: any) => {
        calls.push({ kind: "outline-read", args });
        if (
          !outlineRecord ||
          args.where.id !== outlineRecord.id ||
          args.where.departmentId !== outlineRecord.departmentId ||
          args.where.courseOfferingId !== outlineRecord.courseOfferingId ||
          (args.where.curriculumCourseId !== undefined &&
            args.where.curriculumCourseId !==
              outlineRecord.curriculumCourseId) ||
          (args.where.syllabusVersionId !== undefined &&
            args.where.syllabusVersionId !== outlineRecord.syllabusVersionId)
        ) {
          return null;
        }
        if (
          args.where.status !== undefined &&
          args.where.status !== outlineRecord.status
        ) {
          return null;
        }
        if (
          args.where.archivedAt instanceof Date &&
          outlineRecord.archivedAt?.getTime() !==
            args.where.archivedAt.getTime()
        ) {
          return null;
        }
        return structuredClone(outlineRecord);
      },
      updateMany: async (args: any) => {
        calls.push({ kind: "outline-update", args });
        const matches = Boolean(
          outlineRecord &&
          args.where.id === outlineRecord.id &&
          args.where.departmentId === outlineRecord.departmentId &&
          args.where.courseOfferingId === outlineRecord.courseOfferingId &&
          args.where.curriculumCourseId === outlineRecord.curriculumCourseId &&
          args.where.syllabusVersionId === outlineRecord.syllabusVersionId &&
          outlineRecord.status === args.where.status &&
          outlineRecord.submittedAt?.getTime() ===
            args.where.submittedAt.getTime() &&
          outlineRecord.approvedAt?.getTime() ===
            args.where.approvedAt.getTime() &&
          outlineRecord.activatedAt?.getTime() ===
            args.where.activatedAt.getTime() &&
          outlineRecord.archivedAt === null,
        );
        const count = options.outlineUpdateCount ?? (matches ? 1 : 0);
        if (count === 1 && outlineRecord) {
          outlineRecord = { ...outlineRecord, ...args.data };
        }
        return { count };
      },
    },
    courseOffering: {
      updateMany: async (args: any) => {
        calls.push({ kind: "binding-update", args });
        const matches = Boolean(
          offeringRecord &&
          args.where.id === offeringRecord.id &&
          args.where.departmentId === offeringRecord.departmentId &&
          offeringRecord.activeCourseOutlineVersionId ===
            args.where.activeCourseOutlineVersionId &&
          offeringRecord.archivedAt === null &&
          offeringRecord.status !== CourseOfferingStatus.ARCHIVED,
        );
        const count = options.bindingUpdateCount ?? (matches ? 1 : 0);
        if (count === 1 && offeringRecord) {
          offeringRecord = { ...offeringRecord, ...args.data };
        }
        return { count };
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
      const previous = transactionTail;
      let release!: () => void;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      calls.push({ kind: "transaction", args: transactionOptions });
      const failure = transactionErrors.shift();
      if (failure) {
        release();
        throw failure;
      }

      const beforeOutline = structuredClone(outlineRecord);
      const beforeOffering = structuredClone(offeringRecord);
      const auditCount = audits.length;
      try {
        const result = await operation(tx);
        release();
        return result;
      } catch (error) {
        outlineRecord = beforeOutline;
        offeringRecord = beforeOffering;
        audits.splice(auditCount);
        release();
        throw error;
      }
    },
  };

  return {
    audits,
    calls,
    outline: () => structuredClone(outlineRecord),
    offering: () => structuredClone(offeringRecord),
    repository: new PrismaAcademicRepository(prisma as never),
  };
}

test("exact ACTIVE target archives atomically, preserves prior lifecycle timestamps, and clears only its pointer", async () => {
  const h = harness();
  const before = h.outline()!;
  const result =
    await h.repository.archiveCourseOutlineVersion(archivalInput());
  assert.equal(result.outcome, "ARCHIVED");
  if (result.outcome !== "ARCHIVED") return;

  const after = h.outline()!;
  assert.equal(after.status, CourseOutlineStatus.ARCHIVED);
  assert.ok(after.archivedAt instanceof Date);
  assert.deepEqual(after.submittedAt, before.submittedAt);
  assert.deepEqual(after.approvedAt, before.approvedAt);
  assert.deepEqual(after.activatedAt, before.activatedAt);
  for (const field of [
    "id",
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
    "createdAt",
  ] as const) {
    assert.deepEqual(after[field], before[field]);
  }
  assert.equal(h.offering()!.activeCourseOutlineVersionId, null);
  assert.equal(h.audits.length, 1);
  assert.deepEqual(
    h.calls
      .filter((call) => call.kind !== "transaction")
      .map((call) => call.kind),
    [
      "offering-lock",
      "authority-lock",
      "academic-chain-lock",
      "target-lock",
      "outline-read",
      "outline-update",
      "binding-update",
      "outline-read",
      "audit",
    ],
  );
  assert.deepEqual(h.calls[0]!.args, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 30_000,
  });
});

test("archival authority is exact, live, role-neutral, and locked before the full academic chain", async () => {
  const h = harness();
  await h.repository.archiveCourseOutlineVersion(archivalInput());

  const authority = h.calls.find((call) => call.kind === "authority-lock")!;
  const authoritySql = sqlText(authority.args);
  assert.match(authoritySql, /FOR SHARE OF u, d FOR UPDATE OF ur, r, rp, p/);
  assert.match(
    authoritySql,
    /p\."resource" = 'course-management\.course-outline'/,
  );
  assert.match(authoritySql, /p\."action" = 'archive'/);
  assert.match(authoritySql, /p\."scope" = 'DEPARTMENT'/);
  assert.doesNotMatch(authoritySql, /r\."code"/);
  for (const expected of [
    "archiver-a",
    "department-a",
    "user-role-a",
    "role-a",
    PERMISSIONS.COURSE_MANAGEMENT.COURSE_OUTLINE_ARCHIVE,
  ]) {
    assert.ok(sqlValues(authority.args).includes(expected));
  }

  const chain = h.calls.find((call) => call.kind === "academic-chain-lock")!;
  const chainSql = sqlText(chain.args);
  for (const table of [
    "departments",
    "courses",
    "academic_programs",
    "academic_terms",
    "academic_years",
    "student_batches",
    "academic_sessions",
    "curriculum_courses",
    "curriculum_versions",
    "syllabus_versions",
  ]) {
    assert.match(chainSql, new RegExp(`"${table}"`));
  }
  assert.match(
    chainSql,
    /c\."academic_program_id" = cv\."academic_program_id"/,
  );
  assert.match(
    chainSql,
    /c\."academic_program_id" = sb\."academic_program_id"/,
  );
  assert.match(
    chainSql,
    /FOR SHARE OF d, c, cap, term, ay, sb, sbap, acs, cc, cv, cvap, sv/,
  );
});

test("hidden offering, stale authority, malformed academic chain, and wrong nested outline fail safely", async () => {
  for (const [h, input, expected] of [
    [
      harness(),
      archivalInput({ departmentId: "department-b" }),
      "OFFERING_OR_AUTHORITY_NOT_FOUND",
    ],
    [
      harness(),
      archivalInput({ courseOfferingId: "offering-b" }),
      "OFFERING_OR_AUTHORITY_NOT_FOUND",
    ],
    [
      harness({ authorityValid: false }),
      archivalInput(),
      "OFFERING_OR_AUTHORITY_NOT_FOUND",
    ],
    [
      harness({ academicChainValid: false }),
      archivalInput(),
      "OFFERING_OR_AUTHORITY_NOT_FOUND",
    ],
    [
      harness(),
      archivalInput({ courseOutlineVersionId: "outline-b" }),
      "OUTLINE_NOT_FOUND",
    ],
    [
      harness({
        outline: outline(undefined, { departmentId: "department-b" }),
      }),
      archivalInput(),
      "OUTLINE_NOT_FOUND",
    ],
    [
      harness({
        outline: outline(undefined, { courseOfferingId: "offering-b" }),
      }),
      archivalInput(),
      "OUTLINE_NOT_FOUND",
    ],
    [
      harness({ outline: outline(undefined, { curriculumCourseId: "other" }) }),
      archivalInput(),
      "OUTLINE_NOT_FOUND",
    ],
    [
      harness({ outline: outline(undefined, { syllabusVersionId: "other" }) }),
      archivalInput(),
      "OUTLINE_NOT_FOUND",
    ],
  ] as const) {
    assert.equal(
      (await h.repository.archiveCourseOutlineVersion(input)).outcome,
      expected,
    );
    assert.equal(h.audits.length, 0);
  }
});

test("archived and unbound offerings are hidden while every other offering status remains eligible", async () => {
  for (const record of [
    offering({ archivedAt: new Date("2026-08-27T11:00:00.000Z") }),
    offering({ status: CourseOfferingStatus.ARCHIVED }),
    offering({ studentBatchId: null }),
    offering({ curriculumCourseId: null }),
    offering({ syllabusVersionId: null }),
  ]) {
    const h = harness({ offering: record });
    assert.equal(
      (await h.repository.archiveCourseOutlineVersion(archivalInput())).outcome,
      "OFFERING_OR_AUTHORITY_NOT_FOUND",
    );
    assert.equal(h.audits.length, 0);
  }

  for (const status of [
    CourseOfferingStatus.PLANNED,
    CourseOfferingStatus.PUBLISHED,
    CourseOfferingStatus.ENROLLMENT_OPEN,
    CourseOfferingStatus.IN_PROGRESS,
    CourseOfferingStatus.COMPLETED,
    CourseOfferingStatus.CANCELED,
  ]) {
    const h = harness({ offering: offering({ status }) });
    assert.equal(
      (await h.repository.archiveCourseOutlineVersion(archivalInput())).outcome,
      "ARCHIVED",
    );
  }
});

test("every non-ACTIVE status and malformed ACTIVE lifecycle metadata are non-archivable", async () => {
  for (const status of [
    CourseOutlineStatus.DRAFT,
    CourseOutlineStatus.SUBMITTED_BY_TEACHER,
    CourseOutlineStatus.COORDINATOR_REVIEW,
    CourseOutlineStatus.RETURNED_FOR_CORRECTION,
    CourseOutlineStatus.APPROVED,
    CourseOutlineStatus.ARCHIVED,
  ]) {
    const h = harness({ outline: outline(status) });
    assert.equal(
      (await h.repository.archiveCourseOutlineVersion(archivalInput())).outcome,
      "OUTLINE_NOT_ARCHIVABLE",
    );
    assert.equal(h.audits.length, 0);
  }
  for (const malformed of [
    { submittedAt: null },
    { approvedAt: null },
    { activatedAt: null },
    { archivedAt: activatedAt },
  ]) {
    const h = harness({ outline: outline(undefined, malformed) });
    assert.equal(
      (await h.repository.archiveCourseOutlineVersion(archivalInput())).outcome,
      "OUTLINE_NOT_ARCHIVABLE",
    );
  }
});

test("ACTIVE target with null or different pointer is a zero-mutation binding conflict", async () => {
  for (const pointer of [null, "outline-other"]) {
    const h = harness({
      offering: offering({ activeCourseOutlineVersionId: pointer }),
    });
    const beforeOutline = h.outline();
    const beforeOffering = h.offering();
    assert.equal(
      (await h.repository.archiveCourseOutlineVersion(archivalInput())).outcome,
      "ACTIVE_BINDING_MISMATCH",
    );
    assert.deepEqual(h.outline(), beforeOutline);
    assert.deepEqual(h.offering(), beforeOffering);
    assert.equal(h.audits.length, 0);
    assert.equal(
      h.calls.some((call) => call.kind === "outline-update"),
      false,
    );
  }
});

test("outline and pointer CAS use exact identities, preserve activation metadata, and share the audit timestamp", async () => {
  const h = harness();
  await h.repository.archiveCourseOutlineVersion(archivalInput());
  const outlineMutation = h.calls.find(
    (call) => call.kind === "outline-update",
  )!.args;
  assert.deepEqual(outlineMutation.where, {
    id: "outline-a",
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    status: CourseOutlineStatus.ACTIVE,
    submittedAt,
    approvedAt,
    activatedAt,
    archivedAt: null,
  });
  assert.deepEqual(Object.keys(outlineMutation.data).sort(), [
    "archivedAt",
    "status",
  ]);
  assert.equal(outlineMutation.data.status, CourseOutlineStatus.ARCHIVED);
  assert.ok(outlineMutation.data.archivedAt instanceof Date);

  const binding = h.calls.find((call) => call.kind === "binding-update")!.args;
  assert.equal(binding.where.activeCourseOutlineVersionId, "outline-a");
  assert.deepEqual(binding.where.status, {
    not: CourseOfferingStatus.ARCHIVED,
  });
  assert.deepEqual(binding.data, { activeCourseOutlineVersionId: null });
  assert.equal(
    h.audits[0]!.data.occurredAt.getTime(),
    outlineMutation.data.archivedAt.getTime(),
  );
  assert.equal(
    h.audits[0]!.data.contextJson.transitionTimestamp,
    outlineMutation.data.archivedAt.toISOString(),
  );
});

test("archival emits exactly one atomic structural audit with old and cleared pointer values", async () => {
  const h = harness();
  await h.repository.archiveCourseOutlineVersion(archivalInput());
  assert.equal(h.audits.length, 1);
  const audit = h.audits[0]!.data;
  assert.equal(audit.action, ACADEMIC_AUDIT_EVENTS.COURSE_OUTLINE_ARCHIVED);
  assert.equal(audit.targetType, "course_outline_version");
  assert.equal(audit.targetId, "outline-a");
  assert.equal(audit.outcome, "SUCCESS");
  assert.deepEqual(
    Object.keys(audit.contextJson).sort(),
    [
      "academicTermId",
      "activeCourseOutlineVersionId",
      "courseOfferingId",
      "courseOutlineVersionId",
      "curriculumCourseId",
      "newStatus",
      "previousActiveCourseOutlineVersionId",
      "previousStatus",
      "studentBatchId",
      "syllabusVersionId",
      "transitionTimestamp",
      "versionNumber",
    ].sort(),
  );
  assert.equal(audit.contextJson.previousStatus, CourseOutlineStatus.ACTIVE);
  assert.equal(audit.contextJson.newStatus, CourseOutlineStatus.ARCHIVED);
  assert.equal(
    audit.contextJson.previousActiveCourseOutlineVersionId,
    "outline-a",
  );
  assert.equal(audit.contextJson.activeCourseOutlineVersionId, null);
  const serialized = JSON.stringify(audit.contextJson);
  for (const sensitive of [
    "Sensitive authored summary",
    "Sensitive authored delivery plan",
    "password",
    "token",
    "authorization",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(sensitive, "i"));
  }
});

test("pointer CAS and audit failures roll back both lifecycle and pointer with no success audit", async () => {
  const binding = harness({ bindingUpdateCount: 0 });
  const bindingOutlineBefore = binding.outline();
  const bindingOfferingBefore = binding.offering();
  assert.equal(
    (await binding.repository.archiveCourseOutlineVersion(archivalInput()))
      .outcome,
    "CONCURRENT_CONFLICT",
  );
  assert.deepEqual(binding.outline(), bindingOutlineBefore);
  assert.deepEqual(binding.offering(), bindingOfferingBefore);
  assert.equal(binding.audits.length, 0);

  const failure = new Error("audit unavailable");
  const audit = harness({ auditError: failure });
  const auditOutlineBefore = audit.outline();
  const auditOfferingBefore = audit.offering();
  await assert.rejects(
    audit.repository.archiveCourseOutlineVersion(archivalInput()),
    failure,
  );
  assert.deepEqual(audit.outline(), auditOutlineBefore);
  assert.deepEqual(audit.offering(), auditOfferingBefore);
  assert.equal(audit.audits.length, 0);
});

test("repeat and concurrent same-target archival produce one success, one conflict, and one audit", async () => {
  const repeated = harness();
  assert.equal(
    (await repeated.repository.archiveCourseOutlineVersion(archivalInput()))
      .outcome,
    "ARCHIVED",
  );
  assert.equal(
    (await repeated.repository.archiveCourseOutlineVersion(archivalInput()))
      .outcome,
    "OUTLINE_NOT_ARCHIVABLE",
  );
  assert.equal(repeated.audits.length, 1);

  const concurrent = harness();
  const results = await Promise.all([
    concurrent.repository.archiveCourseOutlineVersion(archivalInput()),
    concurrent.repository.archiveCourseOutlineVersion(archivalInput()),
  ]);
  assert.deepEqual(
    results.map((result) => result.outcome).sort(),
    ["ARCHIVED", "OUTLINE_NOT_ARCHIVABLE"].sort(),
  );
  assert.equal(concurrent.audits.length, 1);
  assert.equal(concurrent.outline()!.status, CourseOutlineStatus.ARCHIVED);
  assert.equal(concurrent.offering()!.activeCourseOutlineVersionId, null);
});

test("outline CAS miss is a controlled concurrent conflict with no mutation or audit", async () => {
  const concurrent = harness({ outlineUpdateCount: 0 });
  const beforeOutline = concurrent.outline();
  const beforeOffering = concurrent.offering();
  assert.equal(
    (await concurrent.repository.archiveCourseOutlineVersion(archivalInput()))
      .outcome,
    "CONCURRENT_CONFLICT",
  );
  assert.deepEqual(concurrent.outline(), beforeOutline);
  assert.deepEqual(concurrent.offering(), beforeOffering);
  assert.equal(concurrent.audits.length, 0);
});

test("Serializable retry classifier remains exact and bounded on archival", async () => {
  for (const retryable of [
    knownRequestError("P2034"),
    knownRequestError("P2010", { code: "40001" }),
  ]) {
    const h = harness({ transactionErrors: [retryable] });
    assert.equal(
      (await h.repository.archiveCourseOutlineVersion(archivalInput())).outcome,
      "ARCHIVED",
    );
    assert.equal(
      h.calls.filter((call) => call.kind === "transaction").length,
      2,
    );
    assert.equal(h.audits.length, 1);
  }

  const maximum = harness({
    transactionErrors: [
      knownRequestError("P2034"),
      knownRequestError("P2010", { code: "40001" }),
    ],
  });
  assert.equal(
    (await maximum.repository.archiveCourseOutlineVersion(archivalInput()))
      .outcome,
    "ARCHIVED",
  );
  assert.equal(
    maximum.calls.filter((call) => call.kind === "transaction").length,
    3,
  );

  const exhausted = harness({
    transactionErrors: [
      knownRequestError("P2034"),
      knownRequestError("P2034"),
      knownRequestError("P2034"),
    ],
  });
  assert.equal(
    (await exhausted.repository.archiveCourseOutlineVersion(archivalInput()))
      .outcome,
    "CONCURRENT_CONFLICT",
  );
  assert.equal(
    exhausted.calls.filter((call) => call.kind === "transaction").length,
    3,
  );
  assert.equal(exhausted.audits.length, 0);

  for (const error of [
    knownRequestError("P2010"),
    knownRequestError("P2010", { code: "23505" }),
    knownRequestError("P2010", { code: "40P01" }),
    knownRequestError("P2010", { code: 40001 as unknown as string }),
    new Error("unexpected application failure"),
  ]) {
    const h = harness({ transactionErrors: [error] });
    await assert.rejects(
      h.repository.archiveCourseOutlineVersion(archivalInput()),
      error,
    );
    assert.equal(
      h.calls.filter((call) => call.kind === "transaction").length,
      1,
    );
    assert.equal(h.audits.length, 0);
  }
});
