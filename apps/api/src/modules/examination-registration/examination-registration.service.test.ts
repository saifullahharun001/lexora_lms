import assert from "node:assert/strict";
import test from "node:test";
import { workflowHarness } from "./examination-workflow.test-harness";
import { EXAMINATION_POLICIES as P } from "@/common/authorization/examination-policies";

const candidate = { studentUserId: "student-regular", curriculumAssignmentId: "curriculum-student-regular", category: "REGULAR" as const };
async function draft() {
  const h = workflowHarness(); h.as("poe"); await h.registration.createList("exam", "POE official entry list");
  await h.registration.putCandidate("exam", candidate); return h;
}
test("POE Chairman certifies category, exact appointment and academic sources", async () => {
  const h = await draft(); const list = await h.registration.certify("exam");
  assert.equal(list.status, "CERTIFIED"); assert.equal(list.chairmanAssignmentId, "poe-appointment");
  assert.equal(list.certifiedByUserId, "poe"); assert.equal(list.ruleVersionCode, "LLB_2025");
  assert.equal(h.state.examinationCandidateCourse!.length, 2);
});
for (const actor of ["admin", "CHAIRMAN", "MEMBER_1", "teacher", "student", "examiner", "EXTERNAL_MEMBER"]) {
  test(`${actor} cannot certify merely through coarse permissions or another academic duty`, async () => {
    const h = await draft(); h.as(actor, [P.CLASSIFY]);
    await assert.rejects(h.registration.certify("exam"));
    assert.equal(h.state.examinationCandidateList![0]!.status, "DRAFT");
  });
}
test("REGULAR, IRREGULAR and IMPROVEMENT are distinct certified categories", async () => {
  const h = workflowHarness(); await h.ready(); h.as("poe");
  const list = await h.registration.workspace("exam");
  assert.deepEqual(new Set(list!.ExaminationCandidateRegistration_list.map((r) => r.category)), new Set(["REGULAR", "IRREGULAR", "IMPROVEMENT"]));
});
test("certified candidate category and source cannot be updated or removed", async () => {
  const h = await draft(); await h.registration.certify("exam");
  await assert.rejects(h.registration.putCandidate("exam", { ...candidate, category: "IMPROVEMENT" }));
  await assert.rejects(h.registration.removeDraftCandidate("exam", h.state.examinationCandidateRegistration![0]!.id));
});
test("draft correction increments classification version before certification", async () => {
  const h = await draft(); const revised = await h.registration.putCandidate("exam", { ...candidate, category: "IRREGULAR" });
  assert.equal(revised.version, 2); assert.equal(revised.category, "IRREGULAR");
  await h.registration.certify("exam"); assert.equal(h.state.examinationCandidateRegistration![0]!.version, 2);
});
test("duplicate registration and concurrent certification are idempotent", async () => {
  const h = await draft(); const first = h.state.examinationCandidateRegistration![0]!;
  const again = await h.registration.putCandidate("exam", candidate); assert.equal(again.id, first.id);
  const results = await Promise.all([h.registration.certify("exam"), h.registration.certify("exam")]);
  assert.equal(results[0].id, results[1].id); assert.equal(h.state.examinationCandidateRegistration!.length, 1);
  assert.equal(h.state.auditLog!.filter((a) => a.action === "examination-candidate.classification.certified").length, 1);
});
test("duplicate candidate-list creation produces one success audit", async () => {
  const h = workflowHarness(); h.as("poe");
  const lists = await Promise.all([h.registration.createList("exam", "Official list"), h.registration.createList("exam", "Official list")]);
  assert.equal(lists[0].id, lists[1].id); assert.equal(h.state.auditLog!.filter((a) => a.action === "examination-candidate.list.created").length, 1);
});
test("POE replacement/revocation and missing live permission prevent certification", async () => {
  const h = await draft(); h.flags.stalePoe = true; await assert.rejects(h.registration.certify("exam"));
  h.flags.stalePoe = false; h.flags.missingLivePermission = true; await assert.rejects(h.registration.certify("exam"));
});
test("wrong department, foreign examination and arbitrary student identities rejected", async () => {
  const h = await draft(); await assert.rejects(h.registration.workspace("foreign"));
  await assert.rejects(h.registration.putCandidate("exam", { ...candidate, studentUserId: "foreign" }));
  await assert.rejects(h.registration.removeDraftCandidate("exam", "foreign"));
  h.as("poe", undefined, "foreign"); await assert.rejects(h.registration.certify("exam"));
});
test("certification revalidates academic consistency rather than trusting old draft enrollment", async () => {
  const h = await draft(); h.flags.wrongAcademicIdentity = true; await assert.rejects(h.registration.certify("exam"));
  assert.equal(h.state.examinationCandidateList![0]!.status, "DRAFT");
});
test("empty list and invented categories rejected", async () => {
  const h = workflowHarness(); h.as("poe"); await h.registration.createList("exam", "official");
  await assert.rejects(h.registration.certify("exam"));
  await assert.rejects(async () => h.registration.putCandidate("exam", { ...candidate, category: "SPECIAL" as any }));
});
test("certification audit failure rolls back the locked list and refreshed source rows", async () => {
  const h = await draft(); const ids = h.state.examinationCandidateCourse!.map((c) => c.id); h.flags.auditFailure = true;
  await assert.rejects(h.registration.certify("exam"), /audit/);
  assert.equal(h.state.examinationCandidateList![0]!.status, "DRAFT");
  assert.deepEqual(h.state.examinationCandidateCourse!.map((c) => c.id), ids);
});

