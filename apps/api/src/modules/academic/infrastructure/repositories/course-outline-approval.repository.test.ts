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

function approvalInput(
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
    actorUserId: "approver-a",
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
    status: CourseOfferingStatus.IN_PROGRESS as CourseOfferingStatus,
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
    versionNumber: 7,
    status,
    courseSummary: "Sensitive authored summary",
    deliveryPlan: "Sensitive authored delivery plan",
    teachingStrategies: "Sensitive authored teaching strategies",
    assessmentStrategy: "Sensitive authored assessment strategy",
    evaluationPolicy: "Sensitive authored evaluation policy",
    makeUpProcedure: "Sensitive authored make-up procedure",
    submittedAt,
    approvedAt: null as Date | null,
    activatedAt: null as Date | null,
    archivedAt: null as Date | null,
    createdAt: new Date("2026-08-26T07:00:00.000Z"),
    updatedAt: new Date("2026-08-26T08:00:00.000Z"),
    ...overrides,
  };
}

type OfferingRecord = ReturnType<typeof offering>;
type OutlineRecord = ReturnType<typeof outline>;

interface ProgrammeChainOverrides {
  courseAcademicProgramId?: string | null;
  courseAcademicProgramIdentityId?: string | null;
  curriculumVersionAcademicProgramId?: string;
  curriculumVersionAcademicProgramIdentityId?: string;
  studentBatchAcademicProgramId?: string;
  studentBatchAcademicProgramIdentityId?: string;
}

