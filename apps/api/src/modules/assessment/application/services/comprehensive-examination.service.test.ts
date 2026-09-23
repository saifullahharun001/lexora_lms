import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { workflowHarness } from "@/modules/examination-registration/examination-workflow.test-harness";
import { EXAMINATION_POLICIES as P } from "@/common/authorization/examination-policies";

for (const mode of ["ALL_MEMBERS_AVERAGE", "COURSE_DISTRIBUTED", "CHAIRMAN_ONLY"] as const) {
  test(`${mode}: complete workflow finalises exact immutable sources and reads back`, async () => {
    const h = workflowHarness(); await h.ready(mode); await h.markAll();
    const final = await h.service.finalise("exam");
    assert.equal(h.state.comprehensiveFinalisation!.length, 1);
    assert.equal(h.state.comprehensiveFinalResult!.length, 2);
    assert.equal(h.state.comprehensiveFinalSource!.length, mode === "ALL_MEMBERS_AVERAGE" ? 8 : 2);
    assert.ok(h.state.comprehensiveFinalResult!.every((r) => r.mark.eq(mode === "ALL_MEMBERS_AVERAGE" ? "2.5" : "1")));
    for (const source of h.state.comprehensiveFinalSource!) assert.ok(h.state.comprehensiveMark!.some((m) => m.id === source.markId && m.status === "SUBMITTED"));
    const read = await h.service.workspace("exam", false, true);
    assert.equal(read.finalisation?.id, final.id);
    const again = await h.service.finalise("exam"); assert.equal(again.id, final.id);
    assert.equal(h.state.auditLog!.filter((a) => a.action === "comprehensive.chairman.finalised").length, 1);
  });
  test(`${mode}: incomplete source marks cannot finalise`, async () => {
    const h = workflowHarness(); await h.ready(mode);
    await assert.rejects(h.service.finalise("exam"));
    assert.equal(h.state.comprehensiveFinalResult!.length, 0);
  });
}

test("only explicitly certified REGULAR students enter the roster with exact registration version", async () => {
  const h = workflowHarness(); await h.ready();
  assert.equal(h.state.examinationCandidateRegistration!.length, 3);
  assert.equal(h.state.comprehensiveRosterEntry!.length, 2);
  for (const row of h.state.comprehensiveRosterEntry!) {
    const registration = h.state.examinationCandidateRegistration!.find((r) => r.id === row.registrationId)!;
    assert.equal(registration.category, "REGULAR"); assert.equal(row.registrationVersion, registration.version);
    assert.ok(h.state.examinationCandidateCourse!.some((cc) => cc.id === row.candidateCourseId && cc.registrationId === registration.id));
  }
  await h.service.roster("exam"); assert.equal(h.state.comprehensiveRosterEntry!.length, 2);
});
test("uncertified list cannot configure regular Comprehensive", async () => {
  const h = workflowHarness(); h.as("poe"); await h.registration.createList("exam", "official source"); h.as("CHAIRMAN");
  await assert.rejects(h.service.configure("exam", { mode: "CHAIRMAN_ONLY", examDate: "2026-09-21" }));
});

