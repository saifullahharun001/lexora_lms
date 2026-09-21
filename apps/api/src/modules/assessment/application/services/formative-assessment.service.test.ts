import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PrincipalContext } from "@lexora/types";
import { AuthorizationService } from "@/modules/authorization/services/authorization.service";
import { FormativeAssessmentService } from "./formative-assessment.service";

const scope = { departmentId: "law", courseOfferingId: "offering" };
const at = new Date("2026-09-01T00:00:00Z");
const activityInput = { title: "Class test", method: "CLASS_TEST", rawMaximum: "100", assignedWeight: "30" };
const markInput = { rawMark: "80", feedback: "Address the contrary authority.", feedbackCompleted: true, integrityStatus: "CLEAR" as const };

function harness() {
  const principal: PrincipalContext = {
    actorId: "teacher", actorType: "user", isAuthenticated: true, activeDepartmentId: "law",
    roleAssignments: [{ departmentId: "law", role: "teacher", userRoleId: "ur", roleId: "role" }], permissions: [],
  };
  const state = { activities: [] as any[], marks: [] as any[], submissions: [] as any[], items: [] as any[], audits: [] as any[] };
  const flags = { assigned: true, roleActive: true, auditFailure: false, databaseAdjustmentGrant: true, standardTemplate: true };
  const queries: Prisma.Sql[] = [];
  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]) => value === undefined || row[key] === value);
  let sequence = 0;
  const tx: any = {
    $queryRaw: async (sql: Prisma.Sql) => {
      queries.push(sql);
      const text = sql.strings.join("?");
      if (text.includes("JOIN curriculum_courses")) return flags.standardTemplate ? Object.entries({ FORMATIVE_ACTIVITIES: 30, ATTENDANCE: 5, COMPREHENSIVE_EXAMINATION: 5, SUMMATIVE_EXAMINATION: 60 }).map(([code, max]) => ({ templateId: "template", templateVersion: 1, componentId: code, code, maximumMarks: new Prisma.Decimal(max), totalMarks: new Prisma.Decimal(100), isRequired: true })) : [];
      if (text.includes("FROM course_offerings")) return sql.values[0] === "offering" && sql.values[1] === "law" ? [{ id: "offering" }] : [];
      if (text.includes("FROM teacher_course_assignments")) return flags.assigned && flags.roleActive ? [{ id: "assignment", assignedAt: at }] : [];
      if (text.includes("FROM enrollments")) return sql.values[0] === "enrollment" && sql.values[1] === "law" && sql.values[2] === "offering" ? [{ id: "enrollment" }] : [];
      if (text.includes("FROM permissions")) return flags.databaseAdjustmentGrant ? [{ id: "permission" }] : [];
      throw new Error("Unexpected query");
    },
    formativeActivity: {
      create: async ({ data }: any) => { const row = { id: `activity-${++sequence}`, status: "DRAFT", version: 1, ...data }; state.activities.push(row); return row; },
      findFirst: async ({ where }: any) => state.activities.find((row) => matches(row, where)) ?? null,
      findMany: async ({ where, include }: any) => state.activities.filter((row) => matches(row, where)).map((row) => ({ ...row,
        ...(include ? { marks: state.marks.filter((mark) => mark.activityId === row.id && matches(mark, include.marks.where)).sort((a, b) => b.revision - a.revision).slice(0, 1) } : {}),
      })),
      update: async ({ where, data }: any) => {
        const index = state.activities.findIndex((row) => row.id === where.id);
        const row = { ...state.activities[index], ...data, version: state.activities[index].version + 1 };
        state.activities[index] = row; return row;
      },
    },
    formativeMarkEvidence: {
      findFirst: async ({ where }: any) => state.marks.filter((row) => matches(row, where)).sort((a, b) => b.revision - a.revision)[0] ?? null,
      findMany: async ({ where }: any) => state.marks.filter((row) => matches(row, where)),
      create: async ({ data }: any) => { const row = { id: `mark-${++sequence}`, ...data }; state.marks.push(row); return row; },
    },
    formativeTeacherSubmission: {
      findFirst: async ({ where }: any) => state.submissions.find((row) => matches(row, where)) ?? null,
      create: async ({ data }: any) => { const row = { id: `submission-${++sequence}`, version: 1, status: "MARKS_SUBMITTED", submittedAt: at, ...data }; state.submissions.push(row); return row; },
    },
    formativeSubmissionItem: { createMany: async ({ data }: any) => { state.items.push(...data); return { count: data.length }; } },
    auditLog: { create: async ({ data }: any) => { if (flags.auditFailure) throw new Error("audit unavailable"); state.audits.push(data); return data; } },
  };
  const prisma = { $transaction: async (work: (tx: any) => Promise<unknown>, options: any) => {
    assert.equal(options.isolationLevel, "Serializable");
    const before = Object.fromEntries(Object.entries(state).map(([key, value]) => [key, [...value]]));
    try { return await work(tx); } catch (error) { Object.assign(state, before); throw error; }
  } };
  const service = new FormativeAssessmentService(prisma as any,
    { get: () => ({ principal, department: { departmentId: "forged-header-department" }, requestId: "request", audit: {} }) } as any,
    new AuthorizationService());
  const grantAdjustment = () => principal.permissions.push({ resource: "formative.mark", action: "adjust", scope: "department",
    source: { departmentId: "law", userRoleId: "ur", roleId: "role" } });
  const ready = async () => {
    const activity = await service.createActivity("offering", activityInput);
    await service.startMarking("offering", activity.id);
    await service.saveMark("offering", activity.id, "enrollment", markInput);
    return activity;
  };
  return { service, state, flags, principal, queries, grantAdjustment, ready };
}

