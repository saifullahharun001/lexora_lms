import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { FinalFormativeService, FinalFormativeSources } from "./final-formative.service";

function harness() {
  const sources: FinalFormativeSources = {
    departmentId: "d", examinationId: "x", examinationCourseId: "ec", courseOfferingId: "o", enrollmentId: "e",
    studentUserId: "s", academicProgramId: "p", academicSessionId: "session", academicTermId: "term", studentBatchId: "batch",
    activitiesFinalisationId: "af", activitiesResultId: "ar", attendanceGenerationId: "ag", attendanceVersionId: "av",
    comprehensiveFinalisationId: "cf", comprehensiveResultId: "cr", activitiesMark: "24.00", activitiesFullMark: "30.00",
    attendanceMark: "3.5", attendanceFullMark: "5.00", comprehensiveMark: "4.000000", comprehensiveFullMark: "5.00",
    provenanceJson: { attendanceRevision: 2, activitiesSources: [{ submissionId: "v2" }], comprehensiveVersion: 1 },
  };
  const flags = { ready: true, auditFailure: false, conflict: false, failureAfter: false, compositionFailure: false };
  let result: any = null; const audits: any[] = []; const calls: string[] = [];
  const tx: any = {
    $queryRaw: async (q: Prisma.Sql) => {
      if (q.sql.includes("UPDATE examinations")) { calls.push("exam-lock"); return [{ id: "x" }]; }
      if (q.sql.includes("FROM examination_courses")) return [{ examinationCourseId: "ec", enrollmentId: "e" }];
      if (q.sql.includes("final_formative_matches")) return [{ matches: !flags.conflict }];
      assert.ok(q.sql.includes("final_formative_sources")); assert.deepEqual(q.values, ["d", "ec", "e"]);
      return [{ sources: flags.ready ? sources : null }];
    },
    formativeFinalResult: { findUnique: async () => result, create: async ({ data }: any) => {
      result = { ...data, id: "aggregate", createdAt: new Date() }; return result;
    } },
    auditLog: { create: async ({ data }: any) => { if (flags.auditFailure) throw Error("controlled audit failure"); audits.push(data); } },
  };
  const db: any = { $transaction: async (work: any, options: any) => {
    assert.equal(options.isolationLevel, "Serializable"); const before = result, size = audits.length;
    try { const value = await work(tx); if (flags.failureAfter) throw Error("controlled transaction failure"); return value; }
    catch (e) { result = before; audits.length = size; throw e; }
  } };
  return { sources, flags, audits, calls, tx, result: () => result, service: new FinalFormativeService(db, { reconcileInTransaction: async (client, ...scope) => {
    assert.equal(client, tx); assert.deepEqual(scope, ["d", "x", "ec", "e"]);
    assert.equal(audits.length, 1); if (flags.compositionFailure) throw Error("composition failed"); return { status: "NOT_READY" as const };
  } }) };
}

test("missing authoritative package is a no-op without placeholders", async () => {
  const h = harness(); h.flags.ready = false;
  assert.equal((await h.service.reconcile("d", "x"))[0]?.status, "NOT_READY");
  assert.equal(h.result(), null); assert.equal(h.audits.length, 0);
});

test("Formative-only operational reconciliation never invokes the /100 hook", async () => {
  const h = harness(); h.flags.compositionFailure = true;
  assert.equal((await h.service.reconcileFormativeOnly("d", "x"))[0]?.status, "CREATED");
  assert.equal((await h.service.reconcileFormativeOnly("d", "x"))[0]?.status, "EXISTING");
  assert.equal(h.audits.length, 1);
});
test("complete source tuple creates exact immutable evidence and one service audit; repeat reuses it", async () => {
  const h = harness(); await h.service.reconcile("d", "x"); await h.service.reconcile("d", "x");
  assert.equal(h.result().mark.toString(), "31.5"); assert.equal(h.result().fullMark.toString(), "40");
  for (const key of ["activitiesFinalisationId", "activitiesResultId", "attendanceGenerationId", "attendanceVersionId",
    "comprehensiveFinalisationId", "comprehensiveResultId"] as const) assert.equal(h.result()[key], h.sources[key]);
  assert.equal(h.audits.length, 1); assert.equal(h.audits[0].actorType, "SERVICE");
  assert.equal(h.audits[0].contextJson.mark, "31.500000"); assert.deepEqual(h.calls, ["exam-lock", "exam-lock"]);
});
test("source identity replacement and vanished package both fail closed", async () => {
  const h = harness(); await h.service.reconcile("d", "x");
  h.flags.conflict = true; h.sources.attendanceVersionId = "foreign";
  await assert.rejects(h.service.reconcile("d", "x"));
  h.flags.ready = false; await assert.rejects(h.service.reconcile("d", "x"));
  assert.equal(h.result().attendanceVersionId, "av"); assert.equal(h.audits.length, 1);
});
for (const flag of ["auditFailure", "failureAfter", "compositionFailure"] as const) test(`${flag} rolls back the entire package`, async () => {
  const h = harness(); h.flags[flag] = true; await assert.rejects(h.service.reconcile("d", "x"));
  assert.equal(h.result(), null); assert.equal(h.audits.length, 0);
});
for (const key of ["departmentId", "examinationCourseId", "enrollmentId", "activitiesFullMark", "attendanceFullMark", "comprehensiveFullMark"] as const)
  test(`rejects substituted ${key}`, async () => {
    const h = harness(); h.sources[key] = key.endsWith("FullMark") ? "100" : "foreign";
    await assert.rejects(h.service.reconcile("d", "x")); assert.equal(h.result(), null);
  });
