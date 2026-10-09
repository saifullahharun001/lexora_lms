import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { CourseResultCompositionService, CourseCompositionSources } from "./course-result-composition.service";
import { evidenceTransaction } from "@/common/academic-evidence/transaction";

function harness() {
  const sources: CourseCompositionSources = {
    departmentId: "d", examinationId: "x", examinationCourseId: "ec", courseOfferingId: "o", enrollmentId: "e",
    studentUserId: "s", academicProgramId: "p", academicSessionId: "session", academicTermId: "term", studentBatchId: "batch",
    curriculumAssignmentId: "sca", curriculumVersionId: "cv", curriculumCourseId: "cc", syllabusVersionId: "sv", assessmentTemplateId: "template",
    candidateListId: "list", candidateListVersion: 1, registrationId: "reg", registrationVersion: 1, candidateCourseId: "candidate",
    candidateCategory: "REGULAR", formativeResultId: "f", summativeCandidateId: "sc", chairmanApprovalId: "a", calculatedMarkId: "m",
    calculatedMarkVersion: 2, formativeRule: "FINAL_FORMATIVE_40_SUM_V1", summativeRule: "SUMMATIVE_FIRST_SECOND_AVERAGE_V1",
    candidateRule: "REGULAR_RULE", formativeMark: "31.123456", formativeFullMark: "40.000000",
    summativeMark: "46.125", summativeFullMark: "60.00", provenanceJson: { contractVersion: "COURSE_COMPOSITION_PROVENANCE_V1", activitiesResultId: "ar", attendanceVersionId: "av",
      comprehensiveResultId: "cr", attendanceRevision: 1, comprehensiveVersion: 1, approvalVersion: 1,
      member1ReviewId: "r1", member2ReviewId: "r2", approvedAt: "2026-01-03", lockedAt: "2026-01-03",
      certifiedAt: "2026-01-01", certificationAssignmentId: "ca" },
  };
  const flags = { ready: true, matches: true, auditFailure: false, missingExam: false };
  let row: any = null; const audits: any[] = []; const calls: string[] = [];
  const tx: any = {
    $queryRaw: async (q: Prisma.Sql) => {
      if (q.sql.includes("UPDATE examinations")) { calls.push("lock"); return flags.missingExam ? [] : [{ id: "x" }]; }
      if (q.sql.includes("course_composition_matches")) { calls.push("match"); return [{ matches: flags.matches }]; }
      assert.ok(q.sql.includes("course_composition_sources")); assert.deepEqual(q.values, ["d", "x", "ec", "e"]);
      calls.push("sources"); return [{ sources: flags.ready ? sources : null }];
    },
    courseResultComposition: {
      findUnique: async () => row,
      create: async ({ data }: any) => { calls.push("create"); row = { ...data, id: "aggregate" }; return row; },
    },
    auditLog: { create: async ({ data }: any) => { if (flags.auditFailure) throw Error("audit failed"); calls.push("audit"); audits.push(data); } },
  };
  const service = new CourseResultCompositionService();
  const run = async () => {
    const before = row, count = audits.length;
    try { return await service.reconcileInTransaction(tx, "d", "x", "ec", "e"); }
    catch (error) { row = before; audits.length = count; throw error; }
  };
  return { sources, flags, audits, calls, run, row: () => row };
}

test("absent source writes neither partial aggregate nor audit", async () => {
  const h = harness(); h.flags.ready = false; assert.equal((await h.run()).status, "NOT_READY");
  assert.equal(h.row(), null); assert.equal(h.audits.length, 0);
});
test("creates exact source/version package after lock, with one SERVICE audit; repeat is unchanged", async () => {
  const h = harness(); assert.equal((await h.run()).status, "CREATED"); assert.equal((await h.run()).status, "EXISTING");
  assert.equal(h.row().totalMark.toString(), "77.248456"); assert.equal(h.row().calculatedMarkVersion, 2);
  assert.equal(h.audits.length, 1); assert.equal(h.audits[0].actorType, "SERVICE");
  assert.equal(h.audits[0].contextJson.totalMark, "77.248456");
  assert.deepEqual(h.calls, ["lock", "sources", "create", "audit", "lock", "sources", "match"]);
  for (const field of ["grade", "gradePoint", "publishedAt", "status"]) assert.equal(field in h.row(), false);
});
test("source replacement and disappearance fail closed", async () => {
  const h = harness(); await h.run(); h.flags.matches = false; await assert.rejects(h.run());
  h.flags.ready = false; await assert.rejects(h.run()); assert.equal(h.audits.length, 1);
});
test("missing audit rolls back aggregate", async () => {
  const h = harness(); h.flags.auditFailure = true; await assert.rejects(h.run()); assert.equal(h.row(), null);
});
test("safe missing examination", async () => {
  const h = harness(); h.flags.missingExam = true; await assert.rejects(h.run(), /Examination not found/);
  assert.deepEqual(h.calls, ["lock"]);
});
for (const key of ["departmentId", "examinationId", "examinationCourseId", "enrollmentId", "candidateCategory"] as const)
  test(`rejects substituted ${key}`, async () => {
    const h = harness(); h.sources[key] = "foreign"; await assert.rejects(h.run()); assert.equal(h.row(), null);
  });

for (const code of ["P2034", "40001", "40P01"]) test(`source-owner retry discipline is bounded for ${code}`, async () => {
  let attempts = 0;
  const db = { $transaction: async (_work: unknown, options: { isolationLevel: string }) => {
    assert.equal(options.isolationLevel, "Serializable"); attempts++;
    throw new Prisma.PrismaClientKnownRequestError("controlled conflict", {
      code: code === "P2034" ? code : "P2010", clientVersion: "test", meta: { code },
    });
  } };
  await assert.rejects(evidenceTransaction(db as never, async () => undefined), /Concurrent or duplicate evidence/);
  assert.equal(attempts, 3);
});


test("unexpected source and nested sensitive fields fail before persistence", async () => {
  for (const location of ["root", "provenance"] as const) {
    const h = harness();
    Object.assign(location === "root" ? h.sources : h.sources.provenanceJson, { privateProfile: "must-not-persist" });
    await assert.rejects(h.run(), /source contract/);
    assert.equal(h.row(), null); assert.equal(h.audits.length, 0);
  }
});
test("audit contains source references and result, without duplicated provenance or student/curriculum details", async () => {
  const h = harness(); await h.run(); const payload = h.audits[0].contextJson;
  for (const key of ["provenanceJson", "studentUserId", "curriculumAssignmentId", "academicSessionId"])
    assert.equal(Object.hasOwn(payload, key), false);
  assert.equal(payload.formativeResultId, "f"); assert.equal(payload.chairmanApprovalId, "a");
});