test("roster permits an applicable course with no certified REGULAR source without inventing a candidate", async () => {
  const h = workflowHarness();
  h.studentAcademicSources.set("student-REGULAR", { curriculumAssignmentId: "curriculum-student-REGULAR",
    courses: [{ examinationCourseId: "ec-1", enrollmentId: "enrollment-student-REGULAR-ec-1" }] });
  await h.ready();
  assert.equal(h.state.comprehensiveCourse!.length, 2);
  const rows = h.state.comprehensiveRosterEntry!;
  assert.equal(rows.length, 1);
  const source = h.state.examinationCandidateCourse!.find((cc) => cc.id === rows[0]!.candidateCourseId)!;
  assert.equal(source.examinationCourseId, "ec-1");
  assert.equal(h.state.examinationCandidateRegistration!.find((r) => r.id === rows[0]!.registrationId)!.category, "REGULAR");
  assert.ok(h.state.comprehensiveExamination![0]!.rosterLockedAt);
});
test("an incomplete roster cannot finalise even if every existing row is marked", async () => {
  const h = workflowHarness(); await h.ready("CHAIRMAN_ONLY"); h.state.comprehensiveRosterEntry!.pop(); await h.markAll();
  await assert.rejects(h.service.finalise("exam"), /roster is incomplete/);
});
for (const actor of ["admin", "teacher", "examiner", "student"]) {
  test(`${actor} has no Committee authority even with an exact coarse permission`, async () => {
    const h = workflowHarness(); await h.ready(); h.as(actor, [P.READ, P.MARK, P.REVIEW, P.CONFIGURE, P.FINALISE]);
    await assert.rejects(h.service.save("exam", h.state.comprehensiveRosterEntry![0]!.id, { mark: "3" }, true));
    await assert.rejects(h.service.finalise("exam"));
    await assert.rejects(h.service.workspace("exam"));
  });
}
for (const actor of ["MEMBER_1", "MEMBER_2", "EXTERNAL_MEMBER"]) {
  test(`${actor} cannot configure, distribute, return or finalise`, async () => {
    const h = workflowHarness(); await h.ready(); h.as(actor, Object.values(P));
    await assert.rejects(h.service.configure("exam", { mode: "CHAIRMAN_ONLY", examDate: "2026-09-21" }));
    await assert.rejects(h.service.distribute("exam", [])); await assert.rejects(h.service.returnMark("exam", "foreign", "reason"));
    await assert.rejects(h.service.finalise("exam"));
  });
  test(`${actor} cannot enter marks in Chairman-only mode`, async () => {
    const h = workflowHarness(); await h.ready("CHAIRMAN_ONLY"); h.as(actor);
    await assert.rejects(h.service.save("exam", h.state.comprehensiveRosterEntry![0]!.id, { mark: "3" }, true));
  });
}
test("four marks including External Member are mandatory", async () => {
  const h = workflowHarness(); await h.ready();
  for (const row of h.state.comprehensiveRosterEntry!) for (const seat of ["CHAIRMAN", "MEMBER_1", "MEMBER_2"]) {
    h.as(seat); await h.service.save("exam", row.id, { mark: "3" }, true);
  }
  h.as("CHAIRMAN"); await assert.rejects(h.service.finalise("exam"), /incomplete/);
});
test("distributed actor sees and writes only exact assigned course", async () => {
  const h = workflowHarness(); await h.ready("COURSE_DISTRIBUTED"); h.as("MEMBER_1");
  const own: any = await h.service.workspace("exam"); assert.equal(own.courses.length, 1); assert.equal(own.roster.length, 1);
  await h.service.save("exam", own.roster[0].id, { mark: "4" }, true);
  const foreign = h.state.comprehensiveRosterEntry!.find((r) => r.id !== own.roster[0].id)!;
  await assert.rejects(h.service.save("exam", foreign.id, { mark: "4" }, true));
});
test("incomplete or duplicate allocation rejected before marking", async () => {
  const h = workflowHarness(); await h.ready("COURSE_DISTRIBUTED");
  await assert.rejects(h.service.distribute("exam", []));
  const courseId = h.state.comprehensiveCourse![0]!.id;
  await assert.rejects(h.service.distribute("exam", [{ courseId, committeeAssignmentId: "appointment-CHAIRMAN" }, { courseId, committeeAssignmentId: "appointment-MEMBER_1" }]));
});
test("Chairman may distribute courses to self", async () => {
  const h = workflowHarness(); await h.ready("COURSE_DISTRIBUTED");
  await h.service.distribute("exam", h.state.comprehensiveCourse!.map((c) => ({ courseId: c.id, committeeAssignmentId: "appointment-CHAIRMAN" })));
  await h.markAll(); await h.service.finalise("exam");
  assert.ok(h.state.comprehensiveMark!.every((m) => m.actorUserId === "CHAIRMAN"));
});
test("Chairman return requires original actor and preserves prior revision", async () => {
  const h = workflowHarness(); await h.ready(); h.as("MEMBER_1");
  const row = h.state.comprehensiveRosterEntry![0]!;
  const first = await h.service.save("exam", row.id, { mark: "3" }, true);
  h.as("CHAIRMAN"); const returned = await h.service.returnMark("exam", first.id, "Check the recorded value");
  await assert.rejects(h.service.save("exam", row.id, { mark: "4", returnId: returned.id }, true));
  h.as("MEMBER_1"); const second = await h.service.save("exam", row.id, { mark: "4", returnId: returned.id }, true);
  assert.equal(second.previousId, first.id); assert.equal(second.returnId, returned.id); assert.equal(second.revision, 2);
  assert.ok(h.state.comprehensiveMark!.find((m) => m.id === first.id)!.mark.eq(3));
  const repeated = await h.service.save("exam", row.id, { mark: "4", returnId: returned.id }, true);
  assert.equal(repeated.id, second.id);
});
test("unresolved return blocks finalisation; correction resolves it without mutating return", async () => {
  const h = workflowHarness(); await h.ready(); await h.markAll();
  const mark = h.state.comprehensiveMark!.find((m) => m.seat === "MEMBER_1")!;
  const returned = await h.service.returnMark("exam", mark.id, "Check source");
  await assert.rejects(h.service.finalise("exam"), /returned mark/);
  h.as("MEMBER_1"); await h.service.save("exam", mark.rosterEntryId, { mark: "2.5", returnId: returned.id }, true);
  h.as("CHAIRMAN"); await h.service.finalise("exam"); assert.equal(h.state.comprehensiveMarkReturn!.length, 1);
});
test("Chairman cannot edit another member's submitted mark", async () => {
  const h = workflowHarness(); await h.ready("COURSE_DISTRIBUTED"); await h.markAll();
  const memberMark = h.state.comprehensiveMark![0]!;
  await assert.rejects(h.service.save("exam", memberMark.rosterEntryId, { mark: "5" }, true));
  assert.ok(h.state.comprehensiveMark![0]!.mark.eq(1));
});
for (const reason of ["", "  ", "x".repeat(2001)]) test("return rejects invalid reason length " + reason.length, async () => {
  const h = workflowHarness(); await h.ready(); await assert.rejects(async () => h.service.returnMark("exam", "mark", reason));
});
test("zero is complete evidence, missing rows are not", async () => {
  const h = workflowHarness(); await h.ready("CHAIRMAN_ONLY");
  for (const row of h.state.comprehensiveRosterEntry!) await h.service.save("exam", row.id, { mark: "0" }, true);
  await h.service.finalise("exam"); assert.ok(h.state.comprehensiveFinalResult!.every((r) => r.mark.eq(0)));
});
test("Chairman can edit own drafts before submission", async () => {
  const h = workflowHarness(); await h.ready("CHAIRMAN_ONLY"); const row = h.state.comprehensiveRosterEntry![0]!;
  const draft = await h.service.save("exam", row.id, { mark: "1" }, false);
  const revised = await h.service.save("exam", row.id, { mark: "2" }, false);
  assert.equal(revised.id, draft.id); assert.equal(revised.status, "DRAFT");
  const submitted = await h.service.save("exam", row.id, { mark: "2" }, true); assert.equal(submitted.id, draft.id);
  await assert.rejects(h.service.save("exam", row.id, { mark: "3" }, false));
});
test("mode freezes on the first draft", async () => {
  const h = workflowHarness(); await h.ready("CHAIRMAN_ONLY");
  await h.service.save("exam", h.state.comprehensiveRosterEntry![0]!.id, { mark: "1" }, false);
  await assert.rejects(h.service.configure("exam", { mode: "ALL_MEMBERS_AVERAGE", examDate: "2026-09-21" }));
});
test("allocation freezes on first evidence and cannot be silently reassigned", async () => {
  const h = workflowHarness(); await h.ready("COURSE_DISTRIBUTED"); h.as("MEMBER_1");
  await h.service.save("exam", h.state.comprehensiveRosterEntry![0]!.id, { mark: "2" }, true); h.as("CHAIRMAN");
  await assert.rejects(h.service.distribute("exam", h.state.comprehensiveCourse!.map((c) => ({ courseId: c.id, committeeAssignmentId: "appointment-CHAIRMAN" }))));
});
test("revoked/replaced Committee appointment cannot write or satisfy finalisation", async () => {
  const h = workflowHarness(); await h.ready(); await h.markAll(); const old = h.assignments.find((a) => a.seat === "MEMBER_1")!;
  old.status = "UNASSIGNED"; h.assignments.push({ ...old, id: "replacement", status: "ACTIVE", assignedUserId: "replacement-user" });
  h.as("MEMBER_1"); await assert.rejects(h.service.workspace("exam"));
  h.as("CHAIRMAN"); await assert.rejects(h.service.finalise("exam"), /current submitted/);
  h.as("replacement-user"); await assert.rejects(h.service.save("exam", h.state.comprehensiveRosterEntry![0]!.id, { mark: "4" }, true), /reassignment/);
});
test("stale course allocation rejects writes after appointment replacement", async () => {
  const h = workflowHarness(); await h.ready("COURSE_DISTRIBUTED"); const old = h.assignments.find((a) => a.seat === "MEMBER_1")!;
  old.status = "UNASSIGNED"; h.assignments.push({ ...old, id: "replacement", assignedUserId: "replacement-user", status: "ACTIVE" });
  h.as("replacement-user"); await assert.rejects(h.service.save("exam", h.state.comprehensiveRosterEntry![0]!.id, { mark: "4" }, true));
});
test("External binding expiry immediately removes authority", async () => {
  const h = workflowHarness(); await h.ready(); h.flags.expiredExternal = true; h.as("EXTERNAL_MEMBER");
  await assert.rejects(h.service.workspace("exam"));
});

