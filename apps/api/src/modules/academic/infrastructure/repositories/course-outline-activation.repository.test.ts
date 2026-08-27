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

const submittedAt = new Date("2026-08-26T08:00:00.000Z");
const approvedAt = new Date("2026-08-26T09:00:00.000Z");

function activationInput(
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
    actorUserId: "activator-a",
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
    activeCourseOutlineVersionId: null as string | null,
    status: CourseOfferingStatus.IN_PROGRESS as CourseOfferingStatus,
    archivedAt: null as Date | null,
    ...overrides,
  };
}

function outline(
  status: CourseOutlineStatus = CourseOutlineStatus.APPROVED,
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
    activatedAt: null as Date | null,
    archivedAt: null as Date | null,
    createdAt: new Date("2026-08-26T07:00:00.000Z"),
    updatedAt: new Date("2026-08-26T09:00:00.000Z"),
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
    activeOutlineIds?: string[];
    outlineUpdateCount?: number;
    bindingUpdateCount?: number;
    afterOutlineMiss?: OutlineRecord | null;
    auditError?: Error;
    outlineUpdateError?: Error;
    transactionErrors?: unknown[];
  } = {},
) {
  let offeringRecord =
    options.offering === undefined ? offering() : options.offering;
  let outlineRecord =
    options.outline === undefined ? outline() : options.outline;
  const activeOutlineIds = [...(options.activeOutlineIds ?? [])];
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
        return options.authorityValid === false ? [] : [{ id: "activator-a" }];
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
      if (
        /FROM "course_outline_versions" cov/.test(sql) &&
        /cov\."status" =/.test(sql)
      ) {
        calls.push({ kind: "active-outline-lock", args: query });
        return activeOutlineIds.map((id) => ({ id }));
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
          args.select?.status === true &&
          args.select?.id !== true &&
          Object.keys(args.select).length === 5
        ) {
          const current =
            options.afterOutlineMiss === undefined
              ? outlineRecord
              : options.afterOutlineMiss;
          return current
            ? {
                status: current.status,
                submittedAt: current.submittedAt,
                approvedAt: current.approvedAt,
                activatedAt: current.activatedAt,
                archivedAt: current.archivedAt,
              }
            : null;
        }
        if (
          args.where.status !== undefined &&
          args.where.status !== outlineRecord.status
        ) {
          return null;
        }
        return structuredClone(outlineRecord);
      },
      updateMany: async (args: any) => {
        calls.push({ kind: "outline-update", args });
        if (options.outlineUpdateError) throw options.outlineUpdateError;
        const matches = Boolean(
          outlineRecord &&
          outlineRecord.status === args.where.status &&
          outlineRecord.submittedAt?.getTime() ===
            args.where.submittedAt.getTime() &&
          outlineRecord.approvedAt?.getTime() ===
            args.where.approvedAt.getTime() &&
          outlineRecord.activatedAt === null &&
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
          offeringRecord.activeCourseOutlineVersionId === null &&
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

test("valid APPROVED activation atomically preserves identity and timestamps while binding exact offering pointer", async () => {
  const h = harness();
  const beforeOutline = h.outline()!;
  const result =
    await h.repository.activateCourseOutlineVersion(activationInput());
  assert.equal(result.outcome, "ACTIVATED");
  if (result.outcome !== "ACTIVATED") return;

  const after = h.outline()!;
  assert.equal(after.status, CourseOutlineStatus.ACTIVE);
  assert.ok(after.activatedAt instanceof Date);
  assert.equal(after.archivedAt, null);
  assert.deepEqual(after.submittedAt, beforeOutline.submittedAt);
  assert.deepEqual(after.approvedAt, beforeOutline.approvedAt);
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
    assert.deepEqual(after[field], beforeOutline[field]);
  }
  assert.equal(h.offering()!.activeCourseOutlineVersionId, "outline-a");
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
      "active-outline-lock",
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

test("activation authority is exact, live, role-neutral, and locked before academic state", async () => {
  const h = harness();
  await h.repository.activateCourseOutlineVersion(activationInput());
  const authority = h.calls.find((call) => call.kind === "authority-lock")!;
  const sql = sqlText(authority.args);
  assert.match(sql, /FOR SHARE OF u, d FOR UPDATE OF ur, r, rp, p/);
  assert.match(sql, /p\."resource" = 'course-management\.course-outline'/);
  assert.match(sql, /p\."action" = 'activate'/);
  assert.match(sql, /p\."scope" = 'DEPARTMENT'/);
  assert.doesNotMatch(sql, /r\."code"/);
  for (const expected of [
    "activator-a",
    "department-a",
    "user-role-a",
    "role-a",
    PERMISSIONS.COURSE_MANAGEMENT.COURSE_OUTLINE_ACTIVATE,
  ]) {
    assert.ok(sqlValues(authority.args).includes(expected));
  }
});

test("academic chain lock revalidates department, offering, programme equality, and every bound dependency", async () => {
  const h = harness();
  await h.repository.activateCourseOutlineVersion(activationInput());
  const chain = h.calls.find((call) => call.kind === "academic-chain-lock")!;
  const sql = sqlText(chain.args);
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
    assert.match(sql, new RegExp(`"${table}"`));
  }
  assert.match(sql, /c\."academic_program_id" = cv\."academic_program_id"/);
  assert.match(sql, /c\."academic_program_id" = sb\."academic_program_id"/);
  assert.match(
    sql,
    /FOR SHARE OF d, c, cap, term, ay, sb, sbap, acs, cc, cv, cvap, sv/,
  );
});

test("wrong department, wrong nested outline, stale authority, and malformed academic chain fail safely", async () => {
  for (const [h, input, expected] of [
    [
      harness(),
      activationInput({ departmentId: "department-b" }),
      "OFFERING_OR_AUTHORITY_NOT_FOUND",
    ],
    [
      harness(),
      activationInput({ courseOfferingId: "offering-b" }),
      "OFFERING_OR_AUTHORITY_NOT_FOUND",
    ],
    [
      harness({ authorityValid: false }),
      activationInput(),
      "OFFERING_OR_AUTHORITY_NOT_FOUND",
    ],
    [
      harness({ academicChainValid: false }),
      activationInput(),
      "OFFERING_OR_AUTHORITY_NOT_FOUND",
    ],
    [
      harness(),
      activationInput({ courseOutlineVersionId: "outline-b" }),
      "OUTLINE_NOT_FOUND",
    ],
    [
      harness({
        outline: outline(undefined, { departmentId: "department-b" }),
      }),
      activationInput(),
      "OUTLINE_NOT_FOUND",
    ],
    [
      harness({
        outline: outline(undefined, { courseOfferingId: "offering-b" }),
      }),
      activationInput(),
      "OUTLINE_NOT_FOUND",
    ],
    [
      harness({ outline: outline(undefined, { curriculumCourseId: "other" }) }),
      activationInput(),
      "OUTLINE_NOT_FOUND",
    ],
    [
      harness({ outline: outline(undefined, { syllabusVersionId: "other" }) }),
      activationInput(),
      "OUTLINE_NOT_FOUND",
    ],
  ] as const) {
    assert.equal(
      (await h.repository.activateCourseOutlineVersion(input)).outcome,
      expected,
    );
    assert.equal(h.audits.length, 0);
    assert.equal(h.offering()?.activeCourseOutlineVersionId ?? null, null);
  }
});

test("archived, unbound, and every non-ARCHIVED offering status preserve approval safety without an invented allowlist", async () => {
  for (const record of [
    offering({ archivedAt: new Date("2026-08-26T10:00:00.000Z") }),
    offering({ status: CourseOfferingStatus.ARCHIVED }),
    offering({ studentBatchId: null }),
    offering({ curriculumCourseId: null }),
    offering({ syllabusVersionId: null }),
  ]) {
    const h = harness({ offering: record });
    assert.equal(
      (await h.repository.activateCourseOutlineVersion(activationInput()))
        .outcome,
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
      (await h.repository.activateCourseOutlineVersion(activationInput()))
        .outcome,
      "ACTIVATED",
    );
  }
});

test("only a well-formed APPROVED lifecycle can activate", async () => {
  for (const status of [
    CourseOutlineStatus.DRAFT,
    CourseOutlineStatus.SUBMITTED_BY_TEACHER,
    CourseOutlineStatus.COORDINATOR_REVIEW,
    CourseOutlineStatus.RETURNED_FOR_CORRECTION,
    CourseOutlineStatus.ACTIVE,
    CourseOutlineStatus.ARCHIVED,
  ]) {
    const h = harness({ outline: outline(status) });
    assert.equal(
      (await h.repository.activateCourseOutlineVersion(activationInput()))
        .outcome,
      "OUTLINE_NOT_ACTIVATABLE",
    );
    assert.equal(h.audits.length, 0);
  }
  for (const malformed of [
    { submittedAt: null },
    { approvedAt: null },
    { activatedAt: approvedAt },
    { archivedAt: approvedAt },
  ]) {
    const h = harness({ outline: outline(undefined, malformed) });
    assert.equal(
      (await h.repository.activateCourseOutlineVersion(activationInput()))
        .outcome,
      "OUTLINE_NOT_ACTIVATABLE",
    );
  }
});

test("existing active pointer or ACTIVE row blocks activation without replacement or archival", async () => {
  const pointer = harness({
    offering: offering({ activeCourseOutlineVersionId: "outline-existing" }),
  });
  assert.equal(
    (await pointer.repository.activateCourseOutlineVersion(activationInput()))
      .outcome,
    "ACTIVE_OUTLINE_ALREADY_EXISTS",
  );
  assert.equal(pointer.outline()!.status, CourseOutlineStatus.APPROVED);
  assert.equal(
    pointer.offering()!.activeCourseOutlineVersionId,
    "outline-existing",
  );

  const row = harness({ activeOutlineIds: ["outline-existing"] });
  assert.equal(
    (await row.repository.activateCourseOutlineVersion(activationInput()))
      .outcome,
    "ACTIVE_OUTLINE_ALREADY_EXISTS",
  );
  assert.equal(row.outline()!.status, CourseOutlineStatus.APPROVED);
  assert.equal(row.offering()!.activeCourseOutlineVersionId, null);
  assert.equal(pointer.audits.length + row.audits.length, 0);
});

test("conditional outline and pointer mutations use exact CAS identities and one server timestamp", async () => {
  const h = harness();
  await h.repository.activateCourseOutlineVersion(activationInput());
  const outlineMutation = h.calls.find(
    (call) => call.kind === "outline-update",
  )!.args;
  assert.deepEqual(outlineMutation.where, {
    id: "outline-a",
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    status: CourseOutlineStatus.APPROVED,
    submittedAt,
    approvedAt,
    activatedAt: null,
    archivedAt: null,
  });
  assert.equal(outlineMutation.data.status, CourseOutlineStatus.ACTIVE);
  assert.ok(outlineMutation.data.activatedAt instanceof Date);

  const binding = h.calls.find((call) => call.kind === "binding-update")!.args;
  assert.equal(binding.where.activeCourseOutlineVersionId, null);
  assert.deepEqual(binding.where.status, {
    not: CourseOfferingStatus.ARCHIVED,
  });
  assert.deepEqual(binding.data, { activeCourseOutlineVersionId: "outline-a" });
  assert.equal(
    h.audits[0]!.data.occurredAt.getTime(),
    outlineMutation.data.activatedAt.getTime(),
  );
});

test("activation audit is exactly one atomic structural success event without narrative leakage", async () => {
  const h = harness();
  await h.repository.activateCourseOutlineVersion(activationInput());
  assert.equal(h.audits.length, 1);
  const audit = h.audits[0]!.data;
  assert.equal(audit.action, ACADEMIC_AUDIT_EVENTS.COURSE_OUTLINE_ACTIVATED);
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
      "previousStatus",
      "studentBatchId",
      "syllabusVersionId",
      "transitionTimestamp",
      "versionNumber",
    ].sort(),
  );
  assert.equal(audit.contextJson.previousStatus, CourseOutlineStatus.APPROVED);
  assert.equal(audit.contextJson.newStatus, CourseOutlineStatus.ACTIVE);
  assert.equal(audit.contextJson.activeCourseOutlineVersionId, "outline-a");
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

test("audit failure and pointer CAS failure roll back both lifecycle and binding", async () => {
  const failure = new Error("audit unavailable");
  const audit = harness({ auditError: failure });
  const auditOutlineBefore = audit.outline();
  const auditOfferingBefore = audit.offering();
  await assert.rejects(
    audit.repository.activateCourseOutlineVersion(activationInput()),
    failure,
  );
  assert.deepEqual(audit.outline(), auditOutlineBefore);
  assert.deepEqual(audit.offering(), auditOfferingBefore);
  assert.equal(audit.audits.length, 0);

  const binding = harness({ bindingUpdateCount: 0 });
  const bindingOutlineBefore = binding.outline();
  const bindingOfferingBefore = binding.offering();
  assert.equal(
    (await binding.repository.activateCourseOutlineVersion(activationInput()))
      .outcome,
    "CONCURRENT_CONFLICT",
  );
  assert.deepEqual(binding.outline(), bindingOutlineBefore);
  assert.deepEqual(binding.offering(), bindingOfferingBefore);
  assert.equal(binding.audits.length, 0);
});

test("repeat and concurrent same-target activation produce one success, one ACTIVE row, and one audit", async () => {
  const repeated = harness();
  assert.equal(
    (await repeated.repository.activateCourseOutlineVersion(activationInput()))
      .outcome,
    "ACTIVATED",
  );
  assert.equal(
    (await repeated.repository.activateCourseOutlineVersion(activationInput()))
      .outcome,
    "OUTLINE_NOT_ACTIVATABLE",
  );
  assert.equal(repeated.audits.length, 1);

  const concurrent = harness();
  const results = await Promise.all([
    concurrent.repository.activateCourseOutlineVersion(activationInput()),
    concurrent.repository.activateCourseOutlineVersion(activationInput()),
  ]);
  assert.deepEqual(
    results.map((result) => result.outcome).sort(),
    ["ACTIVATED", "OUTLINE_NOT_ACTIVATABLE"].sort(),
  );
  assert.equal(concurrent.audits.length, 1);
  assert.equal(concurrent.outline()!.status, CourseOutlineStatus.ACTIVE);
  assert.equal(
    concurrent.offering()!.activeCourseOutlineVersionId,
    "outline-a",
  );
});

test("CAS miss distinguishes hidden target, lifecycle race, and true concurrent conflict", async () => {
  const missing = harness({ outlineUpdateCount: 0, afterOutlineMiss: null });
  assert.equal(
    (await missing.repository.activateCourseOutlineVersion(activationInput()))
      .outcome,
    "OUTLINE_NOT_FOUND",
  );

  const lifecycle = harness({
    outlineUpdateCount: 0,
    afterOutlineMiss: outline(CourseOutlineStatus.ACTIVE, {
      activatedAt: new Date("2026-08-26T10:00:00.000Z"),
    }),
  });
  assert.equal(
    (await lifecycle.repository.activateCourseOutlineVersion(activationInput()))
      .outcome,
    "OUTLINE_NOT_ACTIVATABLE",
  );

  const concurrent = harness({ outlineUpdateCount: 0 });
  assert.equal(
    (
      await concurrent.repository.activateCourseOutlineVersion(
        activationInput(),
      )
    ).outcome,
    "CONCURRENT_CONFLICT",
  );
  assert.equal(
    missing.audits.length + lifecycle.audits.length + concurrent.audits.length,
    0,
  );
});

test("partial-index P2002 is a controlled existing-active conflict and Serializable retry classification remains bounded", async () => {
  const unique = harness({
    outlineUpdateError: knownRequestError("P2002", {
      target: ["department_id", "course_offering_id"],
    }),
  });
  assert.equal(
    (await unique.repository.activateCourseOutlineVersion(activationInput()))
      .outcome,
    "ACTIVE_OUTLINE_ALREADY_EXISTS",
  );
  assert.equal(unique.outline()!.status, CourseOutlineStatus.APPROVED);

  const retry = harness({ transactionErrors: [knownRequestError("P2034")] });
  assert.equal(
    (await retry.repository.activateCourseOutlineVersion(activationInput()))
      .outcome,
    "ACTIVATED",
  );
  assert.equal(
    retry.calls.filter((call) => call.kind === "transaction").length,
    2,
  );

  const arbitraryRaw = harness({
    transactionErrors: [knownRequestError("P2010", { code: "23505" })],
  });
  await assert.rejects(
    arbitraryRaw.repository.activateCourseOutlineVersion(activationInput()),
    (error: unknown) =>
      error instanceof PrismaClientKnownRequestError && error.code === "P2010",
  );
});

// ---------------------------------------------------------------------------
// Serializable retry regression: activation-path retry contract
// These tests prove that the activation path preserves the already-established
// shared retry contract without modifying the shared retry rule.
// ---------------------------------------------------------------------------

test("Serializable retry: P2034 is retryable on the activation path", async () => {
  const h = harness({ transactionErrors: [knownRequestError("P2034")] });
  const result = await h.repository.activateCourseOutlineVersion(
    activationInput(),
  );
  assert.equal(result.outcome, "ACTIVATED");
  // Transaction was attempted exactly twice: once failing, once succeeding.
  assert.equal(
    h.calls.filter((c) => c.kind === "transaction").length,
    2,
  );
});

test("Serializable retry: P2010 with meta.code string '40001' is retryable on the activation path", async () => {
  const h = harness({
    transactionErrors: [knownRequestError("P2010", { code: "40001" })],
  });
  const result = await h.repository.activateCourseOutlineVersion(
    activationInput(),
  );
  assert.equal(result.outcome, "ACTIVATED");
  assert.equal(
    h.calls.filter((c) => c.kind === "transaction").length,
    2,
  );
});

test("Serializable retry: the whole transaction is retried, not just a sub-operation", async () => {
  // The harness injects transactionErrors at the $transaction boundary (before
  // the operation body runs), so the offering-lock is only recorded on
  // successful attempts. With one injected failure followed by success:
  //   - txCount = 2: proves two separate $transaction invocations
  //   - offeringLockCount = 1: proves the operation body ran once (on success)
  // Together these confirm the retry is at the $transaction level, not within a
  // sub-operation, and that state is fully reset between attempts.
  const h = harness({ transactionErrors: [knownRequestError("P2034")] });
  const result = await h.repository.activateCourseOutlineVersion(
    activationInput(),
  );
  assert.equal(result.outcome, "ACTIVATED");
  const txCount = h.calls.filter((c) => c.kind === "transaction").length;
  const offeringLockCount = h.calls.filter(
    (c) => c.kind === "offering-lock",
  ).length;
  assert.equal(txCount, 2);
  // Operation body runs only on the successful attempt.
  assert.equal(offeringLockCount, 1);
});

test("Serializable retry: maximum retry attempts are exactly 3 (attempts 0, 1, 2)", async () => {
  // Two consecutive retryable errors and one success: total 3 transactions.
  const h = harness({
    transactionErrors: [
      knownRequestError("P2034"),
      knownRequestError("P2010", { code: "40001" }),
    ],
  });
  const result = await h.repository.activateCourseOutlineVersion(
    activationInput(),
  );
  assert.equal(result.outcome, "ACTIVATED");
  assert.equal(
    h.calls.filter((c) => c.kind === "transaction").length,
    3,
  );
});

test("Serializable retry: three exhausted retryable attempts return CONCURRENT_CONFLICT", async () => {
  const h = harness({
    transactionErrors: [
      knownRequestError("P2034"),
      knownRequestError("P2034"),
      knownRequestError("P2034"),
    ],
  });
  const result = await h.repository.activateCourseOutlineVersion(
    activationInput(),
  );
  assert.equal(result.outcome, "CONCURRENT_CONFLICT");
  // All three attempts were made, no fourth attempt.
  assert.equal(
    h.calls.filter((c) => c.kind === "transaction").length,
    3,
  );
});

test("Serializable retry: generic P2010 without meta.code is not retryable", async () => {
  const h = harness({ transactionErrors: [knownRequestError("P2010")] });
  await assert.rejects(
    h.repository.activateCourseOutlineVersion(activationInput()),
    (error: unknown) =>
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2010",
  );
  assert.equal(
    h.calls.filter((c) => c.kind === "transaction").length,
    1,
  );
});

test("Serializable retry: P2010 with unrelated SQLSTATE is not retryable", async () => {
  for (const sqlstate of ["23505", "08006", "42P01", "57014", "55P03"]) {
    const h = harness({
      transactionErrors: [knownRequestError("P2010", { code: sqlstate })],
    });
    await assert.rejects(
      h.repository.activateCourseOutlineVersion(activationInput()),
      (error: unknown) =>
        error instanceof PrismaClientKnownRequestError &&
        error.code === "P2010",
    );
    assert.equal(
      h.calls.filter((c) => c.kind === "transaction").length,
      1,
      `Expected no retry for SQLSTATE ${sqlstate}`,
    );
  }
});

test("Serializable retry: P2010 with meta.code '40P01' (deadlock) is NOT retried", async () => {
  const h = harness({
    transactionErrors: [knownRequestError("P2010", { code: "40P01" })],
  });
  await assert.rejects(
    h.repository.activateCourseOutlineVersion(activationInput()),
    (error: unknown) =>
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2010",
  );
  // Only one transaction attempt — deadlock is not in the retry policy.
  assert.equal(
    h.calls.filter((c) => c.kind === "transaction").length,
    1,
  );
});

test("Serializable retry: numeric 40001 is NOT equivalent to string '40001'", async () => {
  // meta.code must be the string "40001"; the number 40001 must not match.
  const h = harness({
    transactionErrors: [
      knownRequestError("P2010", { code: 40001 as unknown as string }),
    ],
  });
  await assert.rejects(
    h.repository.activateCourseOutlineVersion(activationInput()),
    (error: unknown) =>
      error instanceof PrismaClientKnownRequestError &&
      error.code === "P2010",
  );
  assert.equal(
    h.calls.filter((c) => c.kind === "transaction").length,
    1,
  );
});

test("Serializable retry: non-Prisma/application errors are not retried", async () => {
  const appError = new Error("unexpected application failure");
  const h = harness({ transactionErrors: [appError] });
  await assert.rejects(
    h.repository.activateCourseOutlineVersion(activationInput()),
    appError,
  );
  assert.equal(
    h.calls.filter((c) => c.kind === "transaction").length,
    1,
  );
});

test("Serializable retry: retried attempts must not produce a false success audit", async () => {
  // Two retryable failures followed by a final success: audit written only once.
  const h = harness({
    transactionErrors: [
      knownRequestError("P2034"),
      knownRequestError("P2010", { code: "40001" }),
    ],
  });
  const result = await h.repository.activateCourseOutlineVersion(
    activationInput(),
  );
  assert.equal(result.outcome, "ACTIVATED");
  assert.equal(h.audits.length, 1);

  // Three exhausted retryable failures: no audit must be written.
  const exhausted = harness({
    transactionErrors: [
      knownRequestError("P2034"),
      knownRequestError("P2034"),
      knownRequestError("P2034"),
    ],
  });
  const exhaustedResult =
    await exhausted.repository.activateCourseOutlineVersion(activationInput());
  assert.equal(exhaustedResult.outcome, "CONCURRENT_CONFLICT");
  assert.equal(exhausted.audits.length, 0);
});
