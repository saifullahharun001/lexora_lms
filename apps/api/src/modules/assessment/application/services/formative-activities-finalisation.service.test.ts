import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { FormativeActivitiesFinalisationService } from "./formative-activities-finalisation.service";
import { deriveFinalResult, FORMATIVE_FINAL_RULE } from "../../domain/formative-finalisation.rules";

function harness(blocker?: string) {
  const calls: string[] = [], parents: any[] = [], results: any[] = [], sources: any[] = [], audits: any[] = [];
  const scope = { ready: !blocker, activityCount: 2, rosterCount: 2, totalWeight: "30.00", sourceFingerprint: "a".repeat(64),
    blockers: blocker ? [{ code: blocker }] : [], activities: ["a", "b"].map((activityId) => ({ activityId,
      assignedWeight: "15.00", status: "MARKING", submissionId: `p-${activityId}`, submissionVersion: 1, isCurrent: true })),
    results: ["e1", "e2"].map((e) => deriveFinalResult(e, `s-${e}`, ["a", "b"].map((activityId) => ({ activityId,
      submissionId: `p-${activityId}`, submissionVersion: 1, submissionFingerprint: "b".repeat(64),
      submissionItemId: `${activityId}-${e}`, markEvidenceId: `m-${activityId}-${e}`, weightedMark: "12.13" })))) };
  const authority = { departmentId: "law", examinationId: "exam", examinationCourseId: "ec", courseOfferingId: "offering",
    committeeId: "committee", committeeAssignmentId: "appointment", actorUserId: "chair", userRoleId: "ur", roleId: "role",
    permissionId: "permission", rolePermissionId: "rp", assignmentAssignedAt: new Date("2026-01-01") };
  const flags = { changedAuthority: false, auditFailure: false, duplicate: false, materialisationFailure: false };
  const tx: any = {
    $queryRaw: async (q: Prisma.Sql) => {
      if (q.sql.includes("SET TRANSACTION READ ONLY")) { calls.push("read-only"); return 0; }
      if (q.sql.includes("formative_final_read_scope")) { calls.push("scope-read"); return 0; }
      if (q.sql.includes("formative_final_lock")) { calls.push("scope-locks"); assert.deepEqual(q.values, ["law", "exam", "ec", "offering"]); return []; }
      if (q.sql.includes("clock_timestamp")) return [{ now: new Date() }];
      calls.push("sources"); return [{ scope }];
    },
    formativeActivitiesFinalisation: {
      findUnique: async () => flags.duplicate ? { id: "existing" } : null,
      create: async ({ data }: any) => { calls.push("parent"); const p = { ...data, id: "final", finalisedAt: new Date() }; parents.push(p); return p; },
    },
    formativeActivitiesFinalResult: { create: async ({ data }: any) => { results.push(data); return { id: `r-${data.enrollmentId}` }; } },
    formativeActivitiesFinalSourceItem: { createMany: async ({ data }: any) => { sources.push(...data); } },
    auditLog: { create: async ({ data }: any) => { if (flags.auditFailure) throw Error("audit unavailable"); audits.push(data); } },
  };
  tx.$executeRaw = tx.$queryRaw;
  const service = new FormativeActivitiesFinalisationService({ $transaction: async (work: any, options: any) => {
    assert.ok(["Serializable", "RepeatableRead"].includes(options.isolationLevel));
    if (options.isolationLevel === "RepeatableRead") calls.push("snapshot-transaction");
    try { return await work(tx); } catch (e) { parents.length = results.length = sources.length = audits.length = 0; throw e; }
  } } as never, { get: () => ({ audit: {}, departmentId: "forged" }) } as never,
  { authorize: async () => authority, assertCurrentAuthority: async (_tx: unknown, _authority: unknown, _at: Date, lock: boolean) => { calls.push(lock ? "authority" : "authority-read");
    if (flags.changedAuthority) throw new ForbiddenException(); } } as never, { reconcileInTransaction: async (transaction: unknown, department: string, examination: string) => {
      assert.equal(transaction, tx); assert.equal(department, "law"); assert.equal(examination, "exam");
      assert.equal(audits.length, 1); assert.equal(results.length, scope.rosterCount);
      calls.push("aggregate"); if (flags.materialisationFailure) throw Error("aggregate failure"); return [];
    } } as never);
  return { service, flags, scope, calls, parents, results, sources, audits };
}
test("full roster finalises together with exact source bindings and a single transaction-coupled audit", async () => {
  const h = harness(); const summary = await h.service.finalise("ec");
  assert.deepEqual(h.calls, ["scope-locks", "authority", "sources", "parent", "aggregate"]);
  assert.equal(h.parents.length, 1); assert.equal(h.results.length, 2); assert.equal(h.sources.length, 4);
  assert.deepEqual(h.results.map((r) => r.mark), ["24.26", "24.26"]);
  assert.equal(h.parents[0].ruleVersionCode, FORMATIVE_FINAL_RULE);
  assert.deepEqual(h.parents[0].authoritySnapshotJson, { roleCode: "teacher", permissionCode: "formative.activities.finalise_department",
    resource: "formative.activities", action: "finalise", scope: "DEPARTMENT" });
  assert.equal(h.audits.length, 1); assert.deepEqual(h.audits[0].contextJson, summary);
  assert.equal(h.audits[0].action, "formative.activities.chairman-finalised");
});
for (const blocker of ["WEIGHT_NOT_30", "ACTIVITY_NOT_MARKING", "MISSING_SUBMISSION", "STALE_SUBMISSION",
  "EMPTY_ROSTER", "INVALID_CONFIGURATION", "SUBMISSION_CONFIGURATION_MISMATCH"])
  test(`${blocker} rejects the whole batch before inserts`, async () => {
    const h = harness(blocker); await assert.rejects(h.service.finalise("ec"), ConflictException); assert.equal(h.parents.length, 0);
  });
