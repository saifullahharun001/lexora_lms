import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AttendanceMarkGenerationService } from "./attendance-mark-generation.service";

function harness(fault?: string) {
  const start = new Date("2026-09-01T09:00:00Z"), end = new Date("2026-09-01T10:00:00Z");
  const calls: string[] = [], versions: any[] = [], items: any[] = [];
  const authority = { departmentId: "law", actorUserId: "chairman", userRoleId: "ur", roleId: "role",
    examinationId: "exam", committeeId: "committee", committeeAssignmentId: "assignment", seat: "CHAIRMAN", assignmentAssignedAt: start };
  const scope = [1, 2].map((n) => ({ examinationCourseId: `ec${n}`, courseOfferingId: `o${n}`, studentBatchId: "batch",
    academicTermId: "term", configuration: [], enrollments: [1, 2].map((e) => ({ id: `e${n}${e}`, studentUserId: `s${n}${e}` })) }));
  if (fault === "empty") for (const course of scope) course.enrollments = [];
  if (fault === "empty-course") scope[1]!.enrollments = [];
  let parent: any, audit: any;
  const tx: any = {
    $queryRaw: async (q: any) => {
      calls.push(q.sql.includes("attendance_generation_scope") ? "scope" : "exam-lock");
      if (q.sql.includes("attendance_generation_scope")) return [{ scope }];
      return [{ id: "exam" }];
    },
    examination: { findUniqueOrThrow: async () => ({ id: "exam", academicProgramId: "program", academicSessionId: "session", academicTermId: "term" }) },
    formativeAttendanceGeneration: { findUnique: async () => fault === "duplicate" ? {} : null,
      create: async ({ data }: any) => { calls.push("parent"); parent = { ...data, id: "generation", generatedAt: end }; return parent; } },
    attendanceRecord: { findMany: async ({ where }: any) => {
      calls.push("calculate"); const bad = where.enrollmentId === "e22";
      if (bad && fault === "missing") return [];
      return [{ id: `r${where.enrollmentId}`, departmentId: "law", enrollmentId: where.enrollmentId,
        studentUserId: where.enrollmentId.replace("e", "s"), classSessionId: `session-o${where.enrollmentId[1]}`,
        status: bad && fault === "unsupported" ? "LATE" : "PRESENT", sourceType: "MANUAL", externalSourceRef: null,
        markedByUserId: "teacher", overrideByUserId: null, overrideReason: null, markedAt: start, updatedAt: start, archivedAt: null,
        resolutionStatus: bad && fault === "conflict" ? "CONFLICT" : "RESOLVED", conflictEvidenceJson: null, attendanceEvidenceRevision: 1 }];
    } },
    formativeAttendanceCorrection: { findMany: async ({ where }: any) => fault === "stale" && where.enrollmentId === "e22"
      ? [{ id: "correction", classSessionId: "session-o2", status: "ABSENT", basisFingerprint: "stale" }] : [] },
    formativeAttendanceVersion: { findFirst: async () => ({ id: "historic-locked", revision: 4, generationId: null }),
      create: async ({ data }: any) => { calls.push("child"); if (fault === "child") throw Error("child failure"); versions.push(data); return { ...data, id: `v${versions.length}` }; } },
    formativeAttendanceSourceItem: { createMany: async ({ data }: any) => { items.push(...data); } },
    auditLog: { create: async ({ data }: any) => { calls.push("audit"); if (fault === "audit") throw Error("audit failure"); audit = data; } },
  };
  const service = new AttendanceMarkGenerationService({ $transaction: async (work: any, options: any) => {
    assert.equal(options.isolationLevel, Prisma.TransactionIsolationLevel.Serializable);
    try { return await work(tx); } catch (error) {
      parent = audit = undefined; versions.length = items.length = 0; throw error;
    }
  } } as never, { get: () => ({ audit: {}, departmentId: "forged" }) } as never,
  { authorize: async () => authority, assertCurrentAuthority: async () => { calls.push("authority"); } } as never,
  { read: async (_tx: any, _dept: string, offering: string) => fault === "zero" && offering === "o2" ? [] : [{
    id: `session-${offering}`, departmentId: "law", courseOfferingId: offering, status: "COMPLETED",
    actualStartAt: start, actualEndAt: end, canceledAt: null, attendanceEvidenceRevision: 1,
  }] } as never, { reconcileInTransaction: async (transaction: unknown, department: string, examination: string) => {
    assert.equal(transaction, tx); assert.equal(department, "law"); assert.equal(examination, "exam");
    assert.ok(audit); assert.equal(versions.length, parent.resultCount);
    calls.push("aggregate"); if (fault === "aggregate") throw Error("aggregate failure"); return [];
  } } as never);
  return { service, calls, versions, items, parent: () => parent, audit: () => audit };
}
test("one action calculates every course/enrollment before writes; one audit and no transitions", async () => {
  const h = harness(); const result = await h.service.generate("exam");
  assert.equal(result.courseCount, 2); assert.equal(result.resultCount, 4);
  assert.equal(h.versions.length, 4); assert.equal(h.items.length, 4);
  assert.equal(h.calls.at(-1), "aggregate");
  assert.ok(h.calls.lastIndexOf("calculate") < h.calls.indexOf("parent"));
  assert.deepEqual(h.calls.slice(0, 3), ["exam-lock", "scope", "authority"]);
  for (const v of h.versions) {
    assert.equal(v.generationId, "generation"); assert.equal(v.actorUserId, "chairman");
    assert.equal(v.coordinatorAssignmentId, undefined); assert.equal(v.mark.toString(), "5");
    assert.equal(v.revision, 5); assert.equal(v.previousId, "historic-locked"); assert.equal(v.status, "READY");
  }
  assert.equal(h.calls.filter((c) => c === "audit").length, 1);
  assert.equal(h.audit().action, "attendance.mark.generated"); assert.deepEqual(h.audit().contextJson, result);
});
for (const fault of ["missing", "conflict", "stale", "unsupported", "zero", "duplicate", "empty"]) {
  test(`${fault} rejects the entire generation before authoritative inserts`, async () => {
    const h = harness(fault); await assert.rejects(h.service.generate("exam"), ConflictException);
    assert.equal(h.parent(), undefined); assert.equal(h.versions.length, 0); assert.equal(h.audit(), undefined);
  });
}
test("an individual empty course remains in a non-empty generation scope", async () => {
  const h = harness("empty-course"); const result = await h.service.generate("exam");
  assert.equal(result.courseCount, 2); assert.equal(result.resultCount, 2);
  assert.equal(h.parent().scopeJson[1].enrollments.length, 0);
  assert.equal(h.versions.length, 2);
});
for (const fault of ["audit", "child", "aggregate"]) test(`${fault} failure escapes the atomic transaction`, async () => {
  await assert.rejects(harness(fault).service.generate("exam"), new RegExp(`${fault} failure`));
});

