import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { AuthorizationService } from "@/modules/authorization/services/authorization.service";
import { FormativeAttendanceService } from "./formative-attendance.service";

function harness() {
  const start = new Date("2026-09-01T09:00:00Z"), end = new Date("2026-09-01T10:00:00Z");
  const scope = { departmentId: "law", courseOfferingId: "offering", enrollmentId: "enrollment", studentUserId: "student",
    studentBatchId: "batch", academicTermId: "term", actorUserId: "coordinator", coordinatorAssignmentId: "assignment", configurationJson: {} };
  const session = { id: "session", departmentId: "law", courseOfferingId: "offering", status: "COMPLETED", actualStartAt: start, actualEndAt: end, canceledAt: null };
  const record = { id: "record", departmentId: "law", classSessionId: "session", enrollmentId: "enrollment", studentUserId: "student",
    status: "PRESENT", sourceType: "MANUAL", externalSourceRef: null, markedByUserId: "teacher", overrideByUserId: null,
    overrideReason: null, markedAt: start, updatedAt: start, archivedAt: null, resolutionStatus: "RESOLVED", conflictEvidenceJson: null };
  const principal = { actorId: "coordinator", actorType: "user", isAuthenticated: true, activeDepartmentId: "law",
    roleAssignments: [{ departmentId: "law", role: "teacher", roleId: "role", userRoleId: "ur" }], permissions: [] };
  const state = { versions: [] as any[], corrections: [] as any[], audits: [] as any[], records: [record] as any[],
    sessions: [session] as any[], assigned: true, failAudit: false, assignmentChecks: 0 };
  let sequence = 0;
  const tx: any = {
    attendanceRecord: { findMany: async () => state.records },
    formativeAttendanceVersion: {
      findMany: async () => [...state.versions].reverse(),
      findFirst: async () => state.versions.at(-1) ?? null,
      create: async ({ data }: any) => {
        const version = { ...data, id: `v${++sequence}`, calculatedAt: new Date(), transitions: [], items: [] };
        state.versions.push(version); return version;
      },
    },
    formativeAttendanceSourceItem: { createMany: async ({ data }: any) => {
      for (const item of data) state.versions.find((v) => v.id === item.versionId).items.push({ ...item, id: `item${++sequence}` });
      return { count: data.length };
    } },
    formativeAttendanceTransition: { create: async ({ data }: any) => {
      const event = { ...data, id: `event${++sequence}`, occurredAt: new Date() };
      state.versions.find((v) => v.id === data.versionId).transitions.push(event); return event;
    } },
    formativeAttendanceCorrection: {
      findMany: async () => [...state.corrections].reverse(), findFirst: async () => state.corrections.at(-1) ?? null,
      create: async ({ data }: any) => { const c = { ...data, id: `c${++sequence}` }; state.corrections.push(c); return c; },
    },
    auditLog: { create: async ({ data }: any) => { if (state.failAudit) throw new Error("audit unavailable"); state.audits.push(data); return data; } },
  };
  // Models transaction ordering/rollback for unit tests; PostgreSQL tests independently exercise real constraints.
  let queue = Promise.resolve();
  const prisma = { $transaction: (work: (tx: any) => Promise<any>) => {
    const operation = queue.then(async () => {
      const versions = state.versions.map((v) => ({ ...v, transitions: [...v.transitions] }));
      const corrections = [...state.corrections], audits = [...state.audits];
      try { return await work(tx); } catch (error) { state.versions = versions; state.corrections = corrections; state.audits = audits; throw error; }
    });
    queue = operation.then(() => undefined, () => undefined); return operation;
  } };
  const academic = { lock: async (_tx: any, department: string, actor: string, offering: string, enrollment: string) => {
    state.assignmentChecks++;
    if (!state.assigned || department !== scope.departmentId || actor !== scope.actorUserId || offering !== scope.courseOfferingId || enrollment !== scope.enrollmentId)
      throw new NotFoundException("Attendance scope not found");
    return scope;
  } };
  const service = new FormativeAttendanceService(prisma as any, { get: () => ({ principal, departmentId: "forged-header", audit: {} }) } as any,
    new AuthorizationService(), academic as any, { read: async () => state.sessions } as any);
  const calculate = () => service.calculateVersion("offering", "enrollment");
  const transition = (id: string, action: "VERIFIED" | "FINALISED" | "LOCKED") => service.transition("offering", "enrollment", id, action);
  const locked = async () => { const v = await calculate(); for (const state of ["VERIFIED", "FINALISED", "LOCKED"] as const) await transition(v.id, state); return v.id; };
  return { service, state, principal, scope, calculate, transition, locked };
}

