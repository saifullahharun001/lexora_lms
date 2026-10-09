/**
 * Synthetic-only PRE-TERMINAL Summative fixture builder for a fresh, disposable CRC test database.
 * Caller MUST establish the isolated test DB, verify migration history, run the foundation seeder,
 * and enforce the explicit opt-in before invoking this function. Never invokes Chairman approval.
 * Authority, appointments, roster, marking, comparison and calculation use real Lexora services.
 * No immutable calculated mark / review / approval / audit is directly inserted here.
 */
import "reflect-metadata";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { RequestContextService } from "../../src/common/request-context/request-context.service";
import { PrincipalLoaderService } from "../../src/modules/authorization/services/principal-loader.service";
import { SummativeManagementAuthorizerService } from "../../src/modules/summative-examination/application/services/summative-management-authorizer.service";
import { ExaminationCommitteeService } from "../../src/modules/summative-examination/application/services/examination-committee.service";
import { ExaminationCourseExaminerAssignmentService } from "../../src/modules/summative-examination/application/services/examination-course-examiner-assignment.service";
import { SummativeCandidateRosterService } from "../../src/modules/summative-examination/application/services/summative-candidate-roster.service";
import { SummativeQuestionConfigurationService } from "../../src/modules/summative-examination/application/services/summative-question-configuration.service";
import { ExaminerAuthorityService } from "../../src/modules/summative-examination/application/services/examiner-authority.service";
import { SummativeExaminerMarksService } from "../../src/modules/summative-examination/application/services/summative-examiner-marks.service";
import { SummativeExaminerComparisonService } from "../../src/modules/summative-examination/application/services/summative-examiner-comparison.service";
import { SummativeCalculatedMarkService } from "../../src/modules/summative-examination/application/services/summative-calculated-mark.service";
import { PRODUCTION_CASES, PRODUCTION_FIXTURE_INPUTS, fixtureIds } from "./course-composition-production-baseline";

const ctx = new RequestContextService();
const departmentId = "crc_fixture_law";
const adminId = "crc_fixture_operator";
const id = (key: string, suffix: string) => `crc_fixture_${key}_${suffix}`;

async function asUser<T>(db: PrismaClient, actorId: string, work: () => Promise<T>): Promise<T> {
  const principal = await new PrincipalLoaderService(db as never).loadPrincipal(actorId);
  assert.ok(principal?.isAuthenticated && principal.activeDepartmentId === departmentId,
    "Only synthetic principals with the exact CRC department can access fixture services");
  return ctx.run({
    requestId: `crc-preterminal-${actorId}`, method: "POST", path: "/synthetic-preterminal",
    principal, department: { kind: "department", departmentId, source: "principal" },
    audit: { requestId: `crc-preterminal-${actorId}`, departmentId },
  }, work);
}

