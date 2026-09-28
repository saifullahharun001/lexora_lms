import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { ClassSessionService } from "./class-session.service";

const end = new Date("2026-09-27T10:00:00Z");
function harness() {
  const state = { departmentId: "law", assigned: true, activeTeacher: true, failAudit: false, audits: [] as any[],
    now: new Date(end.getTime() - 60_000), session: { id: "session", departmentId: "law", courseOfferingId: "offering",
      status: "SCHEDULED", scheduledStartAt: new Date(end.getTime() - 3_600_000), scheduledEndAt: end,
      actualStartAt: null as Date | null, actualEndAt: null as Date | null, nonConductedAt: null } };
  const visible = (dept: string, teacher: string) => dept === "law" && teacher === "teacher" && state.assigned && state.activeTeacher;
  const repository = {
    findById: async (dept: string, _id: string, teacher: string) => visible(dept, teacher) ? state.session : null,
    mutate: async (dept: string, _id: string, teacher: string, build: any) => {
      if (!visible(dept, teacher)) return null;
      const mutation = await build({ ...state.session }, state.now);
      if (state.failAudit) throw new Error("audit failed");
      Object.assign(state.session, mutation.data); state.audits.push(mutation.audit);
      return state.session;
    }
  };
  const service = new ClassSessionService(repository as any, {} as any, { get: () => ({ requestId: "request",
    principal: { actorId: "teacher", activeDepartmentId: state.departmentId, roleAssignments: [{ role: "teacher", departmentId: state.departmentId }] },
    audit: { ipAddress: "127.0.0.1" }, departmentId: "spoofed-header" }) } as any);
  return { state, service };
}

test("late Teacher start never moves the configured end; explicit early completion remains supported", async () => {
  const h = harness();
  await h.service.activate("session");
  assert.equal(h.state.session.actualStartAt, h.state.now);
  assert.equal(h.state.session.scheduledEndAt, end);
  h.state.now = new Date(end.getTime() - 30_000);
  await h.service.complete("session");
  assert.equal(h.state.session.actualEndAt, h.state.now);
  assert.equal(h.state.audits[1].requestId, "request");
  assert.equal(h.state.audits[1].departmentId, "law");
});

for (const offset of [0, 1]) test(`expired session mutations fail closed at boundary +${offset}`, async () => {
  const h = harness(); h.state.now = new Date(end.getTime() + offset);
  await assert.rejects(h.service.activate("session"), ConflictException);
  await assert.rejects(h.service.update("session", { scheduledEndAt: new Date(end.getTime() + 3_600_000) }), ConflictException);
  await assert.rejects(h.service.cancel("session"), ConflictException);
  h.state.session.status = "ACTIVE"; h.state.session.actualStartAt = h.state.session.scheduledStartAt;
  await assert.rejects(h.service.cancel("session"), ConflictException);
  await assert.rejects(h.service.update("session", { title: "Late update" }), ConflictException);
  await h.service.complete("session");
  assert.equal(h.state.session.actualEndAt, end);
  assert.equal(h.state.audits.length, 1);
});

test("pre-end rescheduling remains available; non-conducted cannot be activated", async () => {
  const h = harness(); const next = new Date(end.getTime() + 3_600_000);
  await h.service.update("session", { scheduledEndAt: next });
  assert.equal(h.state.session.scheduledEndAt, next);
  h.state.session.status = "NOT_CONDUCTED";
  await assert.rejects(h.service.activate("session"), BadRequestException);
});

for (const offset of [0, -1]) test(`pre-deadline reschedule cannot move the end to database now ${offset}`, async () => {
  const h = harness(); const before = { ...h.state.session };
  await assert.rejects(h.service.update("session", { scheduledEndAt: new Date(h.state.now.getTime() + offset) }), /future scheduled end/);
  assert.deepEqual(h.state.session, before); assert.equal(h.state.audits.length, 0);
});

test("wrong department and revoked/deactivated Teacher are safe-not-found on every request", async () => {
  const h = harness(); await h.service.getById("session");
  for (const mutation of [() => { h.state.departmentId = "other"; }, () => { h.state.assigned = false; }, () => { h.state.activeTeacher = false; }]) {
    h.state.departmentId = "law"; h.state.assigned = true; h.state.activeTeacher = true; mutation();
    await assert.rejects(h.service.getById("session"), NotFoundException);
    await assert.rejects(h.service.activate("session"), NotFoundException);
    await assert.rejects(h.service.update("session", { title: "Denied" }), NotFoundException);
  }
  assert.equal(h.state.audits.length, 0);
});

test("manual completion fails closed on corrupt start evidence and audit failure", async () => {
  const h = harness(); h.state.session.status = "ACTIVE";
  await assert.rejects(h.service.complete("session"), ConflictException);
  h.state.session.actualStartAt = h.state.session.scheduledStartAt;
  h.state.failAudit = true;
  await assert.rejects(h.service.complete("session"), /audit failed/);
  assert.equal(h.state.session.status, "ACTIVE");
});
