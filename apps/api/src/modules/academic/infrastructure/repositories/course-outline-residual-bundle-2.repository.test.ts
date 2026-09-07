import assert from "node:assert/strict";
import test from "node:test";

import {
  CourseOfferingStatus,
  CourseOutlineStatus,
  Prisma,
} from "@prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

import { ACADEMIC_AUDIT_EVENTS } from "../../domain/academic.audit-events";
import { PrismaAcademicRepository } from "./prisma-academic.repository";

const submittedAt = new Date("2026-09-01T01:00:00.000Z");
const approvedAt = new Date("2026-09-01T02:00:00.000Z");
const originalActivatedAt = new Date("2026-09-01T03:00:00.000Z");

function outline(
  id: string,
  versionNumber: number,
  status: CourseOutlineStatus,
) {
  return {
    id,
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    versionNumber,
    status,
    courseSummary: `${id} narrative`,
    deliveryPlan: null,
    teachingStrategies: null,
    assessmentStrategy: null,
    evaluationPolicy: null,
    makeUpProcedure: null,
    submittedAt,
    approvedAt,
    activatedAt:
      status === CourseOutlineStatus.ACTIVE ? originalActivatedAt : null,
    archivedAt: null as Date | null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  };
}

function input(target = "approved-a") {
  return {
    departmentId: "department-a",
    courseOfferingId: "offering-a",
    courseOutlineVersionId: target,
    actorUserId: "support-user",
    authorizationUserRoleId: "support-user-role",
    authorizationRoleId: "support-role",
    requestId: "request-a",
    ipAddress: "127.0.0.1",
    userAgent: "test-agent",
  };
}

