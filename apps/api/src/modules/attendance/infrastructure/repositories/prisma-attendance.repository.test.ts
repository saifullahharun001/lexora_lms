import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { PrismaAttendanceRepository } from "./prisma-attendance.repository";

function harness() {
  const state = { active: true, assigned: true, previous: null as any, saved: null as any, failAudit: false, audits: 0,
    enrollment: { id: "enrollment", departmentId: "law", courseOfferingId: "offering", studentUserId: "student",
      status: "APPROVED", archivedAt: null as Date | null, droppedAt: null as Date | null } };
  const tx: any = {
    $queryRaw: async (sql: any) => {
      if (sql.sql.includes("FROM enrollments e")) {
        for (const predicate of ["s.course_offering_id = e.course_offering_id", "s.department_id = e.department_id",
          "e.status = 'APPROVED'", "e.archived_at IS NULL", "e.dropped_at IS NULL", "FOR SHARE OF e"]) assert.ok(sql.sql.includes(predicate));
        assert.deepEqual(sql.values, ["enrollment", "law", "student", "session"]);
        const e = state.enrollment;
        return e.id === "enrollment" && e.departmentId === "law" && e.courseOfferingId === "offering" && e.studentUserId === "student" &&
          e.status === "APPROVED" && !e.archivedAt && !e.droppedAt ? [{ id: e.id }] : [];
      }
      return sql.sql.includes("teacher_course_assignments") ? state.assigned ? [{ id: "assignment" }] : [] :
        sql.sql.includes("FROM class_sessions WHERE") ? state.active ? [{ id: "session" }] : [] : [{ id: "offering" }];
    },
    attendanceRecord: {
      findUnique: async () => state.previous,
      findFirst: async () => state.previous,
      upsert: async ({ create }: any) => { state.saved = { ...create, id: "record" }; return state.saved; },
      update: async ({ data }: any) => { state.saved = { ...state.previous, ...data }; return state.saved; },
    },
    auditLog: { create: async () => { if (state.failAudit) throw new Error("audit failed"); state.audits++; } },
  };
  const prisma = { $transaction: async (work: (tx: any) => Promise<any>) => {
    const saved = state.saved, audits = state.audits;
    try { return await work(tx); } catch (error) { state.saved = saved; state.audits = audits; throw error; }
  } };
  const repo = new PrismaAttendanceRepository(prisma as any, { get: () => ({ audit: {}, requestId: "request" }) } as any);
  const input = { departmentId: "law", classSessionId: "session", enrollmentId: "enrollment", studentUserId: "student", markedByUserId: "teacher",
    status: "PRESENT", sourceType: "MANUAL" } as const;
  return { state, repo, input };
}
test("capture atomically rechecks ACTIVE session and current teacher assignment", async () => {
  const h = harness(); h.state.active = false;
  await assert.rejects(h.repo.saveAttendanceRecord(h.input), ConflictException);
  h.state.active = true; h.state.assigned = false;
  await assert.rejects(h.repo.saveAttendanceRecord(h.input), ForbiddenException);
  assert.equal(h.state.saved, null);
});
for (const [name, change] of [
  ["pending", { status: "PENDING" }], ["rejected", { status: "REJECTED" }], ["waitlisted", { status: "WAITLISTED" }],
  ["withdrawn", { status: "WITHDRAWN" }], ["dropped", { droppedAt: new Date() }], ["archived", { archivedAt: new Date() }],
  ["DROPPED status", { status: "DROPPED" }], ["ARCHIVED status", { status: "ARCHIVED" }],
  ["wrong student", { studentUserId: "other" }], ["wrong offering", { courseOfferingId: "other" }], ["wrong department", { departmentId: "other" }],
] as const) {
  test(`capture rejects ${name} enrollment at transaction time`, async () => {
    const h = harness(); Object.assign(h.state.enrollment, change);
    await assert.rejects(h.repo.saveAttendanceRecord(h.input), BadRequestException);
    assert.equal(h.state.saved, null); assert.equal(h.state.audits, 0);
  });
}
test("approved current enrollment permits later PRESENT capture and keeps the server capture timestamp", async () => {
  const h = harness(); const before = Date.now();
  const saved = await h.repo.saveAttendanceRecord(h.input);
  assert.equal(saved.status, "PRESENT"); assert.ok(saved.markedAt.getTime() >= before); assert.equal(h.state.audits, 1);
});
test("conflicting biometric/manual evidence remains blocked and retains the earlier capture", async () => {
  const h = harness(); h.state.previous = { id: "record", status: "ABSENT", sourceType: "BIOMETRIC", markedByUserId: "teacher",
    markedAt: new Date(), resolutionStatus: "RESOLVED", conflictEvidenceJson: null };
  await h.repo.saveAttendanceRecord(h.input);
  assert.equal(h.state.saved.resolutionStatus, "CONFLICT");
  assert.equal(h.state.saved.conflictEvidenceJson.previous.status, "ABSENT");
  assert.equal(h.state.saved.conflictEvidenceJson.incoming.status, "PRESENT");
});
test("capture audit failure rolls back the attendance write", async () => {
  const h = harness(); h.state.failAudit = true;
  await assert.rejects(h.repo.saveAttendanceRecord(h.input), /audit failed/); assert.equal(h.state.saved, null);
});
test("ordinary override is ACTIVE-only and remains pending Coordinator reconciliation", async () => {
  const h = harness(); h.state.previous = { id: "record", classSessionId: "session", status: "PRESENT", sourceType: "MANUAL", markedAt: new Date(), conflictEvidenceJson: null };
  const input = { status: "ABSENT", sourceType: "MANUAL", overrideByUserId: "admin", overrideReason: "Register discrepancy" } as const;
  h.state.active = false; await assert.rejects(h.repo.overrideAttendanceRecord("law", "record", input), ConflictException);
  h.state.active = true; await h.repo.overrideAttendanceRecord("law", "record", input);
  assert.equal(h.state.saved.resolutionStatus, "PENDING_REVIEW"); assert.equal(h.state.audits, 1);
});