/** Run ONLY on the verified synthetic foundation, within a dedicated disposable *_test DB. */
export async function generateRealSummativePreterminal(db: PrismaClient) {
  // Re-check every prerequisite at the point of execution, before any service writes.
  assert.equal(await db.department.count(), 1);
  assert.equal(await db.examination.count({ where: { departmentId } }), 6);
  assert.equal(await db.examinationCommittee.count({ where: { departmentId } }), 6);
  assert.equal(await db.examinationCommitteeAssignment.count(), 0);
  assert.equal(await db.examinationCourseExaminerAssignment.count(), 0);
  assert.equal(await db.summativeExaminationCandidate.count(), 0);
  assert.equal(await db.summativeCalculatedMark.count(), 0);
  assert.equal(await db.summativeChairmanApproval.count(), 0);
  assert.equal(await db.summativeCommitteeMemberReview.count(), 0);
  const target = new URL(process.env.LEXORA_CRC_FOUNDATION_DATABASE_URL ?? "");
  const expectedDb = process.env.LEXORA_CRC_FOUNDATION_EXPECTED_DATABASE;
  const actualDb = await db.$queryRaw<Array<{ name: string; version: string; composition: string | null }>>`
    SELECT current_database() AS name, current_setting('server_version_num') AS version,
      to_regclass('public.course_result_compositions')::text AS composition`;
  assert.equal(process.env.LEXORA_CRC_FOUNDATION_CONFIRM, "YES_DISPOSABLE_SYNTHETIC_FOUNDATION");
  assert.ok(expectedDb && /^crc_[a-zA-Z0-9_]+_test$/.test(expectedDb));
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname));
  assert.equal(decodeURIComponent(target.pathname.slice(1)), expectedDb);
  assert.equal(actualDb[0]?.name, expectedDb);
  assert.equal(actualDb[0]?.version, "180006");
  assert.equal(actualDb[0]?.composition, null, "Pre-composition schema required");

  const manage = new SummativeManagementAuthorizerService(db as never, ctx);
  const committee = new ExaminationCommitteeService(db as never, ctx, manage);
  const roster = new SummativeCandidateRosterService(db as never, ctx, manage);
  const examinerAssignment = new ExaminationCourseExaminerAssignmentService(db as never, ctx, manage);
  const questions = new SummativeQuestionConfigurationService(db as never, ctx, manage);
  const calculatedMarks = new SummativeCalculatedMarkService(ctx);
  const comparison = new SummativeExaminerComparisonService(ctx, calculatedMarks);
  const examinerAuthority = new ExaminerAuthorityService(db as never, ctx);
  const marks = new SummativeExaminerMarksService(db as never, ctx, examinerAuthority, comparison);

  const manifest: Array<{ case: string; candidateId: string; calculatedMarkId: string; summative: string }> = [];
  for (const scenario of PRODUCTION_CASES) {
    const key = scenario.key;
    const input = PRODUCTION_FIXTURE_INPUTS.find(item => item.key === key);
    assert.ok(input, `Missing source-feasible recipe: ${key}`);
    const fixed = fixtureIds(key);
    const committeeId = id(key, "committee");

    console.log(`CRC_PRETERMINAL_STAGE=${key}:COMMITTEE_APPOINTMENTS`);
    // Every formal appointment uses audited, currently authorized services.
    await asUser(db, adminId, async () => {
      for (const [seat, userId] of [
        ["CHAIRMAN", id(key, "chairman")],
        ["MEMBER_1", id(key, "member1")],
        ["MEMBER_2", id(key, "member2")],
      ] as const) {
        await committee.assignInternalMember({ committeeId, seat, assignedUserId: userId });
      }
      await committee.appointExternalMember({ committeeId,
        externalMemberName: "CRC Test External Member",
        externalMemberAffiliation: "Reserved synthetic fixture institution" });
      assert.equal(await committee.isCommitteeComplete(committeeId), true,
        `Incomplete real Committee appointments: ${key}`);
      console.log(`CRC_PRETERMINAL_STAGE=${key}:EXAMINER_ASSIGNMENTS`);
      await examinerAssignment.assign(fixed.examinationCourseId,
        { seat: "FIRST_EXAMINER", assignedUserId: id(key, "first") });
      await examinerAssignment.assign(fixed.examinationCourseId,
        { seat: "SECOND_EXAMINER", assignedUserId: id(key, "second") });
    });

    console.log(`CRC_PRETERMINAL_STAGE=${key}:CANDIDATE_REGISTRATION`);
    // Registration produces a real service-generated candidate ID. Do NOT forge its value.
    const candidate = await asUser(db, adminId, () =>
      roster.registerCandidate(fixed.examinationCourseId, fixed.enrollmentId));
    assert.equal(candidate.examinationCourseId, fixed.examinationCourseId);
    assert.equal(candidate.enrollmentId, fixed.enrollmentId);

    console.log(`CRC_PRETERMINAL_STAGE=${key}:QUESTION_CONFIGURATION`);
    const configuration = await asUser(db, adminId, async () => {
      const draft = await questions.createDraftConfiguration(fixed.examinationCourseId);
      await questions.addItem(fixed.examinationCourseId, draft.id,
        { questionLabel: "Q1", displayOrder: 1, fullMark: "60", isRequired: true, isActive: true });
      await questions.lockConfiguration(fixed.examinationCourseId, draft.id);
      return db.summativeQuestionConfiguration.findFirstOrThrow({
        where: { id: draft.id, examinationCourseId: fixed.examinationCourseId },
        include: { items: true },
      });
    });
    assert.equal(configuration.items.length, 1);
    const questionId = configuration.items[0]!.id;
    for (const [seat, actor, mark] of [["FIRST", id(key, "first"), input.firstExaminer],
      ["SECOND", id(key, "second"), input.secondExaminer]] as const) {
      await asUser(db, actor, async () => {
        console.log(`CRC_PRETERMINAL_STAGE=${key}:${seat}_EXAMINER_SAVE`);
        await marks.saveQuestionMark(fixed.examinationCourseId, candidate.id, questionId, { awardedMark: mark });
        console.log(`CRC_PRETERMINAL_STAGE=${key}:${seat}_EXAMINER_FINALIZE`);
        await marks.finalizeSubmission(fixed.examinationCourseId, candidate.id);
      });
    }

    console.log(`CRC_PRETERMINAL_STAGE=${key}:CALCULATED_EVIDENCE`);
    const calculated = await db.summativeCalculatedMark.findMany({ where: {
      departmentId, examinationId: fixed.examinationId,
      examinationCourseId: fixed.examinationCourseId, candidateId: candidate.id,
    }, select: { id: true, derivedSummativeValue: true }, take: 2 });
    assert.equal(calculated.length, 1, `Real calculation missing/ambiguous: ${key}`);
    assert.equal(calculated[0]!.derivedSummativeValue.toString(), scenario.summative,
      `Real calculation differs from feasible recipe: ${key}`);
    manifest.push({ case: key, candidateId: candidate.id,
      calculatedMarkId: calculated[0]!.id, summative: scenario.summative });
  }
  assert.equal(manifest.length, 6);
  assert.equal(await db.summativeCommitteeMemberReview.count(), 0);
  assert.equal(await db.summativeChairmanApproval.count(), 0);
  assert.equal(await db.formativeFinalResult.count(), 0);
  return manifest;
}
