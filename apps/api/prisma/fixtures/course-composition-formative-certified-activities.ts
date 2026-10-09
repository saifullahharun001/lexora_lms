/**
 * Disposable-only CRC source-owner fixture stage: certified REGULAR list +
 * genuine Formative Activities /30, with audit and a live Chairman finalisation.
 * NOT the full Formative /40, approved synthetic baseline, or a production seed.
 * Caller MUST run after real Summative pre-terminal stage in a disposable DB.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { RequestContextService } from '../../src/common/request-context/request-context.service';
import { PrincipalLoaderService } from '../../src/modules/authorization/services/principal-loader.service';
import { EvidenceAccessService } from '../../src/common/academic-evidence/evidence-access.service';
import { ExaminationContextService } from '../../src/modules/summative-examination/examination-context.service';
import { ExaminationStudentContextService } from '../../src/modules/academic/examination-student-context.service';
import { ExaminationRegistrationService } from '../../src/modules/examination-registration/examination-registration.service';
import { AuthorizationService } from '../../src/modules/authorization/services/authorization.service';
import { FormativeAssessmentService } from '../../src/modules/assessment/application/services/formative-assessment.service';
import { FormativeActivitiesFinalisationAuthorizerService } from '../../src/modules/assessment/application/services/formative-activities-finalisation-authorizer.service';
import { FormativeActivitiesFinalisationService } from '../../src/modules/assessment/application/services/formative-activities-finalisation.service';
import { FinalFormativeService } from '../../src/modules/final-formative/final-formative.service';
import { CourseResultCompositionService } from '../../src/modules/course-result-composition/course-result-composition.service';
import { PRODUCTION_CASES, PRODUCTION_FIXTURE_INPUTS, fixtureIds } from './course-composition-production-baseline';

const departmentId = 'crc_fixture_law';
const actorPoe = 'crc_fixture_poe';
const cases = PRODUCTION_CASES;
const ctx = new RequestContextService();
const fixture = (key: string, suffix: string) => `crc_fixture_${key}_${suffix}`;

async function asUser<T>(db: PrismaClient, userId: string, fn: () => Promise<T>): Promise<T> {
  const principal = await new PrincipalLoaderService(db as never).loadPrincipal(userId);
  assert.ok(principal?.isAuthenticated && principal.actorType === 'user' &&
    principal.activeDepartmentId === departmentId, 'Synthetic principal must be in test department');
  return ctx.run({ requestId: `crc-formative-${userId}`, method: 'POST',
    path: '/synthetic-formative', principal,
    department: { kind: 'department', departmentId, source: 'principal' },
    audit: { requestId: `crc-formative-${userId}`, departmentId },
  }, fn);
}

/** Synthetic structural prerequisites only, never protected academic evidence or success audits. */
async function establishSyntheticRolesAndAssignments(db: PrismaClient) {
  await db.$transaction(async (tx) => {
    await tx.permission.create({ data: {
      id: 'crc_fixture_poe_classify_permission',
      code: 'examination-candidate.classification.manage_department',
      resource: 'examination-candidate.classification', action: 'manage', scope: 'DEPARTMENT',
    } });
    await tx.rolePermission.create({ data: {
      id: 'crc_fixture_poe_classify_grant', roleId: 'crc_fixture_poe_role',
      permissionId: 'crc_fixture_poe_classify_permission',
    } });
    await tx.permission.create({ data: {
      id: 'crc_fixture_activities_finalise_permission', code: 'formative.activities.finalise_department',
      resource: 'formative.activities', action: 'finalise', scope: 'DEPARTMENT',
    } });
    await tx.rolePermission.create({ data: {
      id: 'crc_fixture_activities_finalise_grant', roleId: 'crc_fixture_teacher_role',
      permissionId: 'crc_fixture_activities_finalise_permission',
    } });
    for (const { key } of cases) {
      // This is a synthetic structural teaching duty, not a fabricated mark or audit.
      // The real FormativeAssessmentService independently enforces its live binding.
      await tx.teacherCourseAssignment.create({ data: {
        id: fixture(key, 'teacher_course_assignment'), departmentId,
        courseOfferingId: fixture(key, 'offering'),
        teacherUserId: fixture(key, 'chairman'), roleCode: 'primary_instructor', status: 'ACTIVE',
      } });
    }
  }, { timeout: 30000 });
}