type Harness = ReturnType<typeof workflowHarness>;
const recordedAction = "examination-candidate.classification.draft-recorded";
const removedAction = "examination-candidate.classification.draft-removed";
const originalSources = ["ec-1", "ec-2"].map((examinationCourseId) => ({ examinationCourseId,
  enrollmentId: `enrollment-${candidate.studentUserId}-${examinationCourseId}` }));
const replacementSources = [
  { examinationCourseId: "ec-2", enrollmentId: "replacement-enrollment-2" },
  { examinationCourseId: "ec-1", enrollmentId: "replacement-enrollment-1" },
];
function expectedSnapshot(h: Harness, overrides: Record<string, unknown> = {}) {
  return { registrationId: h.state.examinationCandidateRegistration![0]!.id,
    listId: h.state.examinationCandidateList![0]!.id, studentUserId: candidate.studentUserId, examinationId: "exam",
    category: "REGULAR", curriculumAssignmentId: candidate.curriculumAssignmentId, version: 1,
    recordedByUserId: "poe", recordedPoeAssignmentId: "poe-appointment", courseSources: originalSources, ...overrides };
}
function successorPoe(h: Harness) {
  const old = h.state.poeChairmanAssignment![0]!;
  old.revokedAt = new Date();
  h.state.poeChairmanAssignment!.push({ ...old, id: "successor-appointment", userId: "poe-successor", revokedAt: null });
  h.as("poe-successor", [P.CLASSIFY]);
}
function draftAudits(h: Harness) { return h.state.auditLog!.filter((a) => a.action === recordedAction); }
function replaceAcademicSources(h: Harness) {
  const curriculumAssignmentId = "replacement-curriculum";
  h.studentAcademicSources.set(candidate.studentUserId, { curriculumAssignmentId, courses: replacementSources });
  return { ...candidate, curriculumAssignmentId };
}

test("initial DRAFT audit contains only the complete ordered structural snapshot and null previous", async () => {
  const h = workflowHarness(); h.as("poe"); h.sourceCourses.reverse();
  await h.registration.createList("exam", "official");
  const created = await h.registration.putCandidate("exam", candidate);
  assert.equal(h.state.examinationCandidateList![0]!.recordedPoeAssignmentId, "poe-appointment");
  assert.equal(h.state.examinationCandidateList![0]!.recordedByUserId, "poe");
  assert.equal(created.recordedPoeAssignmentId, "poe-appointment");
  assert.equal(created.recordedByUserId, "poe");
  assert.deepEqual(h.state.examinationCandidateCourse!.map((s) => s.examinationCourseId), ["ec-2", "ec-1"]);
  const audits = draftAudits(h); assert.equal(audits.length, 1); assert.equal(audits[0]!.targetId, created.id);
  assert.deepEqual(audits[0]!.contextJson, { changeType: "CREATED", previous: null, current: expectedSnapshot(h) });
});

test("DRAFT category revision preserves distinct exact previous and current snapshots", async () => {
  const h = await draft(); const previous = expectedSnapshot(h);
  await h.registration.putCandidate("exam", { ...candidate, category: "IRREGULAR" });
  const audits = draftAudits(h); assert.equal(audits.length, 2);
  const context = audits[1]!.contextJson;
  assert.deepEqual(context, { changeType: "REVISED", previous,
    current: expectedSnapshot(h, { category: "IRREGULAR", version: 2 }) });
  assert.notStrictEqual(context.previous, context.current);
  assert.notStrictEqual(context.previous.courseSources, context.current.courseSources);
  assert.notDeepEqual(context.previous, context.current);
  assert.deepEqual(audits[0]!.contextJson.current, previous);
});

