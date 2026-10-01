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
  const state = { activities: [] as any[], marks: [] as any[], legacySubmissions: [] as any[], enrollments: [{ id: "enrollment", ...scope }], submissions: [] as any[], items: [] as any[], audits: [] as any[] };
  const flags = { assigned: true, roleActive: true, auditFailure: false, databaseAdjustmentGrant: true, standardTemplate: true };
  const queries: Prisma.Sql[] = [];
  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]) => value === undefined ||
    (value && typeof value === "object" && "in" in value ? (value as any).in.includes(row[key]) : row[key] === value));
  let sequence = 0;
  const tx: any = {
    $queryRaw: async (sql: Prisma.Sql) => {
      queries.push(sql);
      const text = sql.strings.join("?");
      if (text.includes("JOIN curriculum_courses")) return flags.standardTemplate ? Object.entries({ FORMATIVE_ACTIVITIES: 30, ATTENDANCE: 5, COMPREHENSIVE_EXAMINATION: 5, SUMMATIVE_EXAMINATION: 60 }).map(([code, max]) => ({ templateId: "template", templateVersion: 1, componentId: code, code, maximumMarks: new Prisma.Decimal(max), totalMarks: new Prisma.Decimal(100), isRequired: true })) : [];
      if (text.includes("FROM course_offerings")) return sql.values[0] === "offering" && sql.values[1] === "law" ? [{ id: "offering" }] : [];
      if (text.includes("FROM teacher_course_assignments")) return flags.assigned && flags.roleActive ? [{ id: "assignment", assignedAt: at }] : [];
      if (text.includes("FROM enrollments WHERE department_id")) return state.enrollments.filter((e) => e.departmentId === sql.values[0] && e.courseOfferingId === sql.values[1]);
      if (text.includes("FROM enrollments")) return state.enrollments.filter((e) => e.id === sql.values[0] && e.departmentId === sql.values[1] && e.courseOfferingId === sql.values[2]);
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
      findMany: async ({ where, distinct }: any) => {
        const rows = state.marks.filter((row) => matches(row, where)).sort((a, b) => b.revision - a.revision);
        return distinct ? rows.filter((row, i) => rows.findIndex((candidate) => candidate.enrollmentId === row.enrollmentId) === i) : rows;
      },
      create: async ({ data }: any) => { const row = { id: `mark-${++sequence}`, ...data }; state.marks.push(row); return row; },
    },
    formativeTeacherSubmission: {
      findFirst: async ({ where }: any) => state.legacySubmissions.find((row) => matches(row, where)) ?? null,
    },
    formativeActivitySubmission: {
      findFirst: async ({ where }: any) => state.submissions.filter((row) => matches(row, where)).sort((a, b) => b.version - a.version)[0] ?? null,
      create: async ({ data }: any) => { const row = { id: `submission-${++sequence}`, version: 1, status: "MARKS_SUBMITTED", submittedAt: at, ...data }; state.submissions.push(row); return row; },
    },
    formativeActivitySubmissionItem: { createMany: async ({ data }: any) => { state.items.push(...data); return { count: data.length }; } },
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
  const ready = async (assignedWeight = "30") => {
    const activity = await service.createActivity("offering", { ...activityInput, assignedWeight });
    await service.startMarking("offering", activity.id);
    await service.saveMark("offering", activity.id, "enrollment", markInput);
    return activity;
  };
  return { service, state, flags, principal, queries, grantAdjustment, ready };
}