export async function certifyAndFinaliseSyntheticActivities(db: PrismaClient) {
  const target = new URL(process.env.LEXORA_CRC_FOUNDATION_DATABASE_URL ?? '');
  const expected = process.env.LEXORA_CRC_FOUNDATION_EXPECTED_DATABASE;
  const actual = await db.$queryRaw<Array<{ name: string; version: string; composition: string | null }>>`
    SELECT current_database() AS name, current_setting('server_version_num') AS version,
      to_regclass('public.course_result_compositions')::text AS composition`;
  assert.equal(process.env.LEXORA_CRC_FOUNDATION_CONFIRM, 'YES_DISPOSABLE_SYNTHETIC_FOUNDATION');
  assert.ok(expected && /^crc_[a-zA-Z0-9_]+_test$/.test(expected));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
  assert.equal(decodeURIComponent(target.pathname.slice(1)), expected);
  assert.equal(actual[0]?.name, expected);
  assert.equal(actual[0]?.version, '180006');
  assert.equal(actual[0]?.composition, null, 'Only pre-composition disposable schema is permitted');
  assert.equal(await db.examination.count({ where: { departmentId } }), 6);
  assert.equal(await db.summativeCalculatedMark.count({ where: { departmentId } }), 6);
  assert.equal(await db.examinationCandidateList.count(), 0);
  assert.equal(await db.formativeActivity.count(), 0);
  assert.equal(await db.formativeActivitiesFinalisation.count(), 0);
  assert.equal(await db.formativeFinalResult.count(), 0);
  assert.equal(await db.summativeChairmanApproval.count(), 0);
  await establishSyntheticRolesAndAssignments(db);
  const access = new EvidenceAccessService(ctx);
  const registrations = new ExaminationRegistrationService(db as never, access,
    new ExaminationContextService(), new ExaminationStudentContextService());
  const formative = new FormativeAssessmentService(db as never, ctx, new AuthorizationService());
  const finalFormative = new FinalFormativeService(db as never, new CourseResultCompositionService());
  const activities = new FormativeActivitiesFinalisationService(db as never, ctx,
    new FormativeActivitiesFinalisationAuthorizerService(db as never, ctx), finalFormative);
  const manifest: Array<{ key: string; activitiesMark: string; certified: boolean }> = [];
  for (const scenario of cases) {
    const key = scenario.key;
    const recipe = PRODUCTION_FIXTURE_INPUTS.find(x => x.key === key);
    assert.ok(recipe, `Missing source recipe for ${key}`);
    const fixed = fixtureIds(key);
    const offering = fixture(key, 'offering');
    const teacherId = fixture(key, 'chairman');
    console.log(`CRC_FORMATIVE_STAGE=${key}:CANDIDATE_CERTIFICATION`);
    await asUser(db, actorPoe, async () => {
      await registrations.createList(fixed.examinationId, 'CRC synthetic classification');
      await registrations.putCandidate(fixed.examinationId, {
        studentUserId: fixture(key, 'student'),
        curriculumAssignmentId: fixture(key, 'assignment'), category: 'REGULAR',
      });
      await registrations.certify(fixed.examinationId);
    });
    console.log(`CRC_FORMATIVE_STAGE=${key}:ACTIVITY_OWNER_MARKING`);
    await asUser(db, teacherId, async () => {
      const activity = await formative.createActivity(offering, {
        title: 'CRC synthetic assessed activity', method: 'CLASS_TEST',
        rawMaximum: '30', assignedWeight: '30',
      });
      await formative.startMarking(offering, activity.id);
      await formative.saveMark(offering, activity.id, fixed.enrollmentId, {
        rawMark: recipe.activities, feedback: 'Synthetic completed academic feedback',
        feedbackCompleted: true, integrityStatus: 'CLEAR',
      });
      await formative.submitActivity(offering, activity.id);
    });
    console.log(`CRC_FORMATIVE_STAGE=${key}:CHAIRMAN_ACTIVITIES_FINALISATION`);
    await asUser(db, teacherId, () => activities.finalise(fixed.examinationCourseId));
    const list = await db.examinationCandidateList.findFirst({ where: { examinationId: fixed.examinationId } });
    const result = await db.formativeActivitiesFinalResult.findFirst({
      where: { enrollmentId: fixed.enrollmentId },
    });
    assert.equal(list?.status, 'CERTIFIED');
    assert.ok(list?.certifiedAt && list.chairmanAssignmentId);
    assert.ok(result, `Real Chairman Activities finalisation missing: ${key}`);
    assert.equal(result.mark.toFixed(2), Number(recipe.activities).toFixed(2));
    manifest.push({ key, activitiesMark: result.mark.toFixed(2), certified: true });
  }
  assert.equal(manifest.length, 6);
  assert.equal(await db.examinationCandidateList.count(), 6);
  assert.equal(await db.formativeActivitiesFinalisation.count(), 6);
  assert.equal(await db.formativeActivitiesFinalResult.count(), 6);
  assert.equal(await db.formativeFinalResult.count(), 0);
  assert.equal(await db.summativeChairmanApproval.count(), 0);
  return manifest;
}