test("reactivating a distributed appointment does not reuse its frozen course allocation", async () => {
  const h = workflowHarness(); await h.ready("COURSE_DISTRIBUTED");
  h.as("EXTERNAL_MEMBER");
  await h.service.save("exam", h.state.comprehensiveRosterEntry![1]!.id, { mark: "3" }, true);
  h.assignments.find((a) => a.seat === "MEMBER_1")!.assignedAt = new Date("2026-09-01");
  h.as("MEMBER_1");
  await assert.rejects(h.service.save("exam", h.state.comprehensiveRosterEntry![0]!.id, { mark: "3" }, true), /Assigned candidate\/course/);
  const workspace = await h.service.workspace("exam");
  assert.equal("roster" in workspace && workspace.roster?.length, 0);
});
test("reactivating the same External appointment row does not reactivate its old digital binding", async () => {
  const h = workflowHarness(); await h.ready();
  h.assignments.find((a) => a.seat === "EXTERNAL_MEMBER")!.assignedAt = new Date("2026-09-01");
  h.as("EXTERNAL_MEMBER"); await assert.rejects(h.service.workspace("exam"));
  h.as("CHAIRMAN"); await assert.rejects(h.service.save("exam", h.state.comprehensiveRosterEntry![0]!.id, { mark: "3" }, true));
});
test("External binding revocation and appointment expiry prevent four-seat marking", async () => {
  const h = workflowHarness(); await h.ready(); h.state.externalComprehensiveAccess![0]!.revokedAt = new Date();
  await assert.rejects(h.service.save("exam", h.state.comprehensiveRosterEntry![0]!.id, { mark: "3" }, true));
});
test("foreign examination, candidate/course and department IDs are safely denied", async () => {
  const h = workflowHarness(); await h.ready(); await assert.rejects(h.service.workspace("foreign"));
  await assert.rejects(h.service.save("exam", "foreign", { mark: "3" }, true));
  await assert.rejects(h.service.absent("exam", "foreign", "Absent"));
  h.as("CHAIRMAN", undefined, "foreign"); await assert.rejects(h.service.workspace("exam"));
});
test("forged request department never overrides principal", async () => {
  const h = workflowHarness(); await h.ready("CHAIRMAN_ONLY"); await h.markAll(); await h.service.finalise("exam");
  assert.ok(h.state.auditLog!.every((a) => a.departmentId === "law"));
});
test("explicit absence blocks marks and finalisation without creating zero", async () => {
  const h = workflowHarness(); await h.ready("CHAIRMAN_ONLY"); const row = h.state.comprehensiveRosterEntry![0]!;
  await h.service.absent("exam", row.registrationId, "Did not appear at regular sitting");
  await assert.rejects(h.service.save("exam", row.id, { mark: "0" }, true)); await assert.rejects(h.service.finalise("exam"), /absence/);
  assert.equal(h.state.comprehensiveMark!.length, 0); assert.equal(h.state.comprehensiveFinalResult!.length, 0);
});
test("absence retries with the same normalized reason return one immutable row without another audit or marking start", async () => {
  const h = workflowHarness(); await h.ready(); const row = h.state.comprehensiveRosterEntry![0]!;
  const reason = "Did not appear at regular sitting";
  const first = await h.service.absent("exam", row.registrationId, `  ${reason}\n`);
  assert.equal(first.reason, reason);
  assert.deepEqual(h.state.comprehensiveAbsence, [first]);
  assert.equal(h.state.auditLog!.filter((a) => a.action === "comprehensive.absence.recorded").length, 1);
  assert.equal(h.state.auditLog!.filter((a) => a.action === "comprehensive.mode.frozen").length, 1);
  assert.ok(startProvenance(h).markingStartedAt instanceof Date);
  const absence = structuredClone(first); const audits = structuredClone(h.state.auditLog);
  const parent = structuredClone(h.state.comprehensiveExamination![0]);
  const provenance = structuredClone(startProvenance(h));
  for (const retryReason of [reason, `\t ${reason} \r\n`]) {
    const retry = await h.service.absent("exam", row.registrationId, retryReason);
    assert.equal(retry.id, first.id); assert.deepEqual(retry, absence);
    assert.deepEqual(h.state.comprehensiveAbsence, [absence]);
    assert.deepEqual(h.state.auditLog, audits);
    assert.deepEqual(startProvenance(h), provenance);
    assert.deepEqual(h.state.comprehensiveExamination![0], parent);
  }
});