test("DRAFT curriculum revision preserves deleted sources and records exact ordered replacements", async () => {
  const h = await draft(); h.state.examinationCandidateCourse!.reverse();
  const previous = expectedSnapshot(h); const oldIds = h.state.examinationCandidateCourse!.map((s) => s.id);
  const input = replaceAcademicSources(h);
  await h.registration.putCandidate("exam", input);
  const context = draftAudits(h)[1]!.contextJson;
  assert.deepEqual(context, { changeType: "REVISED", previous,
    current: expectedSnapshot(h, { curriculumAssignmentId: input.curriculumAssignmentId, version: 2,
      courseSources: [replacementSources[1], replacementSources[0]] }) });
  assert.notDeepEqual(context.previous, context.current);
  assert.notDeepEqual(context.previous.courseSources, context.current.courseSources);
  assert.equal(h.state.examinationCandidateCourse!.some((s) => oldIds.includes(s.id)), false);
  assert.deepEqual(h.state.examinationCandidateCourse!.map(({ examinationCourseId, enrollmentId }) =>
    ({ examinationCourseId, enrollmentId })), replacementSources);
  // Subsequent writes must not retroactively change either side of an earlier transition.
  const savedContext = structuredClone(context);
  await h.registration.putCandidate("exam", { ...input, category: "IMPROVEMENT" });
  assert.deepEqual(context, savedContext);
  assert.deepEqual(draftAudits(h)[0]!.contextJson.current, previous);
});

test("DRAFT removal preserves the full latest snapshot with null current after domain deletion", async () => {
  const h = await draft(); const input = replaceAcademicSources(h);
  const revised = await h.registration.putCandidate("exam", { ...input, category: "IMPROVEMENT" });
  const previous = expectedSnapshot(h, { category: "IMPROVEMENT", curriculumAssignmentId: input.curriculumAssignmentId,
    version: 2, courseSources: [replacementSources[1], replacementSources[0]] });
  assert.deepEqual(await h.registration.removeDraftCandidate("exam", revised.id), { removed: true });
  assert.deepEqual(h.state.examinationCandidateRegistration, []); assert.deepEqual(h.state.examinationCandidateCourse, []);
  const audits = h.state.auditLog!.filter((a) => a.action === removedAction);
  assert.equal(audits.length, 1); assert.equal(audits[0]!.targetId, revised.id);
  assert.deepEqual(audits[0]!.contextJson, { changeType: "REMOVED", previous, current: null, removerPoeAssignmentId: "poe-appointment" });
});

test("unchanged DRAFT put retains version, stored sources and one classification audit", async () => {
  const h = await draft(); const before = structuredClone(h.state);
  // Validation still runs, but an unchanged classification does not refresh source rows.
  h.studentAcademicSources.set(candidate.studentUserId, { curriculumAssignmentId: candidate.curriculumAssignmentId,
    courses: replacementSources });
  const again = await h.registration.putCandidate("exam", candidate);
  assert.equal(again.version, 1); assert.deepEqual(h.state, before); assert.equal(draftAudits(h).length, 1);
  h.flags.wrongAcademicIdentity = true;
  await assert.rejects(h.registration.putCandidate("exam", candidate));
  assert.deepEqual(h.state, before);
});

test("required audit failure rolls DRAFT revision, version and all source replacements back together", async () => {
  const h = await draft(); successorPoe(h); const before = structuredClone(h.state); const input = replaceAcademicSources(h);
  const createAudit = h.tx.auditLog.create;
  h.tx.auditLog.create = async (args: any) => {
    assert.equal(args.data.action, recordedAction);
    assert.equal(h.state.examinationCandidateRegistration![0]!.version, 2);
    assert.equal(h.state.examinationCandidateRegistration![0]!.category, "IRREGULAR");
    assert.equal(h.state.examinationCandidateRegistration![0]!.curriculumAssignmentId, input.curriculumAssignmentId);
    assert.equal(h.state.examinationCandidateRegistration![0]!.recordedByUserId, "poe-successor");
    assert.equal(h.state.examinationCandidateRegistration![0]!.recordedPoeAssignmentId, "successor-appointment");
    assert.equal(args.data.contextJson.previous.recordedPoeAssignmentId, "poe-appointment");
    assert.equal(args.data.contextJson.current.recordedPoeAssignmentId, "successor-appointment");
    assert.deepEqual(h.state.examinationCandidateCourse!.map((s) => s.enrollmentId), replacementSources.map((s) => s.enrollmentId));
    assert.equal(h.state.examinationCandidateCourse!.some((s) => before.examinationCandidateCourse!.some((old) => old.id === s.id)), false);
    return createAudit(args);
  };
  h.flags.auditFailure = true;
  await assert.rejects(h.registration.putCandidate("exam", { ...input, category: "IRREGULAR" }), /required audit unavailable/);
  assert.deepEqual(h.state, before);
});