function authoritativeOffering(
  lockedOffering: OfferingRecord,
  overrides: ProgrammeChainOverrides = {},
) {
  const courseAcademicProgramId =
    overrides.courseAcademicProgramId === undefined
      ? "program-a"
      : overrides.courseAcademicProgramId;
  const courseAcademicProgramIdentityId =
    overrides.courseAcademicProgramIdentityId === undefined
      ? courseAcademicProgramId
      : overrides.courseAcademicProgramIdentityId;
  const curriculumVersionAcademicProgramId =
    overrides.curriculumVersionAcademicProgramId ?? "program-a";
  const curriculumVersionAcademicProgramIdentityId =
    overrides.curriculumVersionAcademicProgramIdentityId ??
    curriculumVersionAcademicProgramId;
  const studentBatchAcademicProgramId =
    overrides.studentBatchAcademicProgramId ?? "program-a";
  const studentBatchAcademicProgramIdentityId =
    overrides.studentBatchAcademicProgramIdentityId ??
    studentBatchAcademicProgramId;

  return {
    ...structuredClone(lockedOffering),
    department: { id: "department-a" },
    course: {
      id: lockedOffering.courseId,
      departmentId: "department-a",
      academicProgramId: courseAcademicProgramId,
      archivedAt: null,
      academicProgram:
        courseAcademicProgramIdentityId === null
          ? null
          : {
              id: courseAcademicProgramIdentityId,
              departmentId: "department-a",
              archivedAt: null,
            },
    },
    academicTerm: {
      id: lockedOffering.academicTermId,
      departmentId: "department-a",
      academicYearId: "academic-year-a",
      archivedAt: null,
      academicYear: {
        id: "academic-year-a",
        departmentId: "department-a",
        archivedAt: null,
      },
    },
    studentBatch: {
      id: lockedOffering.studentBatchId,
      departmentId: "department-a",
      academicProgramId: studentBatchAcademicProgramId,
      academicSessionId: "academic-session-a",
      archivedAt: null,
      academicProgram: {
        id: studentBatchAcademicProgramIdentityId,
        departmentId: "department-a",
        archivedAt: null,
      },
      academicSession: {
        id: "academic-session-a",
        departmentId: "department-a",
        archivedAt: null,
      },
    },
    curriculumCourse: {
      id: lockedOffering.curriculumCourseId,
      departmentId: "department-a",
      courseId: lockedOffering.courseId,
      curriculumVersionId: "curriculum-version-a",
      course: {
        id: lockedOffering.courseId,
        departmentId: "department-a",
        academicProgramId: courseAcademicProgramId,
        archivedAt: null,
      },
      curriculumVersion: {
        id: "curriculum-version-a",
        departmentId: "department-a",
        academicProgramId: curriculumVersionAcademicProgramId,
        archivedAt: null,
        academicProgram: {
          id: curriculumVersionAcademicProgramIdentityId,
          departmentId: "department-a",
          archivedAt: null,
        },
      },
    },
    syllabusVersion: {
      id: lockedOffering.syllabusVersionId,
      departmentId: "department-a",
      curriculumCourseId: lockedOffering.curriculumCourseId,
      archivedAt: null,
    },
  };
}

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
    bindingValid?: boolean;
    authorityValid?: boolean;
    outline?: OutlineRecord | null;
    updateCount?: number;
    afterMiss?: OutlineRecord | null;
    auditError?: Error;
    transactionErrors?: unknown[];
    programmeChain?: ProgrammeChainOverrides;
  } = {},
) {
  const lockedOffering =
    options.offering === undefined ? offering() : options.offering;
  let outlineRecord =
    options.outline === undefined ? outline() : options.outline;
  const calls: Array<{ kind: string; args: any }> = [];
  const audits: Array<{ data: Record<string, any> }> = [];
  const correctionRequests = [
    {
      id: "correction-a",
      reason: "Preserved correction evidence",
      courseOutlineVersionId: "outline-a",
    },
  ];
  const transactionErrors = [...(options.transactionErrors ?? [])];
  let validatedOffering: ReturnType<typeof authoritativeOffering> | null =
    null;

  const tx = {
    $queryRaw: async (query: unknown) => {
      const sql = sqlText(query);
      const values = sqlValues(query);
      if (/FROM "course_offerings" co/.test(sql)) {
        calls.push({ kind: "offering-lock", args: query });
        if (
          !/co\."archived_at" IS NULL/.test(sql) ||
          !/co\."status" <>/.test(sql) ||
          !values.includes(CourseOfferingStatus.ARCHIVED)
        ) {
          throw new Error("Offering lock omitted an archive predicate");
        }
        if (
          !lockedOffering ||
          values[0] !== lockedOffering.id ||
          values[1] !== lockedOffering.departmentId ||
          lockedOffering.archivedAt !== null ||
          lockedOffering.status === CourseOfferingStatus.ARCHIVED
        ) {
          return [];
        }
        return [structuredClone(lockedOffering)];
      }
      if (/FROM "users" u/.test(sql)) {
        calls.push({ kind: "authority-lock", args: query });
        return options.authorityValid === false ? [] : [{ id: "approver-a" }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    courseOffering: {
      findFirst: async (args: any) => {
        calls.push({ kind: "binding-validation", args });
        if (
          !lockedOffering ||
          options.bindingValid === false ||
          args.where.archivedAt !== null ||
          args.where.status?.not !== CourseOfferingStatus.ARCHIVED
        ) {
          return null;
        }
        validatedOffering = authoritativeOffering(
          lockedOffering,
          options.programmeChain,
        );
        return structuredClone(validatedOffering);
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
          const current =
            options.afterMiss === undefined ? outlineRecord : options.afterMiss;
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
        return structuredClone(outlineRecord);
      },
      updateMany: async (args: any) => {
        calls.push({ kind: "update", args });
        const matches = Boolean(
          outlineRecord &&
          outlineRecord.status === args.where.status &&
          outlineRecord.submittedAt?.getTime() ===
            args.where.submittedAt.getTime() &&
          outlineRecord.approvedAt === null &&
          outlineRecord.activatedAt === null &&
          outlineRecord.archivedAt === null,
        );
        const count = options.updateCount ?? (matches ? 1 : 0);
        if (count === 1 && outlineRecord) {
          outlineRecord = { ...outlineRecord, ...args.data };
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
      calls.push({ kind: "transaction", args: transactionOptions });
      const failure = transactionErrors.shift();
      if (failure) throw failure;

      const beforeOutline = structuredClone(outlineRecord);
      const auditCount = audits.length;
      try {
        return await operation(tx);
      } catch (error) {
        outlineRecord = beforeOutline;
        audits.splice(auditCount);
        throw error;
      }
    },
  };

  return {
    audits,
    calls,
    correctionRequests,
    outline: () => structuredClone(outlineRecord),
    validatedOffering: () => structuredClone(validatedOffering),
    repository: new PrismaAcademicRepository(prisma as never),
  };
}

test("exact COORDINATOR_REVIEW outline is approved in place after offering and live permission locks", async () => {
  const h = harness();
  const before = h.outline()!;
  const correctionsBefore = structuredClone(h.correctionRequests);
  const result =
    await h.repository.approveCourseOutlineVersion(approvalInput());
  assert.equal(result.outcome, "APPROVED");
  if (result.outcome !== "APPROVED") return;

  const after = h.outline()!;
  assert.equal(after.status, CourseOutlineStatus.APPROVED);
  assert.ok(after.approvedAt instanceof Date);
  assert.equal(after.activatedAt, null);
  assert.equal(after.archivedAt, null);
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
    "submittedAt",
    "createdAt",
  ] as const) {
    assert.deepEqual(after[field], before[field]);
  }
  assert.deepEqual(h.correctionRequests, correctionsBefore);
  assert.equal(
    h.calls.some((call) => call.kind.includes("correction")),
    false,
  );
  assert.deepEqual(
    h.calls
      .filter((call) => call.kind !== "transaction")
      .slice(0, 6)
      .map((call) => call.kind),
    [
      "offering-lock",
      "authority-lock",
      "binding-validation",
      "outline-read",
      "update",
      "outline-read",
    ],
  );

  const transaction = h.calls.find((call) => call.kind === "transaction")!;
  assert.deepEqual(transaction.args, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 30_000,
  });
});

test("approval authority is exact, role-neutral, and locked from revocation through mutation", async () => {
  const h = harness();
  await h.repository.approveCourseOutlineVersion(approvalInput());
  const offeringLock = h.calls.find((call) => call.kind === "offering-lock")!;
  const authorityLock = h.calls.find((call) => call.kind === "authority-lock")!;
  assert.match(sqlText(offeringLock.args), /FOR UPDATE OF co/);
  assert.match(
    sqlText(authorityLock.args),
    /FOR SHARE OF u, d FOR UPDATE OF ur, r, rp, p/,
  );
  assert.match(
    sqlText(authorityLock.args),
    /p\."resource" = 'course-management\.course-outline'/,
  );
  assert.match(sqlText(authorityLock.args), /p\."action" = 'approve'/);
  assert.match(sqlText(authorityLock.args), /p\."scope" = 'DEPARTMENT'/);
  assert.doesNotMatch(sqlText(authorityLock.args), /r\."code"/);
  const values = sqlValues(authorityLock.args);
  for (const expected of [
    "approver-a",
    "department-a",
    "user-role-a",
    "role-a",
    PERMISSIONS.COURSE_MANAGEMENT.COURSE_OUTLINE_APPROVE,
  ]) {
    assert.ok(values.includes(expected));
  }
  assert.ok(
    h.calls.findIndex((call) => call.kind === "offering-lock") <
      h.calls.findIndex((call) => call.kind === "authority-lock"),
  );
  assert.ok(
    h.calls.findIndex((call) => call.kind === "authority-lock") <
      h.calls.findIndex((call) => call.kind === "update"),
  );
});

test("both physical and logical CourseOffering archival representations fail at the initial lock", async () => {
  for (const h of [
    harness({
      offering: offering({
        status: CourseOfferingStatus.ARCHIVED,
        archivedAt: null,
      }),
    }),
    harness({
      offering: offering({
        status: CourseOfferingStatus.IN_PROGRESS,
        archivedAt: new Date("2026-08-26T09:00:00.000Z"),
      }),
    }),
  ]) {
    assert.deepEqual(
      await h.repository.approveCourseOutlineVersion(approvalInput()),
      { outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND" },
    );
    assert.equal(
      h.calls.some((call) => call.kind === "authority-lock"),
      false,
    );
    assert.equal(
      h.calls.some((call) => call.kind === "update"),
      false,
    );
    assert.equal(h.audits.length, 0);

    const lock = h.calls.find((call) => call.kind === "offering-lock")!;
    assert.match(sqlText(lock.args), /co\."archived_at" IS NULL/);
    assert.match(sqlText(lock.args), /co\."status" <>/);
    assert.ok(
      sqlValues(lock.args).includes(CourseOfferingStatus.ARCHIVED),
    );
  }

  const valid = harness();
  assert.equal(
    (await valid.repository.approveCourseOutlineVersion(approvalInput()))
      .outcome,
    "APPROVED",
  );
});

test("wrong department, offering, live authority, or malformed/unbound offering fails with safe not-found", async () => {
  const cases = [
    [harness(), approvalInput({ departmentId: "department-b" })],
    [harness(), approvalInput({ courseOfferingId: "offering-b" })],
    [harness({ authorityValid: false }), approvalInput()],
    [
      harness({ offering: offering({ studentBatchId: null }) }),
      approvalInput(),
    ],
    [
      harness({ offering: offering({ curriculumCourseId: null }) }),
      approvalInput(),
    ],
    [
      harness({ offering: offering({ syllabusVersionId: null }) }),
      approvalInput(),
    ],
    [harness({ bindingValid: false }), approvalInput()],
  ] as const;

  for (const [h, input] of cases) {
    assert.deepEqual(await h.repository.approveCourseOutlineVersion(input), {
      outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND",
    });
    assert.equal(h.audits.length, 0);
    assert.equal(
      h.calls.some((call) => call.kind === "update"),
      false,
    );
  }
});

test("authoritative binding validation covers every required academic identity and parent scope", async () => {
  const h = harness();
  await h.repository.approveCourseOutlineVersion(approvalInput());
  const where = h.calls.find((call) => call.kind === "binding-validation")!.args
    .where;
  assert.equal(where.departmentId, "department-a");
  assert.equal(where.studentBatchId, "batch-a");
  assert.equal(where.academicTermId, "term-a");
  assert.equal(where.curriculumCourseId, "curriculum-a");
  assert.equal(where.syllabusVersionId, "syllabus-a");
  assert.equal(where.archivedAt, null);
  assert.deepEqual(where.status, {
    not: CourseOfferingStatus.ARCHIVED,
  });
  assert.equal(where.department.is.id, "department-a");
  assert.deepEqual(where.course.is.academicProgramId, { not: null });
  assert.equal(
    where.course.is.academicProgram.is.departmentId,
    "department-a",
  );
  assert.equal(where.studentBatch.is.departmentId, "department-a");
  assert.equal(where.academicTerm.is.departmentId, "department-a");
  assert.equal(where.curriculumCourse.is.departmentId, "department-a");
  assert.equal(where.curriculumCourse.is.courseId, "course-a");
  assert.equal(
    where.curriculumCourse.is.curriculumVersion.is.academicProgram.is
      .departmentId,
    "department-a",
  );
  assert.equal(where.syllabusVersion.is.departmentId, "department-a");
  assert.equal(where.syllabusVersion.is.curriculumCourseId, "curriculum-a");

  const select = h.calls.find(
    (call) => call.kind === "binding-validation",
  )!.args.select;
  assert.equal(select.course.select.academicProgramId, true);
  assert.equal(
    select.curriculumCourse.select.curriculumVersion.select.academicProgramId,
    true,
  );
  assert.equal(select.studentBatch.select.academicProgramId, true);

  const validated = h.validatedOffering()!;
  assert.equal(validated.course.academicProgramId, "program-a");
  assert.equal(
    validated.curriculumCourse.curriculumVersion.academicProgramId,
    validated.course.academicProgramId,
  );
  assert.equal(
    validated.studentBatch.academicProgramId,
    validated.course.academicProgramId,
  );
});

test("malformed same-department programme chains fail closed before outline mutation", async () => {
  const cases: ProgrammeChainOverrides[] = [
    {
      courseAcademicProgramId: "program-a",
      curriculumVersionAcademicProgramId: "program-b",
      studentBatchAcademicProgramId: "program-a",
    },
    {
      courseAcademicProgramId: "program-a",
      curriculumVersionAcademicProgramId: "program-a",
      studentBatchAcademicProgramId: "program-b",
    },
    {
      courseAcademicProgramId: "program-c",
      curriculumVersionAcademicProgramId: "program-a",
      studentBatchAcademicProgramId: "program-b",
    },
    {
      courseAcademicProgramId: null,
      courseAcademicProgramIdentityId: null,
    },
    {
      courseAcademicProgramId: "program-a",
      courseAcademicProgramIdentityId: "program-other",
    },
    {
      curriculumVersionAcademicProgramId: "program-a",
      curriculumVersionAcademicProgramIdentityId: "program-other",
    },
    {
      studentBatchAcademicProgramId: "program-a",
      studentBatchAcademicProgramIdentityId: "program-other",
    },
  ];

  for (const programmeChain of cases) {
    const h = harness({ programmeChain });
    assert.deepEqual(
      await h.repository.approveCourseOutlineVersion(approvalInput()),
      { outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND" },
    );
    assert.equal(
      h.calls.some((call) => call.kind === "update"),
      false,
    );
    assert.equal(h.audits.length, 0);
  }
});

test("wrong nested outline and cross-identity CurriculumCourse or SyllabusVersion fail safely", async () => {
  for (const [h, input] of [
    [harness(), approvalInput({ courseOutlineVersionId: "outline-b" })],
    [harness({ outline: null }), approvalInput()],
    [
      harness({
        outline: outline(undefined, { departmentId: "department-b" }),
      }),
      approvalInput(),
    ],
    [
      harness({
        outline: outline(undefined, { courseOfferingId: "offering-b" }),
      }),
      approvalInput(),
    ],
    [
      harness({ outline: outline(undefined, { curriculumCourseId: "other" }) }),
      approvalInput(),
    ],
    [
      harness({ outline: outline(undefined, { syllabusVersionId: "other" }) }),
      approvalInput(),
    ],
  ] as const) {
    assert.deepEqual(await h.repository.approveCourseOutlineVersion(input), {
      outcome: "OUTLINE_NOT_FOUND",
    });
    assert.equal(h.audits.length, 0);
  }
});

test("only a well-formed COORDINATOR_REVIEW lifecycle can be approved", async () => {
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
      await h.repository.approveCourseOutlineVersion(approvalInput()),
      {
        outcome: "OUTLINE_NOT_APPROVABLE",
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
      await h.repository.approveCourseOutlineVersion(approvalInput()),
      {
        outcome: "OUTLINE_NOT_APPROVABLE",
      },
    );
    assert.equal(h.audits.length, 0);
  }
});

test("conditional mutation contains exact identity and lifecycle predicates with one server timestamp", async () => {
  const h = harness();
  await h.repository.approveCourseOutlineVersion(approvalInput());
  const mutation = h.calls.find((call) => call.kind === "update")!.args;
  assert.deepEqual(mutation.where, {
    id: "outline-a",
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    status: CourseOutlineStatus.COORDINATOR_REVIEW,
    submittedAt,
    approvedAt: null,
    activatedAt: null,
    archivedAt: null,
  });
  assert.equal(mutation.data.status, CourseOutlineStatus.APPROVED);
  assert.ok(mutation.data.approvedAt instanceof Date);

  const audit = h.audits[0]!.data;
  assert.equal(audit.occurredAt.getTime(), mutation.data.approvedAt.getTime());
  assert.equal(
    new Date(audit.contextJson.transitionTimestamp).getTime(),
    mutation.data.approvedAt.getTime(),
  );
});

test("approval success audit is atomic, complete, and excludes authored or correction text", async () => {
  const h = harness();
  await h.repository.approveCourseOutlineVersion(approvalInput());
  assert.equal(h.audits.length, 1);
  const audit = h.audits[0]!.data;
  assert.equal(audit.action, ACADEMIC_AUDIT_EVENTS.COURSE_OUTLINE_APPROVED);
  assert.equal(audit.actorUserId, "approver-a");
  assert.equal(audit.departmentId, "department-a");
  assert.equal(audit.requestId, "request-a");
  assert.equal(audit.ipAddress, "127.0.0.1");
  assert.equal(audit.userAgent, "test-agent");
  assert.deepEqual(
    Object.keys(audit.contextJson).sort(),
    [
      "academicTermId",
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
  assert.equal(audit.contextJson.studentBatchId, "batch-a");
  assert.equal(audit.contextJson.academicTermId, "term-a");
  assert.equal(
    audit.contextJson.previousStatus,
    CourseOutlineStatus.COORDINATOR_REVIEW,
  );
  assert.equal(audit.contextJson.newStatus, CourseOutlineStatus.APPROVED);
  assert.doesNotMatch(
    JSON.stringify(audit.contextJson),
    /Sensitive|correction/i,
  );
});

test("audit failure rolls approval back and preserves correction history", async () => {
  const failure = new Error("audit unavailable");
  const h = harness({ auditError: failure });
  const before = h.outline();
  const correctionsBefore = structuredClone(h.correctionRequests);
  await assert.rejects(
    h.repository.approveCourseOutlineVersion(approvalInput()),
    failure,
  );
  assert.deepEqual(h.outline(), before);
  assert.deepEqual(h.correctionRequests, correctionsBefore);
  assert.equal(h.audits.length, 0);
});

test("repeat approval is a controlled conflict without timestamp rewrite or duplicate audit", async () => {
  const h = harness();
  const first = await h.repository.approveCourseOutlineVersion(approvalInput());
  assert.equal(first.outcome, "APPROVED");
  const approvedAt = h.outline()!.approvedAt;

  assert.deepEqual(
    await h.repository.approveCourseOutlineVersion(approvalInput()),
    {
      outcome: "OUTLINE_NOT_APPROVABLE",
    },
  );
  assert.equal(h.outline()!.approvedAt?.getTime(), approvedAt?.getTime());
  assert.equal(h.audits.length, 1);
});

test("simultaneous first approvals allow exactly one mutation and one success audit", async () => {
  const h = harness();
  const results = await Promise.all([
    h.repository.approveCourseOutlineVersion(approvalInput()),
    h.repository.approveCourseOutlineVersion(approvalInput()),
  ]);
  assert.deepEqual(
    results.map((result) => result.outcome).sort(),
    ["APPROVED", "OUTLINE_NOT_APPROVABLE"].sort(),
  );
  assert.equal(h.audits.length, 1);
  assert.equal(h.outline()!.status, CourseOutlineStatus.APPROVED);
  assert.ok(h.outline()!.approvedAt instanceof Date);
});

test("CAS miss distinguishes hidden nested disappearance, lifecycle conflict, and true concurrent conflict", async () => {
  const missing = harness({ updateCount: 0, afterMiss: null });
  assert.deepEqual(
    await missing.repository.approveCourseOutlineVersion(approvalInput()),
    { outcome: "OUTLINE_NOT_FOUND" },
  );

  const transitioned = harness({
    updateCount: 0,
    afterMiss: outline(CourseOutlineStatus.APPROVED, {
      approvedAt: new Date("2026-08-26T09:00:00.000Z"),
    }),
  });
  assert.deepEqual(
    await transitioned.repository.approveCourseOutlineVersion(approvalInput()),
    { outcome: "OUTLINE_NOT_APPROVABLE" },
  );

  const conflict = harness({ updateCount: 0 });
  assert.deepEqual(
    await conflict.repository.approveCourseOutlineVersion(approvalInput()),
    { outcome: "CONCURRENT_CONFLICT" },
  );
  assert.equal(conflict.audits.length, 0);
});

test("serializable approval retries transient database conflicts and exhausts as controlled conflict", async () => {
  const retried = harness({
    transactionErrors: [knownRequestError("P2034")],
  });
  assert.equal(
    (await retried.repository.approveCourseOutlineVersion(approvalInput()))
      .outcome,
    "APPROVED",
  );
  assert.equal(
    retried.calls.filter((call) => call.kind === "transaction").length,
    2,
  );

  const exhausted = harness({
    transactionErrors: [
      knownRequestError("P2034"),
      knownRequestError("P2010", { code: "40001" }),
      knownRequestError("P2034"),
    ],
  });
  assert.deepEqual(
    await exhausted.repository.approveCourseOutlineVersion(approvalInput()),
    { outcome: "CONCURRENT_CONFLICT" },
  );
  assert.equal(exhausted.audits.length, 0);
});