test("a different normalized absence reason conflicts without changing evidence, audits or marking-start provenance", async () => {
  const h = workflowHarness(); await h.ready(); const row = h.state.comprehensiveRosterEntry![0]!;
  const first = await h.service.absent("exam", row.registrationId, "Did not appear at regular sitting");
  const absence = structuredClone(first); const audits = structuredClone(h.state.auditLog);
  const parent = structuredClone(h.state.comprehensiveExamination![0]);
  const provenance = structuredClone(startProvenance(h));
  // Existing normalization trims edges; it does not collapse internal whitespace.
  for (const reason of ["  Unable to attend the sitting  ", "Did  not appear at regular sitting"]) {
    await assert.rejects(h.service.absent("exam", row.registrationId, reason), (error: unknown) => {
      assert.ok(error instanceof ConflictException);
      assert.equal(error.message, "Absence evidence is immutable"); assert.equal(error.getStatus(), 409);
      return true;
    });
    assert.deepEqual(h.state.comprehensiveAbsence, [absence]);
    assert.deepEqual(h.state.auditLog, audits);
    assert.deepEqual(startProvenance(h), provenance);
    assert.deepEqual(h.state.comprehensiveExamination![0], parent);
  }
});

test("absence retries still reject blank or overlong reasons before idempotency", async () => {
  const h = workflowHarness(); await h.ready(); const row = h.state.comprehensiveRosterEntry![0]!;
  const first = await h.service.absent("exam", row.registrationId, "Absent");
  const absence = structuredClone(first); const audits = structuredClone(h.state.auditLog);
  const parent = structuredClone(h.state.comprehensiveExamination![0]);
  for (const reason of ["", " \t\r\n ", "x".repeat(2001)]) {
    assert.throws(() => h.service.absent("exam", row.registrationId, reason), BadRequestException);
    assert.deepEqual(h.state.comprehensiveAbsence, [absence]);
    assert.deepEqual(h.state.auditLog, audits);
    assert.deepEqual(h.state.comprehensiveExamination![0], parent);
  }
});