test("changed Chairman after admission is denied after scope locks", async () => {
  const h = harness(); h.flags.changedAuthority = true;
  await assert.rejects(h.service.finalise("ec"), ForbiddenException);
  assert.deepEqual(h.calls, ["scope-locks", "authority"]);
});
test("duplicate and audit failure cannot create a partial batch", async () => {
  const h = harness(); h.flags.duplicate = true; await assert.rejects(h.service.finalise("ec"), ConflictException);
  h.flags.duplicate = false; h.flags.auditFailure = true; await assert.rejects(h.service.finalise("ec"), /audit unavailable/);
  assert.equal(h.parents.length + h.results.length + h.sources.length + h.audits.length, 0);
});

test("automatic aggregate failure rolls back the Activities terminal source transaction", async () => {
  const h = harness(); h.flags.materialisationFailure = true;
  await assert.rejects(h.service.finalise("ec"), /aggregate failure/);
  assert.equal(h.parents.length + h.results.length + h.sources.length + h.audits.length, 0);
});
test("workspace exposes bounded previews and freshness, excludes source/audit authentication evidence, and writes no results", async () => {
  const h = harness(); const workspace: any = await h.service.workspace("ec");
  assert.equal(workspace.ready, true); assert.equal(workspace.preview[0].mark, "24.26");
  assert.equal(workspace.activities[0].isCurrent, true);
  assert.doesNotMatch(JSON.stringify(workspace), /markEvidenceId|permissionId|userRoleId|scopeJson|submissionFingerprint/);
  assert.equal(h.parents.length + h.results.length + h.sources.length + h.audits.length, 0);
  assert.deepEqual(h.calls, ["snapshot-transaction", "read-only", "scope-read", "authority-read", "sources"]);
  h.flags.duplicate = true; const final: any = await h.service.workspace("ec");
  assert.equal(final.ready, false); assert.equal(final.existingFinalisation.id, "existing");
});
test("POST recomputes sources after a previously ready workspace", async () => {
  const h = harness(); await h.service.workspace("ec"); h.scope.ready = false; h.scope.blockers.push({ code: "STALE_SUBMISSION" });
  await assert.rejects(h.service.finalise("ec"), ConflictException); assert.equal(h.parents.length, 0);
});
test("arithmetic/fingerprint mismatch is rejected independently", async () => {
  const h = harness(); h.scope.results[0]!.mark = "30.00";
  await assert.rejects(h.service.finalise("ec"), ConflictException);
});
for (const [code, databaseCode] of [["P2034", undefined], ["P2010", "40001"], ["P2010", "40P01"]])
  test(`bounded retries for ${code}/${databaseCode}`, async () => {
    let attempts = 0;
    const service = new FormativeActivitiesFinalisationService({ $transaction: async () => { attempts++;
      throw new Prisma.PrismaClientKnownRequestError("conflict", { code: code!, clientVersion: "6", meta: { code: databaseCode } });
    } } as never, {} as never, { authorize: async () => ({}) } as never, { reconcileInTransaction: async () => [] } as never);
    await assert.rejects(service.finalise("ec"), ConflictException); assert.equal(attempts, 3);
  });