test("assigned Teacher submits server-derived /30 with exact immutable source and assignment provenance", async () => {
  const h = harness(); const activity = await h.ready();
  const result = await h.service.submit("offering", "enrollment");
  assert.equal(result.status, "MARKS_SUBMITTED");
  assert.equal(result.totalWeightedMark.toFixed(2), "24.00");
  assert.equal(result.totalWeight.toFixed(2), "30.00");
  assert.equal(result.teacherAssignmentId, "assignment");
  assert.equal(result.assignmentAssignedAt, at);
  assert.equal(result.actorUserId, "teacher");
  assert.equal(result.ruleVersionCode, "FORMATIVE_ACTIVITIES_30_HALF_UP_2DP_V1");
  assert.deepEqual(h.state.items[0], { ...scope, enrollmentId: "enrollment", activityId: activity.id,
    submissionId: result.id, markEvidenceId: h.state.marks[0].id });
  assert.equal((result.sourceSnapshotJson as any).activities[0].markRevision, 1);
  assert.equal((result.sourceSnapshotJson as any).configuration.templateId, "template");
  assert.equal(h.state.audits.at(-1).action, "formative.activities.teacher-submitted");
  assert.ok(h.queries.some((sql) => sql.strings.join("").includes("FOR SHARE OF a, u, d, ur, r")));
});

test("unauthenticated, wrong-role, same-role cross-department and revoked/unassigned Teachers cannot mutate", async () => {
  for (const change of [
    (h: ReturnType<typeof harness>) => { h.principal.isAuthenticated = false; },
    (h: ReturnType<typeof harness>) => { h.principal.roleAssignments[0]!.role = "student"; },
    (h: ReturnType<typeof harness>) => { h.principal.roleAssignments[0]!.role = "department_admin"; },
    (h: ReturnType<typeof harness>) => { h.principal.roleAssignments[0]!.departmentId = "other"; },
    (h: ReturnType<typeof harness>) => { h.principal.activeDepartmentId = "other"; h.principal.roleAssignments[0]!.departmentId = "other"; },
    (h: ReturnType<typeof harness>) => { h.flags.assigned = false; },
    (h: ReturnType<typeof harness>) => { h.flags.roleActive = false; },
  ]) {
    const h = harness(); change(h);
    await assert.rejects(h.service.createActivity("offering", activityInput), (error: any) => [403, 404].includes(error.getStatus()));
    assert.equal(h.state.activities.length, 0);
  }
});

test("forged header never overrides principal; direct offering/activity/enrollment IDs remain scoped", async () => {
  const h = harness(); const activity = await h.ready();
  assert.equal(activity.departmentId, "law");
  await assert.rejects(h.service.listActivities("other-offering"), NotFoundException);
  await assert.rejects(h.service.saveMark("offering", "outside-activity", "enrollment", markInput), NotFoundException);
  await assert.rejects(h.service.saveMark("offering", activity.id, "outside-enrollment", markInput), NotFoundException);
  await assert.rejects(h.service.read("offering", "outside-enrollment"), NotFoundException);
});

test("draft lifecycle, positive maxima, mark bounds and server arithmetic", async () => {
  const h = harness();
  await assert.rejects(h.service.createActivity("offering", { ...activityInput, rawMaximum: "0" }), BadRequestException);
  await assert.rejects(h.service.createActivity("offering", { ...activityInput, assignedWeight: "30.01" }), BadRequestException);
  const activity = await h.service.createActivity("offering", activityInput);
  await h.service.updateActivity("offering", activity.id, { ...activityInput, title: "Revised test" });
  await assert.rejects(h.service.saveMark("offering", activity.id, "enrollment", markInput), ConflictException);
  await h.service.startMarking("offering", activity.id);
  await assert.rejects(h.service.startMarking("offering", activity.id), ConflictException);
  await assert.rejects(h.service.updateActivity("offering", activity.id, activityInput), ConflictException);
  for (const rawMark of ["-1", "100.01", "NaN", "1.001"]) {
    await assert.rejects(h.service.saveMark("offering", activity.id, "enrollment", { ...markInput, rawMark }), BadRequestException);
  }
  const mark = await h.service.saveMark("offering", activity.id, "enrollment", { ...markInput, weightedMark: "30" } as any);
  assert.equal(mark.weightedMark!.toFixed(2), "24.00");
});