test("required audit failure rolls back mark and freeze together", async () => {
  const h = workflowHarness(); await h.ready("CHAIRMAN_ONLY"); h.flags.auditFailure = true;
  await assert.rejects(h.service.save("exam", h.state.comprehensiveRosterEntry![0]!.id, { mark: "2" }, true), /audit/);
  assert.equal(h.state.comprehensiveMark!.length, 0); assert.equal(h.state.comprehensiveExamination![0]!.status, "CONFIGURED");
});
test("finalisation audit failure rolls back finalisation, results and sources", async () => {
  const h = workflowHarness(); await h.ready("CHAIRMAN_ONLY"); await h.markAll(); h.flags.auditFailure = true;
  await assert.rejects(h.service.finalise("exam"), /audit/);
  for (const table of ["comprehensiveFinalisation", "comprehensiveFinalResult", "comprehensiveFinalSource"]) assert.equal(h.state[table]!.length, 0);
  assert.equal(h.state.comprehensiveExamination![0]!.status, "MARKING");
});
test("concurrent identical submissions create one source and one success audit", async () => {
  const h = workflowHarness(); await h.ready("CHAIRMAN_ONLY"); const row = h.state.comprehensiveRosterEntry![0]!;
  const results = await Promise.all([h.service.save("exam", row.id, { mark: "2" }, true), h.service.save("exam", row.id, { mark: "2" }, true)]);
  assert.equal(results[0].id, results[1].id); assert.equal(h.state.comprehensiveMark!.length, 1);
  assert.equal(h.state.auditLog!.filter((a) => a.action === "comprehensive.mark.submitted").length, 1);
});
test("concurrent conflicting submissions never overwrite the winning evidence", async () => {
  const h = workflowHarness(); await h.ready("CHAIRMAN_ONLY"); const row = h.state.comprehensiveRosterEntry![0]!;
  const results = await Promise.allSettled([h.service.save("exam", row.id, { mark: "2" }, true), h.service.save("exam", row.id, { mark: "3" }, true)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1); assert.equal(h.state.comprehensiveMark!.length, 1);
});
test("concurrent duplicate finalisation produces one package and one audit", async () => {
  const h = workflowHarness(); await h.ready("CHAIRMAN_ONLY"); await h.markAll();
  const [a, b] = await Promise.all([h.service.finalise("exam"), h.service.finalise("exam")]); assert.equal(a.id, b.id);
  assert.equal(h.state.auditLog!.filter((v) => v.action === "comprehensive.chairman.finalised").length, 1);
});
test("mark-save versus finalisation preserves the winning final package", async () => {
  const h = workflowHarness(); await h.ready("CHAIRMAN_ONLY"); await h.markAll(); const row = h.state.comprehensiveRosterEntry![0]!;
  const results = await Promise.allSettled([h.service.finalise("exam"), h.service.save("exam", row.id, { mark: "4" }, false)]);
  assert.equal(results[0]!.status, "fulfilled"); assert.equal(results[1]!.status, "rejected");
  assert.ok(h.state.comprehensiveFinalResult!.every((r) => r.mark.eq(1)));
});
test("return-versus-resubmission cannot silently correct without the exact return", async () => {
  const h = workflowHarness(); await h.ready(); await h.markAll(); const mark = h.state.comprehensiveMark!.find((m) => m.seat === "MEMBER_1")!;
  const returning = h.service.returnMark("exam", mark.id, "Review discrepancy");
  h.as("MEMBER_1"); const correcting = h.service.save("exam", mark.rosterEntryId, { mark: "4" }, true);
  const results = await Promise.allSettled([returning, correcting]);
  assert.equal(results[0]!.status, "fulfilled"); assert.equal(results[1]!.status, "rejected");
  assert.ok(h.state.comprehensiveMark!.find((m) => m.id === mark.id)!.mark.eq(2));
});
test("allocation-freeze race is ordered with first mark", async () => {
  const h = workflowHarness(); await h.ready("COURSE_DISTRIBUTED"); h.as("MEMBER_1");
  const marking = h.service.save("exam", h.state.comprehensiveRosterEntry![0]!.id, { mark: "3" }, true);
  h.as("CHAIRMAN"); const allocation = h.service.distribute("exam", h.state.comprehensiveCourse!.map((c) => ({ courseId: c.id, committeeAssignmentId: "appointment-CHAIRMAN" })));
  const results = await Promise.allSettled([marking, allocation]); assert.equal(results[0]!.status, "fulfilled"); assert.equal(results[1]!.status, "rejected");
});
test("audit context contains structural identifiers, never entered/derived marks", async () => {
  const h = workflowHarness(); await h.ready(); await h.markAll(); await h.service.finalise("exam");
  for (const audit of h.state.auditLog!) {
    const json = JSON.stringify(audit.contextJson);
    assert.doesNotMatch(json, /"(mark|average|password|passwordHash|accessToken|refreshToken)"/);
  }
});

type Harness = ReturnType<typeof workflowHarness>;
function replaceChairman(h: Harness) {
  const previous = h.assignments.find((a) => a.seat === "CHAIRMAN" && a.status === "ACTIVE")!;
  previous.status = "UNASSIGNED";
  const next = { ...previous, id: "chairman-successor", assignedUserId: "successor", status: "ACTIVE", assignedAt: new Date("2026-09-01") };
  h.assignments.push(next); h.as("successor"); return next;
}
function allocations(h: Harness, target = "appointment-CHAIRMAN") {
  return h.state.comprehensiveCourse!.map((c) => ({ courseId: c.id, committeeAssignmentId: target }));
}
function mappings(h: Harness) {
  return h.state.comprehensiveCourse!.map((c) => ({ comprehensiveCourseId: c.id, examinationCourseId: c.examinationCourseId,
    assignedCommitteeAssignmentId: c.assignedCommitteeAssignmentId, allocatedAssignmentAssignedAt: c.allocatedAssignmentAssignedAt?.toISOString() ?? null,
    allocationChangedByUserId: c.allocationChangedByUserId, allocationChangedByAssignmentId: c.allocationChangedByAssignmentId,
    allocationChangedByAssignmentAssignedAt: c.allocationChangedByAssignmentAssignedAt?.toISOString() ?? null,
  })).sort((a, b) => a.examinationCourseId.localeCompare(b.examinationCourseId) || a.comprehensiveCourseId.localeCompare(b.comprehensiveCourseId));
}
function startProvenance(h: Harness) {
  const c = h.state.comprehensiveExamination![0]!;
  return { markingStartedAt: c.markingStartedAt, markingStartedByUserId: c.markingStartedByUserId,
    markingStartedByAssignmentId: c.markingStartedByAssignmentId, markingStartedByAssignmentAssignedAt: c.markingStartedByAssignmentAssignedAt,
    markingStartedExternalAccessId: c.markingStartedExternalAccessId };
}

test("configuration history preserves Chairman A when Chairman B reconfigures and unchanged calls add no history", async () => {
  const h = workflowHarness(); await h.ready(); const c = h.state.comprehensiveExamination![0]!;
  const expected = { comprehensiveId: c.id, examinationId: "exam", committeeId: "committee", candidateListId: c.candidateListId,
    examDate: "2026-09-21T00:00:00.000Z", mode: "ALL_MEMBERS_AVERAGE", ruleVersionCode: "LLB_2025",
    configuredByUserId: "CHAIRMAN", configuredAssignmentId: "appointment-CHAIRMAN", configuredAssignmentAssignedAt: "2026-01-01T00:00:00.000Z" };
  const created = h.state.auditLog!.find((a) => a.action === "comprehensive.configured")!;
  assert.deepEqual(created.contextJson, { changeType: "CREATED", previous: null, current: expected,
    committeeAssignmentId: "appointment-CHAIRMAN", externalAccessId: null });
  const saved = structuredClone(h.state.auditLog); const next = replaceChairman(h);
  await h.service.configure("exam", { mode: "CHAIRMAN_ONLY", examDate: "2026-09-22" });
  const audit = h.state.auditLog!.at(-1)!;
  assert.deepEqual(audit.contextJson.previous, expected);
  assert.deepEqual(audit.contextJson.current, { ...expected, mode: "CHAIRMAN_ONLY", examDate: "2026-09-22T00:00:00.000Z",
    configuredByUserId: "successor", configuredAssignmentId: next.id, configuredAssignmentAssignedAt: next.assignedAt.toISOString() });
  assert.deepEqual(h.state.auditLog!.slice(0, saved!.length), saved);
  assert.equal(c.configuredByUserId, "successor"); assert.equal(c.configuredAssignmentId, next.id);
  const count = h.state.auditLog!.length;
  await h.service.configure("exam", { mode: "CHAIRMAN_ONLY", examDate: "2026-09-22" });
  assert.equal(h.state.auditLog!.length, count);
});

test("distribution snapshots preserve targets separately from allocating Chairman and successor clearing", async () => {
  const h = workflowHarness(); await h.ready("COURSE_DISTRIBUTED");
  const first = h.state.auditLog!.find((a) => a.action === "comprehensive.distribution.configured")!;
  assert.ok(first.contextJson.previous.every((c: any) => c.assignedCommitteeAssignmentId === null && c.allocationChangedByUserId === null));
  assert.deepEqual(first.contextJson.current, mappings(h));
  assert.ok(h.state.comprehensiveCourse!.every((c) => c.allocationChangedByUserId === "CHAIRMAN" && c.allocationChangedByAssignmentId === "appointment-CHAIRMAN"));
  assert.notEqual(first.contextJson.current[0].assignedCommitteeAssignmentId, first.contextJson.current[0].allocationChangedByAssignmentId);
  await h.service.distribute("exam", allocations(h)); // Self-allocation still records the distinct roles.
  const before = mappings(h); const historical = structuredClone(first); const next = replaceChairman(h);
  h.state.comprehensiveCourse!.reverse();
  await h.service.distribute("exam", allocations(h, "appointment-MEMBER_2"));
  const redistributed = h.state.auditLog!.at(-1)!.contextJson;
  assert.deepEqual(redistributed.previous, before); assert.deepEqual(redistributed.current, mappings(h));
  assert.ok(redistributed.current.every((c: any) => c.assignedCommitteeAssignmentId === "appointment-MEMBER_2" &&
    c.allocationChangedByUserId === "successor" && c.allocationChangedByAssignmentId === next.id && c.allocationChangedByAssignmentAssignedAt === next.assignedAt.toISOString()));
  const allocated = mappings(h);
  await h.service.configure("exam", { mode: "ALL_MEMBERS_AVERAGE", examDate: "2026-09-21" });
  const cleared = h.state.auditLog!.filter((a) => a.action === "comprehensive.distribution.configured").at(-1)!.contextJson;
  assert.equal(cleared.changeType, "CLEARED"); assert.deepEqual(cleared.previous, allocated); assert.deepEqual(cleared.current, mappings(h));
  assert.ok(cleared.current.every((c: any) => c.assignedCommitteeAssignmentId === null && c.allocatedAssignmentAssignedAt === null && c.allocationChangedByAssignmentId === next.id));
  assert.deepEqual(first, historical);
  h.as("CHAIRMAN"); await assert.rejects(h.service.distribute("exam", allocations(h)));
});

for (const operation of ["redistribute", "clear", "reconfigure"] as const) test(`${operation} audit failure rolls control state and provenance back`, async () => {
  const h = workflowHarness(); await h.ready("COURSE_DISTRIBUTED"); replaceChairman(h);
  const courses = mappings(h); const parent = { ...h.state.comprehensiveExamination![0] }; const audits = structuredClone(h.state.auditLog);
  h.flags.auditFailure = true;
  await assert.rejects(operation === "redistribute" ? h.service.distribute("exam", allocations(h, "appointment-MEMBER_2")) :
    h.service.configure("exam", { mode: operation === "clear" ? "CHAIRMAN_ONLY" : "COURSE_DISTRIBUTED", examDate: "2026-09-22" }), /audit/);
  assert.deepEqual(mappings(h), courses); assert.deepEqual(h.state.comprehensiveExamination![0], parent); assert.deepEqual(h.state.auditLog, audits);
});

test("successor Chairman locks exact REGULAR roster once with package provenance", async () => {
  const h = workflowHarness(); await h.ready("ALL_MEMBERS_AVERAGE", false); const next = replaceChairman(h);
  const rows = await h.service.roster("exam"); const c = h.state.comprehensiveExamination![0]!;
  assert.equal(rows.length, 2); assert.equal(c.rosterLockedByUserId, "successor"); assert.equal(c.rosterLockedByAssignmentId, next.id);
  assert.deepEqual(c.rosterLockedByAssignmentAssignedAt, next.assignedAt);
  assert.equal(c.configuredByUserId, "CHAIRMAN");
  for (const row of rows) {
    assert.equal(h.state.examinationCandidateRegistration!.find((r) => r.id === row.registrationId)!.category, "REGULAR");
    assert.equal("rosterLockedByUserId" in row, false);
  }
  assert.deepEqual(h.state.auditLog!.at(-1)!.contextJson, { comprehensiveId: c.id, examinationId: "exam", count: 2,
    rosterLockedAt: c.rosterLockedAt.toISOString(), rosterLockedByUserId: "successor", rosterLockedByAssignmentId: next.id,
    rosterLockedByAssignmentAssignedAt: next.assignedAt.toISOString(), committeeAssignmentId: next.id, externalAccessId: null });
  const before = { ...c }; const count = h.state.auditLog!.length;
  await h.service.roster("exam"); assert.deepEqual(c, before); assert.equal(h.state.auditLog!.length, count);
  h.as("CHAIRMAN"); await assert.rejects(h.service.roster("exam"));
});

for (const actor of ["MEMBER_1", "EXTERNAL_MEMBER", "admin"]) test(`${actor} cannot lock roster with coarse configuration permission`, async () => {
  const h = workflowHarness(); await h.ready("ALL_MEMBERS_AVERAGE", false); h.as(actor, [P.CONFIGURE]);
  await assert.rejects(h.service.roster("exam")); assert.equal(h.state.comprehensiveRosterEntry!.length, 0);
});
test("roster audit failure restores source rows, lock timestamp and all lock provenance", async () => {
  const h = workflowHarness(); await h.ready("ALL_MEMBERS_AVERAGE", false);
  const before = { ...h.state.comprehensiveExamination![0] }; const audits = structuredClone(h.state.auditLog); h.flags.auditFailure = true;
  await assert.rejects(h.service.roster("exam"), /audit/);
  assert.equal(h.state.comprehensiveRosterEntry!.length, 0); assert.deepEqual(h.state.comprehensiveExamination![0], before); assert.deepEqual(h.state.auditLog, audits);
});

for (const actor of ["MEMBER_1", "CHAIRMAN", "EXTERNAL_MEMBER"]) test(`${actor} first mark records actual starter and later evidence cannot overwrite it`, async () => {
  const h = workflowHarness(); await h.ready(); h.as(actor);
  await h.service.save("exam", h.state.comprehensiveRosterEntry![0]!.id, { mark: "3" }, true);
  const first = startProvenance(h);
  assert.deepEqual(first, { markingStartedAt: first.markingStartedAt, markingStartedByUserId: actor,
    markingStartedByAssignmentId: `appointment-${actor}`, markingStartedByAssignmentAssignedAt: new Date("2026-01-01"),
    markingStartedExternalAccessId: actor === "EXTERNAL_MEMBER" ? "access" : null });
  assert.ok(first.markingStartedAt instanceof Date);
  assert.equal(h.state.comprehensiveExamination![0]!.configuredByUserId, "CHAIRMAN");
  const audit = h.state.auditLog!.find((a) => a.action === "comprehensive.mode.frozen")!;
  assert.deepEqual(audit.contextJson, { comprehensiveId: h.state.comprehensiveExamination![0]!.id, examinationId: "exam", mode: "ALL_MEMBERS_AVERAGE",
    ...first, markingStartedAt: first.markingStartedAt.toISOString(), markingStartedByAssignmentAssignedAt: first.markingStartedByAssignmentAssignedAt.toISOString(),
    committeeAssignmentId: `appointment-${actor}`, externalAccessId: actor === "EXTERNAL_MEMBER" ? "access" : null });
  h.as("MEMBER_2"); await h.service.save("exam", h.state.comprehensiveRosterEntry![1]!.id, { mark: "4" }, true);
  assert.deepEqual(startProvenance(h), first);
  assert.equal(h.state.auditLog!.filter((a) => a.action === "comprehensive.mode.frozen").length, 1);
});
test("successor Chairman absence starts marking with review provenance, separately from configurator", async () => {
  const h = workflowHarness(); await h.ready(); const next = replaceChairman(h); h.as("successor", [P.REVIEW]);
  await h.service.absent("exam", h.state.comprehensiveRosterEntry![0]!.registrationId, "Did not attend");
  assert.equal(startProvenance(h).markingStartedByUserId, "successor"); assert.equal(startProvenance(h).markingStartedByAssignmentId, next.id);
  assert.deepEqual(startProvenance(h).markingStartedByAssignmentAssignedAt, next.assignedAt);
  assert.equal(startProvenance(h).markingStartedExternalAccessId, null); assert.equal(h.state.comprehensiveMark!.length, 0);
});
for (const operation of ["mark", "absence"] as const) test(`${operation} evidence audit failure rolls first-start provenance and evidence back together`, async () => {
  const h = workflowHarness(); await h.ready(); const before = { ...h.state.comprehensiveExamination![0] }; const audits = structuredClone(h.state.auditLog);
  const create = h.tx.auditLog.create;
  h.tx.auditLog.create = async (args: any) => {
    if (args.data.action === (operation === "mark" ? "comprehensive.mark.submitted" : "comprehensive.absence.recorded")) throw new Error("required evidence audit unavailable");
    return create(args);
  };
  const row = h.state.comprehensiveRosterEntry![0]!;
  await assert.rejects(operation === "mark" ? h.service.save("exam", row.id, { mark: "2" }, true) : h.service.absent("exam", row.registrationId, "Absent"), /audit/);
  assert.deepEqual(h.state.comprehensiveExamination![0], before); assert.deepEqual(h.state.auditLog, audits);
  assert.equal(h.state.comprehensiveMark!.length, 0); assert.equal(h.state.comprehensiveAbsence!.length, 0);
});
for (const operation of ["mark", "absence"] as const) test(`${operation} first evidence insert failure rolls parent transition and start audit back`, async () => {
  const h = workflowHarness(); await h.ready();
  const before = { ...h.state.comprehensiveExamination![0] }; const audits = structuredClone(h.state.auditLog);
  const model = operation === "mark" ? h.tx.comprehensiveMark : h.tx.comprehensiveAbsence;
  model.create = async () => {
    assert.equal(h.state.comprehensiveExamination![0]!.status, "MARKING");
    assert.equal(startProvenance(h).markingStartedByUserId, "CHAIRMAN");
    throw new Error("first evidence insert failed");
  };
  const row = h.state.comprehensiveRosterEntry![0]!;
  await assert.rejects(operation === "mark" ? h.service.save("exam", row.id, { mark: "2" }, true) : h.service.absent("exam", row.registrationId, "Absent"), /first evidence insert failed/);
  assert.deepEqual(h.state.comprehensiveExamination![0], before); assert.deepEqual(h.state.auditLog, audits);
  assert.equal(h.state.comprehensiveMark!.length, 0); assert.equal(h.state.comprehensiveAbsence!.length, 0);
});
for (const stale of ["revoked", "expired", "replaced"] as const) test(`${stale} first-mark appointment cannot establish start provenance`, async () => {
  const h = workflowHarness(); await h.ready(); const a = h.assignments.find((a) => a.seat === "MEMBER_1")!;
  if (stale === "expired") a.expiresAt = new Date("2020-01-01");
  else { a.status = "UNASSIGNED"; if (stale === "replaced") h.assignments.push({ ...a, id: "new-member", assignedUserId: "new-member", status: "ACTIVE" }); }
  h.as("MEMBER_1"); await assert.rejects(h.service.save("exam", h.state.comprehensiveRosterEntry![0]!.id, { mark: "2" }, true));
  assert.equal(startProvenance(h).markingStartedAt, null);
});
for (const state of ["revoked", "expired"] as const) test(`${state} External binding cannot become marking starter`, async () => {
  const h = workflowHarness(); await h.ready(); const binding = h.state.externalComprehensiveAccess![0]!;
  if (state === "revoked") binding.revokedAt = new Date(); else binding.expiresAt = new Date("2020-01-01");
  h.as("EXTERNAL_MEMBER"); await assert.rejects(h.service.save("exam", h.state.comprehensiveRosterEntry![0]!.id, { mark: "2" }, true));
  assert.equal(startProvenance(h).markingStartedAt, null);
});