function harness(options: {
  pointer?: string | null;
  authority?: boolean;
  academicChain?: boolean;
  auditFails?: boolean;
  transactionErrors?: PrismaClientKnownRequestError[];
  versions?: ReturnType<typeof outline>[];
} = {}) {
  let state = {
    offering: {
      id: "offering-a",
      departmentId: "department-a",
      courseId: "course-a",
      studentBatchId: "batch-a",
      academicTermId: "term-a",
      curriculumCourseId: "curriculum-a",
      syllabusVersionId: "syllabus-a",
      activeCourseOutlineVersionId:
        options.pointer === undefined ? "active-a" : options.pointer,
      status: CourseOfferingStatus.IN_PROGRESS,
      archivedAt: null,
    },
    versions:
      options.versions ?? [
        outline("active-a", 1, CourseOutlineStatus.ACTIVE),
        outline("approved-a", 2, CourseOutlineStatus.APPROVED),
        outline("approved-b", 3, CourseOutlineStatus.APPROVED),
      ],
    audits: [] as Array<Record<string, unknown>>,
  };
  let queue = Promise.resolve();
  const transactionOptions: unknown[] = [];

  const makeTx = () => {
    let outlineLockCount = 0;
    return {
      $queryRaw: async (query: { strings?: readonly string[]; values?: unknown[] }) => {
        const sql = query.strings?.join("?") ?? "";
        if (sql.includes('FROM "course_offerings" co') && sql.includes("FOR UPDATE OF co")) {
          return [structuredClone(state.offering)];
        }
        if (sql.includes('FROM "users" u')) {
          return options.authority === false ? [] : [{ id: "support-user" }];
        }
        if (sql.includes('JOIN "courses" c')) {
          return options.academicChain === false ? [] : [{ id: "offering-a" }];
        }
        if (sql.includes('FROM "course_outline_versions" cov')) {
          if (sql.includes('cov."status" =')) {
            return state.versions
              .filter((item) => item.status === CourseOutlineStatus.ACTIVE)
              .map(({ id }) => ({ id }));
          }
          const requestedId = outlineLockCount++ === 0
            ? state.offering.activeCourseOutlineVersionId
            : query.values?.find(
                (value) =>
                  typeof value === "string" &&
                  state.versions.some((item) => item.id === value) &&
                  value !== state.offering.activeCourseOutlineVersionId,
              );
          return state.versions.some((item) => item.id === requestedId)
            ? [{ id: requestedId }]
            : [];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
      courseOutlineVersion: {
        findFirst: async (args: {
          where: { id: string; status?: CourseOutlineStatus };
        }) => {
          const found = state.versions.find(
            (item) =>
              item.id === args.where.id &&
              (args.where.status === undefined ||
                item.status === args.where.status),
          );
          return found ? structuredClone(found) : null;
        },
        updateMany: async (args: {
          where: { id: string; status: CourseOutlineStatus };
          data: {
            status: CourseOutlineStatus;
            archivedAt?: Date;
            activatedAt?: Date;
          };
        }) => {
          const found = state.versions.find(
            (item) =>
              item.id === args.where.id &&
              item.status === args.where.status,
          );
          if (!found) return { count: 0 };
          found.status = args.data.status;
          if (args.data.archivedAt) found.archivedAt = args.data.archivedAt;
          if (args.data.activatedAt) found.activatedAt = args.data.activatedAt;
          return { count: 1 };
        },
      },
      courseOffering: {
        updateMany: async (args: {
          where: { activeCourseOutlineVersionId: string };
          data: { activeCourseOutlineVersionId: string };
        }) => {
          if (
            state.offering.activeCourseOutlineVersionId !==
            args.where.activeCourseOutlineVersionId
          ) {
            return { count: 0 };
          }
          state.offering.activeCourseOutlineVersionId =
            args.data.activeCourseOutlineVersionId;
          return { count: 1 };
        },
      },
      auditLog: {
        create: async (args: { data: Record<string, unknown> }) => {
          if (options.auditFails) throw new Error("audit failed");
          state.audits.push(structuredClone(args.data));
          return { id: "audit-a" };
        },
      },
    };
  };

  const prisma = {
    courseOffering: {
      findFirst: async () => ({
        activeCourseOutlineVersionId:
          state.offering.activeCourseOutlineVersionId,
      }),
    },
    $transaction: async (
      callback: (tx: ReturnType<typeof makeTx>) => Promise<unknown>,
      optionsArg: unknown,
    ) => {
      transactionOptions.push(optionsArg);
      const injectedError = options.transactionErrors?.shift();
      if (injectedError) throw injectedError;
      const run = queue.then(async () => {
        const snapshot = structuredClone(state);
        try {
          return await callback(makeTx());
        } catch (error) {
          state = snapshot;
          throw error;
        }
      });
      queue = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };

  return {
    repository: new PrismaAcademicRepository(prisma as never),
    state: () => structuredClone(state),
    transactionOptions,
  };
}

function knownRequestError(code: string, meta?: Record<string, unknown>) {
  return new PrismaClientKnownRequestError("test Prisma failure", {
    code,
    clientVersion: "6.19.3",
    meta,
  });
}

test("replacement archives old, activates approved target, pointer-CASes, and audits once atomically", async () => {
  const h = harness();
  const result = await h.repository.replaceActiveCourseOutlineVersion(input());
  assert.equal(result.outcome, "REPLACED");
  const state = h.state();
  const old = state.versions.find((item) => item.id === "active-a")!;
  const replacement = state.versions.find((item) => item.id === "approved-a")!;
  assert.equal(old.status, CourseOutlineStatus.ARCHIVED);
  assert.equal(replacement.status, CourseOutlineStatus.ACTIVE);
  assert.equal(state.offering.activeCourseOutlineVersionId, "approved-a");
  assert.equal(old.activatedAt?.getTime(), originalActivatedAt.getTime());
  assert.equal(old.submittedAt.getTime(), submittedAt.getTime());
  assert.equal(replacement.approvedAt.getTime(), approvedAt.getTime());
  assert.equal(old.archivedAt?.getTime(), replacement.activatedAt?.getTime());
  assert.equal(state.audits.length, 1);
  assert.deepEqual(h.transactionOptions[0], {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 30_000,
  });
});

test("replacement requires exact live authority before lifecycle mutation", async () => {
  const h = harness({ authority: false });
  assert.deepEqual(
    await h.repository.replaceActiveCourseOutlineVersion(input()),
    { outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND" },
  );
  const state = h.state();
  assert.equal(state.offering.activeCourseOutlineVersionId, "active-a");
  assert.equal(
    state.versions.find((item) => item.id === "active-a")?.status,
    CourseOutlineStatus.ACTIVE,
  );
  assert.equal(state.audits.length, 0);
});

test("null/malformed pointer, same ID, and academic-chain failure are controlled", async () => {
  const noPointer = harness({ pointer: null });
  assert.deepEqual(
    await noPointer.repository.replaceActiveCourseOutlineVersion(input()),
    { outcome: "ACTIVE_BINDING_MISMATCH" },
  );

  const malformed = harness({ pointer: "missing-active" });
  assert.deepEqual(
    await malformed.repository.replaceActiveCourseOutlineVersion(input()),
    { outcome: "ACTIVE_BINDING_MISMATCH" },
  );

  const same = harness();
  assert.deepEqual(
    await same.repository.replaceActiveCourseOutlineVersion(input("active-a")),
    { outcome: "SAME_VERSION" },
  );

  const badChain = harness({ academicChain: false });
  assert.deepEqual(
    await badChain.repository.replaceActiveCourseOutlineVersion(input()),
    { outcome: "OFFERING_OR_AUTHORITY_NOT_FOUND" },
  );
});

test("wrong state and wrong academic identity cannot replace", async () => {
  const wrongStatus = harness({
    versions: [
      outline("active-a", 1, CourseOutlineStatus.ACTIVE),
      outline("approved-a", 2, CourseOutlineStatus.DRAFT),
    ],
  });
  assert.deepEqual(
    await wrongStatus.repository.replaceActiveCourseOutlineVersion(input()),
    { outcome: "OUTLINE_NOT_REPLACEABLE" },
  );

  const mismatched = outline(
    "approved-a",
    2,
    CourseOutlineStatus.APPROVED,
  );
  mismatched.syllabusVersionId = "other-syllabus";
  const wrongIdentity = harness({
    versions: [
      outline("active-a", 1, CourseOutlineStatus.ACTIVE),
      mismatched,
    ],
  });
  assert.deepEqual(
    await wrongIdentity.repository.replaceActiveCourseOutlineVersion(input()),
    { outcome: "OUTLINE_NOT_FOUND" },
  );
});

test("same-target race has exactly one winner and one audit", async () => {
  const h = harness();
  const [first, second] = await Promise.all([
    h.repository.replaceActiveCourseOutlineVersion(input("approved-a")),
    h.repository.replaceActiveCourseOutlineVersion(input("approved-a")),
  ]);
  assert.deepEqual(
    [first.outcome, second.outcome].sort(),
    ["CONCURRENT_CONFLICT", "REPLACED"],
  );
  const state = h.state();
  assert.equal(state.audits.length, 1);
  assert.equal(
    state.versions.filter((item) => item.status === CourseOutlineStatus.ACTIVE)
      .length,
    1,
  );
});

test("different-target race has one winner and leaves loser APPROVED", async () => {
  const h = harness();
  const [first, second] = await Promise.all([
    h.repository.replaceActiveCourseOutlineVersion(input("approved-a")),
    h.repository.replaceActiveCourseOutlineVersion(input("approved-b")),
  ]);
  assert.deepEqual(
    [first.outcome, second.outcome].sort(),
    ["CONCURRENT_CONFLICT", "REPLACED"],
  );
  const state = h.state();
  const winner = state.offering.activeCourseOutlineVersionId;
  const loser = winner === "approved-a" ? "approved-b" : "approved-a";
  assert.equal(
    state.versions.find((item) => item.id === loser)?.status,
    CourseOutlineStatus.APPROVED,
  );
  assert.equal(
    state.versions.find((item) => item.id === "active-a")?.status,
    CourseOutlineStatus.ARCHIVED,
  );
  assert.equal(state.audits.length, 1);
});

test("audit failure rolls back old/new lifecycle and pointer state", async () => {
  const h = harness({ auditFails: true });
  await assert.rejects(
    h.repository.replaceActiveCourseOutlineVersion(input()),
    /audit failed/,
  );
  const state = h.state();
  assert.equal(state.offering.activeCourseOutlineVersionId, "active-a");
  assert.equal(
    state.versions.find((item) => item.id === "active-a")?.status,
    CourseOutlineStatus.ACTIVE,
  );
  assert.equal(
    state.versions.find((item) => item.id === "approved-a")?.status,
    CourseOutlineStatus.APPROVED,
  );
  assert.equal(state.audits.length, 0);
});

test("replacement audit is exact structural data with shared timestamp and no narrative", async () => {
  const h = harness();
  await h.repository.replaceActiveCourseOutlineVersion(input());
  const audit = h.state().audits[0]!;
  assert.equal(audit.action, ACADEMIC_AUDIT_EVENTS.COURSE_OUTLINE_REPLACED);
  assert.equal(
    (audit.occurredAt as Date).toISOString(),
    (audit.contextJson as { transitionTimestamp: string }).transitionTimestamp,
  );
  assert.deepEqual(audit.contextJson, {
    courseOfferingId: "offering-a",
    studentBatchId: "batch-a",
    academicTermId: "term-a",
    curriculumCourseId: "curriculum-a",
    syllabusVersionId: "syllabus-a",
    oldCourseOutlineVersionId: "active-a",
    oldVersionNumber: 1,
    newCourseOutlineVersionId: "approved-a",
    newVersionNumber: 2,
    oldPreviousStatus: CourseOutlineStatus.ACTIVE,
    oldNewStatus: CourseOutlineStatus.ARCHIVED,
    replacementPreviousStatus: CourseOutlineStatus.APPROVED,
    replacementNewStatus: CourseOutlineStatus.ACTIVE,
    previousActiveCourseOutlineVersionId: "active-a",
    activeCourseOutlineVersionId: "approved-a",
    transitionTimestamp: (audit.occurredAt as Date).toISOString(),
  });
  assert.doesNotMatch(JSON.stringify(audit), /narrative|courseSummary/i);
});

test("replacement retries only the existing bounded Serializable conflict classes", async () => {
  const retry = harness({
    transactionErrors: [
      knownRequestError("P2034"),
      knownRequestError("P2010", { code: "40001" }),
    ],
  });
  assert.equal(
    (await retry.repository.replaceActiveCourseOutlineVersion(input())).outcome,
    "REPLACED",
  );
  assert.equal(retry.transactionOptions.length, 3);

  const exhausted = harness({
    transactionErrors: [
      knownRequestError("P2034"),
      knownRequestError("P2034"),
      knownRequestError("P2034"),
    ],
  });
  assert.deepEqual(
    await exhausted.repository.replaceActiveCourseOutlineVersion(input()),
    { outcome: "CONCURRENT_CONFLICT" },
  );
  assert.equal(exhausted.transactionOptions.length, 3);

  const unrelated = harness({
    transactionErrors: [knownRequestError("P2010", { code: "40P01" })],
  });
  await assert.rejects(
    unrelated.repository.replaceActiveCourseOutlineVersion(input()),
    (error: unknown) =>
      error instanceof PrismaClientKnownRequestError && error.code === "P2010",
  );
  assert.equal(unrelated.transactionOptions.length, 1);
});