test("all activities must have marks, exact weight 30, completed feedback and clear integrity", async () => {
  for (const change of [
    (h: ReturnType<typeof harness>) => { h.state.marks = []; },
    (h: ReturnType<typeof harness>) => { h.state.marks[0].rawMark = null; },
    (h: ReturnType<typeof harness>) => { h.state.marks[0].feedbackCompleted = false; },
    (h: ReturnType<typeof harness>) => { h.state.marks[0].feedback = " "; },
    (h: ReturnType<typeof harness>) => { h.state.marks[0].integrityStatus = "PENDING_REVIEW"; },
    (h: ReturnType<typeof harness>) => { h.state.marks[0].integrityStatus = "BLOCKED"; },
    (h: ReturnType<typeof harness>) => { h.state.activities[0].assignedWeight = new Prisma.Decimal(29); },
    (h: ReturnType<typeof harness>) => { h.state.activities.push({ ...h.state.activities[0], id: "missing-activity" }); },
  ]) {
    const h = harness(); await h.ready(); change(h);
    await assert.rejects(h.service.submit("offering", "enrollment"), BadRequestException);
    assert.equal(h.state.submissions.length, 0);
  }
});

test("raw revisions require exact adjustment grant and reason, retain previous/revised evidence", async () => {
  const h = harness(); const activity = await h.ready();
  const revised = { ...markInput, rawMark: "90", reason: "Corrected transcription against script" };
  await assert.rejects(h.service.saveMark("offering", activity.id, "enrollment", revised), ForbiddenException);
  await assert.rejects(h.service.adjustMark("offering", activity.id, "enrollment", revised), ForbiddenException);
  h.grantAdjustment();
  assert.throws(() => h.service.adjustMark("offering", activity.id, "enrollment", { ...revised, reason: " " }), BadRequestException);
  h.flags.databaseAdjustmentGrant = false;
  await assert.rejects(h.service.adjustMark("offering", activity.id, "enrollment", revised), ForbiddenException);
  h.flags.databaseAdjustmentGrant = true;
  const before = h.state.marks[0];
  const after = await h.service.adjustMark("offering", activity.id, "enrollment", revised);
  assert.equal(after.previousId, before.id);
  assert.equal(before.rawMark.toString(), "80");
  assert.equal(after.rawMark!.toString(), "90");
  assert.equal(after.weightedMark!.toString(), "27");
  assert.equal(after.revision, 2);
  assert.equal(after.reason, revised.reason);
  assert.equal(h.state.audits.at(-1).action, "formative.mark.adjusted");
});

test("submission rejects duplicates and blocks ordinary marks, adjustments and offering configuration", async () => {
  const h = harness(); const activity = await h.ready(); h.grantAdjustment();
  await h.service.submit("offering", "enrollment");
  await assert.rejects(h.service.submit("offering", "enrollment"), ConflictException);
  await assert.rejects(h.service.saveMark("offering", activity.id, "enrollment", markInput), ConflictException);
  await assert.rejects(h.service.adjustMark("offering", activity.id, "enrollment", { ...markInput, reason: "Correction" }), ConflictException);
  await assert.rejects(h.service.createActivity("offering", activityInput), ConflictException);
  await assert.rejects(h.service.updateActivity("offering", activity.id, activityInput), ConflictException);
  assert.equal(h.state.submissions.length, 1);
});

test("neither Teacher editing nor an exact mark-adjustment grant can clear a recorded integrity case", async () => {
  for (const integrityStatus of ["PENDING_REVIEW", "BLOCKED"] as const) {
    const h = harness(); const activity = await h.ready(); h.grantAdjustment();
    await h.service.saveMark("offering", activity.id, "enrollment", { ...markInput, integrityStatus });
    await assert.rejects(h.service.saveMark("offering", activity.id, "enrollment", markInput), ForbiddenException);
    await assert.rejects(h.service.adjustMark("offering", activity.id, "enrollment", { ...markInput, reason: "Cannot authorise integrity resolution" }), ForbiddenException);
    assert.equal(h.state.marks.at(-1).integrityStatus, integrityStatus);
    assert.equal(h.state.marks.length, 2);
  }
});

test("audit failure rolls back activity, mark revision and submission together with their evidence", async () => {
  const h = harness(); h.flags.auditFailure = true;
  await assert.rejects(h.service.createActivity("offering", activityInput), /audit unavailable/);
  assert.equal(h.state.activities.length, 0);
  h.flags.auditFailure = false; const activity = await h.ready(); h.grantAdjustment();
  h.flags.auditFailure = true;
  await assert.rejects(h.service.adjustMark("offering", activity.id, "enrollment", { ...markInput, rawMark: "90", reason: "Correction" }), /audit unavailable/);
  assert.equal(h.state.marks.length, 1);
  await assert.rejects(h.service.submit("offering", "enrollment"), /audit unavailable/);
  assert.equal(h.state.submissions.length, 0);
  assert.equal(h.state.items.length, 0);
});