test("server calculation, verification, finalisation, locking and repeated final/lock are audited and idempotent", async () => {
  const h = harness(), first = await h.calculate();
  assert.equal(first.mark?.toString(), "5"); assert.equal(first.workflowState, "READY");
  assert.equal((await h.calculate()).id, first.id);
  for (const state of ["VERIFIED", "FINALISED", "LOCKED"] as const) {
    assert.equal((await h.transition(first.id, state)).workflowState, state);
    await h.transition(first.id, state);
  }
  assert.equal(h.state.versions.length, 1); assert.equal(h.state.audits.length, 4);
  assert.ok(h.state.assignmentChecks >= 8);
  await assert.rejects(h.calculate(), ConflictException);
  await assert.rejects(h.service.correct("offering", "enrollment", first.id, "session", { status: "ABSENT", reason: "Correction" }), ConflictException);
});

for (const transition of ["VERIFIED", "FINALISED", "LOCKED"] as const) {
  test(`${transition} fails closed with actionable unresolved evidence diagnostics`, async () => {
    const h = harness(); const v = await h.calculate(); h.state.records = [];
    await assert.rejects(h.transition(v.id, transition), (error: any) => {
      assert.equal(error.getResponse().code, "ATTENDANCE_BLOCKED");
      assert.equal(error.getResponse().diagnostics[0].classSessionId, "session");
      assert.equal(error.getResponse().diagnostics[0].enrollmentId, "enrollment"); return true;
    });
    assert.equal(h.state.audits.length, 1);
  });
}
test("missing evidence creates a durable BLOCKED version with no percentage or mark", async () => {
  const h = harness(); h.state.records = [];
  const result = await h.calculate(); assert.equal(result.workflowState, "BLOCKED"); assert.equal(result.mark, null);
  assert.equal(result.items[0]?.status, null); assert.equal((result.diagnosticsJson as any)[0].code, "MISSING_ATTENDANCE_EVIDENCE");
});
test("changed evidence cannot be silently locked; changed class is identified and recalculation resets verification", async () => {
  const h = harness(); const v = await h.calculate(); await h.transition(v.id, "VERIFIED"); await h.transition(v.id, "FINALISED");
  h.state.records[0].status = "ABSENT";
  await assert.rejects(h.transition(v.id, "LOCKED"), (error: any) => {
    assert.equal(error.getResponse().code, "STALE_ATTENDANCE_EVIDENCE");
    assert.deepEqual(error.getResponse().diagnostics[0].classSessionIds, ["session"]); return true;
  });
  const next = await h.calculate(); assert.equal(next.workflowState, "READY"); assert.equal(next.previousId, v.id);
  await assert.rejects(h.transition(next.id, "LOCKED"), ConflictException);
});
test("reopening and correction preserve the old locked source and relock a new version", async () => {
  const h = harness(); const id = await h.locked();
  const before = JSON.stringify(h.state.versions[0].items);
  assert.throws(() => h.service.reopen("offering", "enrollment", id, "  "), BadRequestException);
  const reopened = await h.service.reopen("offering", "enrollment", id, "Reconcile attendance evidence");
  assert.equal(reopened.previousId, id); assert.equal(reopened.workflowState, "READY");
  const corrected = await h.service.correct("offering", "enrollment", reopened.id, "session", { status: "ABSENT", reason: "Signed register confirms absence" });
  assert.equal(corrected.mark?.toString(), "0"); assert.equal(corrected.previousId, reopened.id);
  for (const state of ["VERIFIED", "FINALISED", "LOCKED"] as const) await h.transition(corrected.id, state);
  assert.equal(JSON.stringify(h.state.versions[0].items), before);
  assert.equal(h.state.records[0].status, "PRESENT"); assert.equal(h.state.corrections.length, 1);
  assert.ok(h.state.versions[0].transitions.some((t: any) => t.state === "LOCKED"));
  assert.ok(h.state.versions[0].transitions.some((t: any) => t.state === "REOPENED"));
});
for (const status of ["SCHEDULED", "ACTIVE"]) {
  test(`${status} keeps the period open for finalise/lock but permits preview, calculation and verification`, async () => {
    const h = harness();
    h.state.sessions.push({ ...h.state.sessions[0], id: "open", status, actualEndAt: null });
    assert.equal((await h.service.read("offering", "enrollment")).preview.status, "READY");
    const v = await h.calculate(); await h.transition(v.id, "VERIFIED");
    for (const action of ["FINALISED", "LOCKED"] as const) {
      await assert.rejects(h.transition(v.id, action), (error: any) => {
        assert.equal(error.getResponse().code, "ATTENDANCE_PERIOD_OPEN");
        assert.deepEqual(error.getResponse().diagnostics[0].classSessionIds, ["open"]); return true;
      });
    }
    h.state.sessions[1].status = "COMPLETED";
    h.state.sessions[1].actualEndAt = h.state.sessions[0].actualEndAt;
    h.state.records.push({ ...h.state.records[0], id: "second-record", classSessionId: "open" });
    await assert.rejects(h.transition(v.id, "FINALISED"), (error: any) => error.getResponse().code === "STALE_ATTENDANCE_EVIDENCE");
    const next = await h.calculate(); assert.equal(next.previousId, v.id);
    await assert.rejects(h.transition(next.id, "FINALISED"), ConflictException);
    for (const action of ["VERIFIED", "FINALISED", "LOCKED"] as const) await h.transition(next.id, action);
  });
  test(`canceling the remaining ${status} session permits finalisation and lock`, async () => {
    const h = harness();
    h.state.sessions.push({ ...h.state.sessions[0], id: "canceled", status, actualEndAt: null, canceledAt: new Date() });
    const id = await h.locked(); assert.ok(id);
  });
}
test("database source revisions invalidate a correction even when visible status is unchanged", async () => {
  const h = harness(); h.state.records[0].attendanceEvidenceRevision = 1;
  const first = await h.calculate();
  const corrected = await h.service.correct("offering", "enrollment", first.id, "session", { status: "ABSENT", reason: "Signed register" });
  h.state.records[0].attendanceEvidenceRevision = 2;
  const result = await h.service.read("offering", "enrollment");
  assert.equal(result.preview.status, "BLOCKED"); assert.equal(result.preview.diagnostics[0]?.code, "STALE_RECONCILIATION");
  await assert.rejects(h.transition(corrected.id, "VERIFIED"), ConflictException);
});
test("a newly open session also blocks locking an already finalised version", async () => {
  const h = harness(), v = await h.calculate();
  await h.transition(v.id, "VERIFIED"); await h.transition(v.id, "FINALISED");
  h.state.sessions.push({ ...h.state.sessions[0], id: "open", status: "ACTIVE", actualEndAt: null });
  await assert.rejects(h.transition(v.id, "LOCKED"), (error: any) => error.getResponse().code === "ATTENDANCE_PERIOD_OPEN");
});

