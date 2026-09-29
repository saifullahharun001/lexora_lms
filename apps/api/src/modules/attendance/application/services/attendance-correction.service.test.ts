import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PrincipalContext } from "@lexora/types";
import { AttendanceCorrectionService } from "./attendance-correction.service";
import { calculateAttendance } from "../../domain/formative-attendance.rules";

function harness() {
  const principal: PrincipalContext = { actorId: "actor", actorType: "user", isAuthenticated: true, activeDepartmentId: "law",
    roleAssignments: [{ departmentId: "law", role: "teacher", roleId: "role", userRoleId: "ur" }],
    permissions: [{ id: "permission", code: "attendance.record.correct_department", rolePermissionId: "rp",
      resource: "attendance.record", action: "correct", scope: "department", source: { departmentId: "law", roleId: "role", userRoleId: "ur" } }] };
  const scope = { departmentId: "law", courseOfferingId: "offering", enrollmentId: "enrollment", studentUserId: "student", studentBatchId: "batch", academicTermId: "term" };
  const session = { id: "session", departmentId: "law", courseOfferingId: "offering", status: "COMPLETED",
    actualStartAt: new Date("2026-01-01T10:00:00Z"), actualEndAt: new Date("2026-01-01T11:00:00Z"), canceledAt: null, attendanceEvidenceRevision: 10 };
  const record = { id: "raw", departmentId: "law", classSessionId: "session", enrollmentId: "enrollment", studentUserId: "student",
    status: "PRESENT", sourceType: "MANUAL", externalSourceRef: null, markedByUserId: "actor", overrideByUserId: null, overrideReason: null,
    markedAt: session.actualStartAt, updatedAt: session.actualStartAt, archivedAt: null, resolutionStatus: "RESOLVED", conflictEvidenceJson: null, attendanceEvidenceRevision: 20 };
  const state = { records: [record], corrections: [] as any[], audits: [] as any[], failAudit: false, queries: [] as any[],
    databaseError: null as Error | null, retries: 0, transactions: 0 };
  const tx: any = {
    $queryRaw: async (query: any) => { state.queries.push(query); if (state.databaseError) throw state.databaseError;
      if (state.retries-- > 0) throw new Prisma.PrismaClientKnownRequestError("serialization", { code: "P2034", clientVersion: "test" });
      return [{ scope }]; },
    attendanceRecord: { findMany: async () => state.records },
    formativeAttendanceCorrection: {
      findFirst: async () => state.corrections.at(-1),
      create: async ({ data }: any) => { const saved = { ...data, id: `c${data.revision}`, occurredAt: new Date(),
        previousEvidenceJson: { correctionId: state.corrections.at(-1)?.id ?? null } };
        state.corrections.push(saved); return saved; },
    },
    auditLog: { create: async ({ data }: any) => { if (state.failAudit) throw new Error("audit unavailable"); state.audits.push(data); } },
  };
  const prisma: any = { $transaction: async (work: any, options: any) => {
    state.transactions++; assert.equal(options.isolationLevel, "Serializable");
    const before = { corrections: [...state.corrections], audits: [...state.audits] };
    try { return await work(tx); } catch (error) { Object.assign(state, before); throw error; }
  } };
  const service = new AttendanceCorrectionService(prisma, { get: () => ({ principal, departmentId: "forged-header", audit: {} }) } as any,
    { read: async () => [session] } as any);
  const input = { classSessionId: "session", enrollmentId: "enrollment", status: "ABSENT", reason: " Evidence checked " } as const;
  return { service, state, principal, scope, session, record, input };
}
test("ordinary correction appends revisions without raw mutation or fake version/Coordinator, with transactional audit", async () => {
  const h = harness(); const raw = structuredClone(h.record);
  const first = await h.service.correct(h.input);
  const second = await h.service.correct({ ...h.input, status: "PRESENT" });
  assert.deepEqual(h.record, raw); assert.equal(first.revision, 1); assert.equal(second.revision, 2);
  assert.equal(first.status, "ABSENT"); assert.equal(first.reason, "Evidence checked");
  assert.equal(first.versionId, undefined); assert.equal(first.coordinatorAssignmentId, undefined);
  assert.equal(first.authorityKind, "ASSIGNED_TEACHER"); assert.equal((first.authorityJson as Prisma.JsonObject).userRoleId, "ur");
  assert.equal((second.previousEvidenceJson as Prisma.JsonObject).correctionId, first.id);
  assert.equal(h.state.audits.length, 2); assert.equal(h.state.audits[0].action, "attendance.record.corrected");
  assert.deepEqual(h.state.audits[0].contextJson.authority, first.authorityJson);
  assert.equal(h.state.queries[0].values[0], "law"); assert.ok(!h.state.queries[0].values.includes("forged-header"));
});
test("missing post-class raw evidence is recorded as missing and latest overlay feeds calculation", async () => {
  const h = harness(); h.state.records = [];
  const first = await h.service.correct(h.input);
  assert.deepEqual((first.originalEvidenceJson as Prisma.JsonObject).records, []);
  assert.equal(calculateAttendance(h.scope, [h.session], [], [first]).status, "READY");
  assert.equal(calculateAttendance(h.scope, [h.session], [], [first]).mark?.toNumber(), 0);
  const second = await h.service.correct({ ...h.input, status: "PRESENT" });
  assert.equal(calculateAttendance(h.scope, [h.session], [], [second]).mark?.toNumber(), 5);
  h.session.attendanceEvidenceRevision++;
  const stale = calculateAttendance(h.scope, [h.session], [], [second]);
  assert.equal(stale.status, "BLOCKED"); assert.equal(stale.diagnostics[0]?.code, "STALE_RECONCILIATION");
});
test("application rejects bad reasons, unsupported values, non-conducted sessions and malformed evidence", async () => {
  const h = harness();
  for (const reason of ["", " \t\n", "x".repeat(2001)])
    await assert.rejects(h.service.correct({ ...h.input, reason }), BadRequestException);
  for (const status of ["LATE", "EXCUSED"])
    await assert.rejects(h.service.correct({ ...h.input, status } as any), BadRequestException);
  for (const status of ["NOT_CONDUCTED", "SCHEDULED", "ACTIVE", "CANCELED"]) {
    h.session.status = status; await assert.rejects(h.service.correct(h.input), NotFoundException);
  }
  h.session.status = "COMPLETED"; h.record.studentUserId = "wrong";
  await assert.rejects(h.service.correct(h.input), ConflictException);
  assert.equal(h.state.corrections.length, 0);
});
test("audit failure rolls back the overlay; serialization retries re-read the scope and lineage", async () => {
  const h = harness(); h.state.failAudit = true;
  await assert.rejects(h.service.correct(h.input), /audit unavailable/);
  assert.equal(h.state.corrections.length, 0); assert.equal(h.state.audits.length, 0);
  h.state.failAudit = false; h.state.retries = 2;
  const result = await h.service.correct(h.input); assert.equal(result.revision, 1); assert.equal(h.state.transactions, 4);
  h.state.retries = 3; await assert.rejects(h.service.correct(h.input), ConflictException);
  assert.equal(h.state.corrections.length, 1);
});
for (const [code, error] of [["P0002", NotFoundException], ["42501", ForbiddenException], ["23514", ConflictException]] as const) {
  test(`database scope/authority/freeze rejection ${code} maps safely without mutation`, async () => {
    const h = harness(); h.state.databaseError = new Prisma.PrismaClientKnownRequestError("private details", { code: "P2010", clientVersion: "test", meta: { code } });
    await assert.rejects(h.service.correct(h.input), error); assert.equal(h.state.corrections.length, 0);
  });
}
test("no grant or mixed Student role fails before opening a transaction", async () => {
  const h = harness(); h.principal.roleAssignments.push({ role: "student", departmentId: "law", roleId: "student", userRoleId: "student" });
  await assert.rejects(h.service.correct(h.input), ForbiddenException); assert.equal(h.state.transactions, 0);
});
