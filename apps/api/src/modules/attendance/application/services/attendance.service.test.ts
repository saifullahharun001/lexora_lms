import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { AttendanceService } from "./attendance.service";

function harness() {
  const state = { role: "teacher", departmentId: "law", assigned: true, sessionState: "ACTIVE", legacy: null as string | null, writes: 0 };
  const input = { classSessionId: "session", enrollmentId: "enrollment", studentUserId: "student", status: "PRESENT", sourceType: "MANUAL" } as const;
  const service = new AttendanceService({
    saveAttendanceRecord: async (data: unknown) => { state.writes++; return { id: "record", ...(data as object) }; },
    findAttendanceRecordById: async () => ({ id: "record", status: state.legacy ?? "PRESENT", sourceType: "MANUAL" }),
    overrideAttendanceRecord: async () => { state.writes++; return { id: "record" }; },
  } as any, {
    classSession: { findFirst: async ({ where }: any) => where.departmentId === "law" && where.id === "session" ? { id: "session", departmentId: "law", courseOfferingId: "offering", status: state.sessionState } : null },
    enrollment: { findFirst: async ({ where }: any) => where.id === "enrollment" ? { id: "enrollment", departmentId: "law", courseOfferingId: "offering", studentUserId: "student" } : { id: "other", courseOfferingId: "different-offering", studentUserId: "student" } },
    teacherCourseAssignment: { findFirst: async () => state.assigned ? { id: "assignment" } : null },
    attendanceRecord: { findFirst: async () => state.legacy ? { status: state.legacy } : null },
    auditLog: { create: async () => ({}) },
  } as any, { get: () => ({ principal: { actorId: "teacher", activeDepartmentId: state.departmentId,
    roleAssignments: [{ departmentId: state.departmentId, role: state.role }] }, audit: {} }) } as any);
  return { service, state, input };
}

test("assigned Teacher capture still requires active session, matching offering/student and department", async () => {
  const h = harness();
  await h.service.captureAttendance(h.input); assert.equal(h.state.writes, 1);
  h.state.assigned = false; await assert.rejects(h.service.captureAttendance(h.input), ForbiddenException);
  h.state.assigned = true;
  for (const sessionState of ["SCHEDULED", "COMPLETED", "CANCELED", "LOCKED", "ARCHIVED"]) {
    h.state.sessionState = sessionState; await assert.rejects(h.service.captureAttendance(h.input), BadRequestException);
  }
  h.state.sessionState = "ACTIVE";
  await assert.rejects(h.service.captureAttendance({ ...h.input, enrollmentId: "other" }), BadRequestException);
  await assert.rejects(h.service.captureAttendance({ ...h.input, studentUserId: "another" }), BadRequestException);
  h.state.departmentId = "other"; await assert.rejects(h.service.captureAttendance(h.input), NotFoundException);
  h.state.departmentId = "law";
  for (const role of ["student", "department_admin"]) { h.state.role = role; await assert.rejects(h.service.captureAttendance(h.input), ForbiddenException); }
  assert.equal(h.state.writes, 1);
});

test("new legacy statuses are rejected and existing historical legacy rows cannot be silently rewritten", async () => {
  const h = harness();
  for (const status of ["LATE", "EXCUSED"] as const) {
    await assert.rejects(h.service.captureAttendance({ ...h.input, status }), BadRequestException);
    await assert.rejects(h.service.overrideAttendance("record", { status, overrideReason: "Reason" }), BadRequestException);
    h.state.legacy = status;
    await assert.rejects(h.service.captureAttendance(h.input), ConflictException);
    await assert.rejects(h.service.overrideAttendance("record", { status: "PRESENT", overrideReason: "Reason" }), ConflictException);
  }
  assert.equal(h.state.writes, 0);
});

test("current Present/Absent override retains mandatory reason", async () => {
  const h = harness();
  await assert.rejects(h.service.overrideAttendance("record", { status: "ABSENT", overrideReason: " " }), BadRequestException);
  await h.service.overrideAttendance("record", { status: "ABSENT", overrideReason: "Reconciled evidence" });
  assert.equal(h.state.writes, 1);
});
