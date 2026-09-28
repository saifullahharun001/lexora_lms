import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClassSessionRepository } from "./prisma-class-session.repository";

function harness(status = "SCHEDULED") {
  const end = new Date("2026-09-27T10:00:00Z");
  const state = { now: end, assigned: true, auditFailure: false, guardFailure: false, evidence: [] as string[], audits: [] as any[],
    session: { id: "session", departmentId: "law", status, courseOfferingId: "offering", scheduledEndAt: end,
      actualStartAt: status === "ACTIVE" ? new Date(end.getTime() - 1000) : null,
      actualEndAt: null as Date | null, canceledAt: null, nonConductedAt: null } };
  const queries: string[] = [];
  const tx = {
    $queryRaw: async (sql: any) => { const query = sql.sql ?? sql[0]; queries.push(query);
      if (query.includes('AS "exists"')) {
        for (const table of ["attendance_records", "formative_attendance_source_items", "formative_attendance_corrections"]) assert.ok(query.includes(table));
        assert.deepEqual(sql.values, ["session", "session", "session"]);
        assert.ok(!query.includes("archived_at"));
        return [{ exists: state.evidence.length > 0 }];
      }
      if (query.includes("teacher_course_assignments")) {
        for (const predicate of ["a.status = 'ACTIVE'", "a.unassigned_at IS NULL", "a.assigned_at <= clock_timestamp()",
          "u.status = 'ACTIVE'", "u.archived_at IS NULL", "u.deleted_at IS NULL", "FOR SHARE OF a, u"]) assert.ok(query.includes(predicate));
        return state.assigned ? [{ id: "assignment" }] : [];
      }
      return query.includes("clock_timestamp() AS now") ? [{ now: state.now }] : [{ id: "session" }]; },
    classSession: { findFirst: async () => ({ ...state.session }), updateMany: async ({ where, data }: any) => {
      assert.equal(where.status, state.session.status); assert.equal(where.departmentId, "law");
      if (state.guardFailure) throw new Error("Historical locked class evidence cannot change");
      Object.assign(state.session, data); return { count: 1 };
    } },
    auditLog: { create: async ({ data }: any) => { if (state.auditFailure) throw new Error("audit unavailable"); state.audits.push(data); } }
  };
  const prisma = {
    $queryRaw: async () => [state.session], // Deliberately stale candidates exercise transactional recheck.
    $transaction: async (work: any) => {
      const session = { ...state.session }, audits = [...state.audits];
      try { return await work(tx); } catch (e) { state.session = session; state.audits = audits; throw e; }
    }
  };
  return { state, queries, repo: new PrismaClassSessionRepository(prisma as any) };
}

for (const status of ["SCHEDULED", "ACTIVE"]) test(`${status}: before end untouched, due transition has logical provenance and one audit`, async () => {
  const h = harness(status); h.state.now = new Date(h.state.now.getTime() - 1);
  assert.equal((await h.repo.reconcileDue()).processed, 0);
  assert.equal(h.state.session.status, status);
  h.state.now = new Date(h.state.session.scheduledEndAt.getTime() + 60_000);
  assert.equal((await h.repo.reconcileDue()).processed, 1);
  if (status === "ACTIVE") {
    assert.equal(h.state.session.status, "COMPLETED");
    assert.equal(h.state.session.actualEndAt, h.state.session.scheduledEndAt);
    assert.ok(h.state.session.actualStartAt);
  } else {
    assert.equal(h.state.session.status, "NOT_CONDUCTED");
    assert.equal(h.state.session.nonConductedAt, h.state.session.scheduledEndAt);
    assert.equal(h.state.session.actualStartAt, null); assert.equal(h.state.session.actualEndAt, null);
  }
  assert.equal((await h.repo.reconcileDue()).processed, 0); assert.equal(h.state.audits.length, 1);
  assert.equal(h.state.audits[0].actorType, "SERVICE"); assert.equal(h.state.audits[0].contextJson.automatic, true);
  assert.ok(h.queries[0]!.includes("FOR UPDATE OF o SKIP LOCKED"));
});

for (const evidence of ["raw record", "archived raw record", "source item without raw record", "correction overlay without raw record"]) {
  test(`never-started SCHEDULED with ${evidence} remains unchanged with no success audit`, async () => {
    const h = harness(); h.state.evidence = [evidence];
    const before = { ...h.state.session };
    for (let i = 0; i < 2; i++) {
      const result = await h.repo.reconcileDue();
      assert.equal(result.conflicts, 1); assert.equal(result.processed, 0);
      assert.deepEqual(h.state.session, before); assert.equal(h.state.audits.length, 0);
      assert.deepEqual(h.state.evidence, [evidence]);
    }
  });
}

for (const status of ["CANCELED", "NOT_CONDUCTED", "COMPLETED", "LOCKED", "ARCHIVED"]) test(`${status} is never reprocessed`, async () => {
  const h = harness(status); assert.equal((await h.repo.reconcileDue()).processed, 0); assert.equal(h.state.audits.length, 0);
});

test("corrupt ACTIVE evidence, historical guard conflicts and audit failures leave no success mutation", async () => {
  for (const problem of ["missing-start", "invalid-start", "audit", "historical-lock"]) {
    const h = harness("ACTIVE");
    if (problem === "missing-start") h.state.session.actualStartAt = null;
    if (problem === "invalid-start") h.state.session.actualStartAt = h.state.session.scheduledEndAt;
    h.state.auditFailure = problem === "audit"; h.state.guardFailure = problem === "historical-lock";
    assert.equal((await h.repo.reconcileDue()).conflicts, 1);
    assert.equal(h.state.session.status, "ACTIVE"); assert.equal(h.state.session.actualEndAt, null); assert.equal(h.state.audits.length, 0);
  }
});

for (const status of ["SCHEDULED", "ACTIVE"]) test(`${status} is due exactly at scheduledEndAt`, async () => {
  const h = harness(status); assert.equal((await h.repo.reconcileDue()).processed, 1);
});

test("manual mutation rechecks live Teacher authority and rolls back on required audit failure", async () => {
  const h = harness(); const build = async () => ({ data: { status: "ACTIVE" as const }, audit: {} as any });
  h.state.assigned = false;
  assert.equal(await h.repo.mutate("law", "session", "teacher", build), null);
  h.state.assigned = true; h.state.auditFailure = true;
  await assert.rejects(h.repo.mutate("law", "session", "teacher", build), /audit unavailable/);
  assert.equal(h.state.session.status, "SCHEDULED"); assert.equal(h.state.audits.length, 0);
});