test("required audit failure rolls DRAFT removal and its source deletion back together", async () => {
  const h = await draft(); successorPoe(h); const before = structuredClone(h.state);
  const createAudit = h.tx.auditLog.create;
  h.tx.auditLog.create = async (args: any) => {
    assert.equal(args.data.action, removedAction);
    assert.equal(args.data.contextJson.previous.recordedPoeAssignmentId, "poe-appointment");
    assert.equal(args.data.contextJson.removerPoeAssignmentId, "successor-appointment");
    assert.deepEqual(h.state.examinationCandidateRegistration, []); assert.deepEqual(h.state.examinationCandidateCourse, []);
    return createAudit(args);
  };
  h.flags.auditFailure = true;
  await assert.rejects(h.registration.removeDraftCandidate("exam", before.examinationCandidateRegistration![0]!.id), /required audit unavailable/);
  assert.deepEqual(h.state, before);
});

test("required audit failure also rolls initial DRAFT creation and its sources back", async () => {
  const h = workflowHarness(); h.as("poe"); await h.registration.createList("exam", "official");
  const before = structuredClone(h.state); h.flags.auditFailure = true;
  await assert.rejects(h.registration.putCandidate("exam", candidate), /required audit unavailable/);
  assert.deepEqual(h.state, before);
});

test("DRAFT audit projection excludes credentials, tokens, marks and unrelated personal fields", async () => {
  const h = await draft(); const row = h.state.examinationCandidateRegistration![0]!;
  const unrelated = { passwordHash: "test-only-password", token: "test-only-token", credentials: { secret: "test-only" },
    marks: 5, email: "test@example.invalid" };
  Object.assign(row, unrelated, { recordedByUserId: "previous-poe" });
  for (const source of h.state.examinationCandidateCourse!) Object.assign(source, unrelated);
  const previous = expectedSnapshot(h, { recordedByUserId: "previous-poe" });
  await h.registration.putCandidate("exam", { ...candidate, category: "IRREGULAR" });
  const current = expectedSnapshot(h, { category: "IRREGULAR", version: 2 });
  assert.deepEqual(draftAudits(h)[1]!.contextJson, { changeType: "REVISED", previous, current });
  await h.registration.removeDraftCandidate("exam", row.id);
  assert.deepEqual(h.state.auditLog!.find((a) => a.action === removedAction)!.contextJson,
    { changeType: "REMOVED", previous: current, current: null, removerPoeAssignmentId: "poe-appointment" });
  for (const audit of h.state.auditLog!.filter((a) => [recordedAction, removedAction].includes(a.action))) {
    assert.doesNotMatch(JSON.stringify(audit.contextJson), /credential|password|token|secret|marks|email/i);
  }
});

test("successor POE revision preserves old appointment and records new actor and appointment", async () => {
  const h = await draft(); const previous = expectedSnapshot(h); successorPoe(h);
  const revised = await h.registration.putCandidate("exam", { ...candidate, category: "IRREGULAR" });
  assert.equal(revised.recordedByUserId, "poe-successor");
  assert.equal(revised.recordedPoeAssignmentId, "successor-appointment");
  assert.equal(revised.version, 2);
  const context = draftAudits(h)[1]!.contextJson;
  assert.deepEqual(context, { changeType: "REVISED", previous,
    current: expectedSnapshot(h, { category: "IRREGULAR", version: 2, recordedByUserId: "poe-successor", recordedPoeAssignmentId: "successor-appointment" }) });
  assert.notDeepEqual(context.previous, context.current);
  assert.deepEqual(draftAudits(h)[0]!.contextJson.current, previous);
  assert.equal(h.state.examinationCandidateList![0]!.recordedPoeAssignmentId, "poe-appointment");
});

test("successor POE removal distinguishes original recorder from current remover", async () => {
  const h = await draft(); const previous = expectedSnapshot(h); successorPoe(h);
  await h.registration.removeDraftCandidate("exam", String(previous.registrationId));
  const audit = h.state.auditLog!.find((a) => a.action === removedAction)!;
  assert.equal(audit.actorUserId, "poe-successor");
  assert.deepEqual(audit.contextJson, { changeType: "REMOVED", previous, current: null, removerPoeAssignmentId: "successor-appointment" });
});

test("successor unchanged put leaves original recording appointment and audit history intact", async () => {
  const h = await draft(); successorPoe(h); const before = structuredClone(h.state);
  await h.registration.putCandidate("exam", candidate);
  assert.deepEqual(h.state, before);
});

test("required list creation audit failure rolls exact recording provenance back", async () => {
  const h = workflowHarness(); h.as("poe"); const before = structuredClone(h.state); h.flags.auditFailure = true;
  await assert.rejects(h.registration.createList("exam", "official"), /required audit unavailable/);
  assert.deepEqual(h.state, before);
});