function transactionFailure(error: Error) {
  let attempts = 0;
  const service = new AttendanceMarkGenerationService({ $transaction: async () => { attempts++; throw error; } } as never,
    {} as never, { authorize: async () => ({}) } as never, {} as never, { reconcileInTransaction: async () => [] } as never);
  return { service, attempts: () => attempts };
}
const unknownDatabaseError = (message: string) => new Prisma.PrismaClientUnknownRequestError(
  `Error occurred during query execution:\nConnectorError(QueryError(PostgresError { code: "23514", message: "${message}", severity: "ERROR" }))`,
  { clientVersion: "6.0.0" },
);
for (const [message, exception] of [
  ["Exact current Attendance Chairman authority required", ForbiddenException],
  ["Examination not found", NotFoundException],
  ["Attendance generation requires exactly one success audit", ConflictException],
  ["Attendance generation child package incomplete or inconsistent", ConflictException],
  ["Generated Attendance source is frozen", ConflictException],
  ["Attendance generation scope mismatch", ConflictException],
  ["Invalid generated Attendance provenance", ConflictException],
] as const) test(`unknown Prisma generation guard is normalized: ${message}`, async () => {
  const h = transactionFailure(unknownDatabaseError(message));
  await assert.rejects(h.service.generate("exam"), exception);
  assert.equal(h.attempts(), 1);
});

test("unrelated unknown Prisma failures are rethrown unchanged", async () => {
  for (const message of ["connection terminated unexpectedly", "record v is not assigned yet",
    "Attendance generation requires exactly one success audit: unrelated failure"]) {
    const error = unknownDatabaseError(message);
    const h = transactionFailure(error);
    await assert.rejects(h.service.generate("exam"), (actual) => actual === error);
    assert.equal(h.attempts(), 1);
  }
});

test("known serialization and deadlock failures retain bounded retries", async () => {
  for (const [code, databaseCode] of [["P2034", undefined], ["P2010", "40001"], ["P2010", "40P01"]]) {
    const h = transactionFailure(new Prisma.PrismaClientKnownRequestError("transaction conflict",
      { code: code!, clientVersion: "6.0.0", meta: { code: databaseCode } }));
    await assert.rejects(h.service.generate("exam"), ConflictException);
    assert.equal(h.attempts(), 3);
  }
});