test("assigned Teacher submits one server-derived activity package with exact immutable source and assignment provenance", async () => {
  const h = harness(); const activity = await h.ready();
  const result = await h.service.submitActivity("offering", activity.id);
  assert.equal(result.version, 1);
  assert.equal(result.enrollmentCount, 1);
  assert.match(result.sourceFingerprint, /^[0-9a-f]{64}$/);
  assert.equal((result.sourceSnapshotJson as any).sources[0].weightedMark, "24.00");
  assert.equal(result.teacherAssignmentId, "assignment");
  assert.equal(result.assignmentAssignedAt, at);
  assert.equal(result.actorUserId, "teacher");
  assert.equal(result.ruleVersionCode, "FORMATIVE_ACTIVITIES_30_HALF_UP_2DP_V1");
  assert.deepEqual(h.state.items[0], { ...scope, enrollmentId: "enrollment", activityId: activity.id,
    submissionId: result.id, markEvidenceId: h.state.marks[0].id });
  assert.equal((result.sourceSnapshotJson as any).sources[0].markRevision, 1);
  assert.equal((result.sourceSnapshotJson as any).activity.id, activity.id);
  const configuration = (result.sourceSnapshotJson as any).configuration;
  assert.equal(configuration.templateId, "template");
  assert.equal(configuration.templateVersion, 1);
  assert.deepEqual(configuration.components.find((component: any) => component.code === "FORMATIVE_ACTIVITIES"),
    { id: "FORMATIVE_ACTIVITIES", code: "FORMATIVE_ACTIVITIES", maximum: "30.00" });
  assert.equal(h.state.audits.at(-1).action, "formative.activity.teacher-submitted");
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
    const h = harness(); const activity = await h.ready(); change(h);
    await assert.rejects(h.service.submitActivity("offering", activity.id), (error: any) => [403, 404].includes(error.getStatus()));
    assert.equal(h.state.submissions.length, 0);
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

test("offering weight budget permits partial/exact totals and excludes the replaced draft weight", async () => {
  const h = harness();
  const first = await h.service.createActivity("offering", { ...activityInput, assignedWeight: "12" });
  const second = await h.service.createActivity("offering", { ...activityInput, assignedWeight: "17" });
  const total = () => h.state.activities.reduce((sum, a) => sum.add(a.assignedWeight), new Prisma.Decimal(0)).toFixed(2);
  assert.equal(total(), "29.00");
  await h.service.updateActivity("offering", second.id, { ...activityInput, assignedWeight: "18" });
  assert.equal(total(), "30.00");
  const before = JSON.stringify(h.state);
  await assert.rejects(h.service.createActivity("offering", { ...activityInput, assignedWeight: "0.01" }), /30.00 budget/);
  await assert.rejects(h.service.updateActivity("offering", first.id, { ...activityInput, assignedWeight: "12.01" }), /30.00 budget/);
  assert.equal(JSON.stringify(h.state), before);
  await h.service.updateActivity("offering", first.id, { ...activityInput, assignedWeight: "11" });
  assert.equal(total(), "29.00");
  await h.service.createActivity("offering", { ...activityInput, assignedWeight: "1" });
  assert.equal(total(), "30.00");
});

test("activity submission rejects an over-budget historical configuration before creating any evidence", async () => {
  for (const status of ["DRAFT", "MARKING"]) {
    const h = harness(); const activity = await h.ready();
    // Simulate pre-migration/imported state; do not exercise or bypass a database trigger.
    h.state.activities.push({ ...h.state.activities[0], id: "historical-extra", assignedWeight: new Prisma.Decimal("0.01"), status });
    const before = JSON.stringify(h.state);
    await assert.rejects(h.service.submitActivity("offering", activity.id), /Current Formative activity configuration exceeds the \/30 budget/);
    assert.equal(JSON.stringify(h.state), before);
  }
});

test("submission current-budget defense allows partial and exact totals and keeps offering/department scope", async () => {
  for (const weight of ["15", "30"]) {
    const h = harness(); const activity = await h.ready(weight);
    h.state.activities.push({ ...h.state.activities[0], id: "other-offering", courseOfferingId: "other" });
    h.state.activities.push({ ...h.state.activities[0], id: "other-department", departmentId: "other" });
    const result = await h.service.submitActivity("offering", activity.id);
    assert.equal(result.enrollmentCount, 1);
    assert.equal(h.state.submissions.length, 1);
  }
});

test("complete enrollment set requires raw marks, consistent weights, feedback and clear integrity", async () => {
  for (const change of [
    (h: ReturnType<typeof harness>) => { h.state.marks = []; },
    (h: ReturnType<typeof harness>) => { h.state.marks[0].rawMark = null; },
    (h: ReturnType<typeof harness>) => { h.state.marks[0].feedbackCompleted = false; },
    (h: ReturnType<typeof harness>) => { h.state.marks[0].feedback = " "; },
    (h: ReturnType<typeof harness>) => { h.state.marks[0].integrityStatus = "PENDING_REVIEW"; },
    (h: ReturnType<typeof harness>) => { h.state.marks[0].integrityStatus = "BLOCKED"; },
    (h: ReturnType<typeof harness>) => { h.state.activities[0].assignedWeight = new Prisma.Decimal(29); },
    (h: ReturnType<typeof harness>) => { h.state.enrollments.push({ ...scope, id: "missing-enrollment" }); },
  ]) {
    const h = harness(); const activity = await h.ready(); change(h);
    await assert.rejects(h.service.submitActivity("offering", activity.id), BadRequestException);
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

test("activity submission requires reasoned adjustments, preserves old evidence and permits immutable resubmission", async () => {
  const h = harness(); const activity = await h.ready("15");
  const first = await h.service.submitActivity("offering", activity.id);
  await assert.rejects(h.service.submitActivity("offering", activity.id), ConflictException);
  const revised = { ...markInput, feedback: "Corrected feedback", reason: "Script reviewed" };
  await assert.rejects(h.service.saveMark("offering", activity.id, "enrollment", revised), ForbiddenException);
  await assert.rejects(h.service.adjustMark("offering", activity.id, "enrollment", revised), ForbiddenException);
  h.grantAdjustment();
  assert.throws(() => h.service.adjustMark("offering", activity.id, "enrollment", { ...revised, reason: " \t" }), BadRequestException);
  h.flags.databaseAdjustmentGrant = false;
  await assert.rejects(h.service.adjustMark("offering", activity.id, "enrollment", revised), ForbiddenException);
  h.flags.databaseAdjustmentGrant = true;
  const before = JSON.stringify(first);
  const mark = await h.service.adjustMark("offering", activity.id, "enrollment", revised);
  assert.equal(mark.previousId, h.state.marks[0].id);
  assert.equal(h.state.marks[0].feedback, markInput.feedback);
  const second = await h.service.submitActivity("offering", activity.id);
  assert.equal(second.version, 2);
  assert.equal(second.previousId, first.id);
  assert.notEqual(first.sourceFingerprint, second.sourceFingerprint);
  assert.equal(JSON.stringify(first), before);
  assert.equal(h.state.items[0].markEvidenceId, h.state.marks[0].id);
  assert.equal(h.state.items[1].markEvidenceId, mark.id);
  await assert.rejects(h.service.updateActivity("offering", activity.id, activityInput), ConflictException);
  const unrelated = await h.service.createActivity("offering", { ...activityInput, assignedWeight: "15" });
  await h.service.updateActivity("offering", unrelated.id, { ...activityInput, assignedWeight: "15", title: "Unrelated" });
  await h.service.startMarking("offering", unrelated.id);
});

test("historical whole-package submission preserves enrollment and whole-offering freezes and reads", async () => {
  const h = harness(); const activity = await h.ready(); h.grantAdjustment();
  h.state.legacySubmissions.push({ id: "historical", ...scope, enrollmentId: "enrollment" });
  await assert.rejects(h.service.saveMark("offering", activity.id, "enrollment", markInput), ConflictException);
  await assert.rejects(h.service.adjustMark("offering", activity.id, "enrollment", { ...markInput, reason: "Correction" }), ConflictException);
  await assert.rejects(h.service.createActivity("offering", activityInput), ConflictException);
  assert.equal((await h.service.read("offering", "enrollment")).submission!.id, "historical");
});

test("one complete activity includes every approved enrollment without requiring unrelated activity marks or a 30 weight", async () => {
  const h = harness(); h.state.enrollments.push({ ...scope, id: "enrollment-2" });
  const activity = await h.service.createActivity("offering", { ...activityInput, rawMaximum: "8", assignedWeight: "1" });
  await h.service.startMarking("offering", activity.id);
  for (const enrollment of h.state.enrollments) await h.service.saveMark("offering", activity.id, enrollment.id, { ...markInput, rawMark: "1" });
  await h.service.createActivity("offering", { ...activityInput, assignedWeight: "29" });
  const submission = await h.service.submitActivity("offering", activity.id);
  assert.equal(submission.enrollmentCount, 2);
  assert.equal(h.state.items.length, 2);
  assert.ok((submission.sourceSnapshotJson as any).sources.every((source: any) => source.weightedMark === "0.13"));
});

test("newly approved enrollment requires explicit reasoned authority after activity submission", async () => {
  const h = harness(); const activity = await h.ready();
  const first = await h.service.submitActivity("offering", activity.id);
  h.state.enrollments.push({ ...scope, id: "new-enrollment" });
  await assert.rejects(h.service.submitActivity("offering", activity.id), BadRequestException);
  await assert.rejects(h.service.saveMark("offering", activity.id, "new-enrollment", markInput), ForbiddenException);
  h.grantAdjustment();
  await h.service.adjustMark("offering", activity.id, "new-enrollment", { ...markInput, reason: "Newly approved enrollment added to activity" });
  const next = await h.service.submitActivity("offering", activity.id);
  assert.equal(next.enrollmentCount, 2); assert.equal(next.previousId, first.id);
});

test("submission safely rejects an activity in a different offering and requires marking", async () => {
  const h = harness();
  h.state.activities.push({ id: "outside", departmentId: "law", courseOfferingId: "other" });
  await assert.rejects(h.service.submitActivity("offering", "outside"), NotFoundException);
  const activity = await h.service.createActivity("offering", activityInput);
  await assert.rejects(h.service.submitActivity("offering", activity.id), ConflictException);
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
  await assert.rejects(h.service.submitActivity("offering", activity.id), /audit unavailable/);
  assert.equal(h.state.submissions.length, 0);
  assert.equal(h.state.items.length, 0);
});