test("correction rejects EXCUSED/LATE and cannot operate on another offering/session", async () => {
  const h = harness(), v = await h.calculate();
  for (const status of ["EXCUSED", "LATE"]) assert.throws(() => h.service.correct("offering", "enrollment", v.id, "session", { status, reason: "Reason" }), BadRequestException);
  await assert.rejects(h.service.correct("offering", "enrollment", v.id, "other", { status: "PRESENT", reason: "Reason" }), NotFoundException);
  await assert.rejects(h.service.read("other", "enrollment"), NotFoundException);
});
test("authority is revalidated for every transition; admin/teacher labels do not imply assignment", async () => {
  const h = harness(), v = await h.calculate(); h.state.assigned = false;
  for (const role of ["teacher", "department_admin"]) {
    h.principal.roleAssignments[0]!.role = role;
    await assert.rejects(h.transition(v.id, "VERIFIED"), NotFoundException);
    await assert.rejects(h.service.read("offering", "enrollment"), NotFoundException);
  }
  h.state.assigned = true; h.principal.roleAssignments[0]!.role = "student";
  await assert.rejects(h.calculate(), ForbiddenException);
  h.principal.roleAssignments[0]!.role = "teacher"; h.principal.activeDepartmentId = "other";
  await assert.rejects(h.calculate(), ForbiddenException);
});
test("audit failure rolls back calculation, transition, reopen and correction as one transaction", async () => {
  const h = harness(); h.state.failAudit = true;
  await assert.rejects(h.calculate(), /audit unavailable/); assert.equal(h.state.versions.length, 0);
  h.state.failAudit = false; const id = await h.locked(); h.state.failAudit = true;
  await assert.rejects(h.service.reopen("offering", "enrollment", id, "Reason"), /audit unavailable/);
  assert.equal(h.state.versions.length, 1); assert.equal(h.state.versions[0].transitions.length, 3);
  h.state.failAudit = false; const next = await h.service.reopen("offering", "enrollment", id, "Reason"); h.state.failAudit = true;
  await assert.rejects(h.service.correct("offering", "enrollment", next.id, "session", { status: "ABSENT", reason: "Reason" }), /audit unavailable/);
  assert.equal(h.state.corrections.length, 0); assert.equal(h.state.versions.length, 2);
  await assert.rejects(h.transition(next.id, "VERIFIED"), /audit unavailable/); assert.equal(h.state.versions[1].transitions.length, 0);
});
test("ordered concurrent duplicate locks and reopen requests leave one current successor", async () => {
  const h = harness(), v = await h.calculate(); await h.transition(v.id, "VERIFIED"); await h.transition(v.id, "FINALISED");
  await Promise.all([h.transition(v.id, "LOCKED"), h.transition(v.id, "LOCKED")]);
  assert.equal(h.state.versions[0].transitions.filter((t: any) => t.state === "LOCKED").length, 1);
  const results = await Promise.allSettled([h.service.reopen("offering", "enrollment", v.id, "Reason"), h.service.reopen("offering", "enrollment", v.id, "Reason")]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1); assert.equal(h.state.versions.length, 2);
});
