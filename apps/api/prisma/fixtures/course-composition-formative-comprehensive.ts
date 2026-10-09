/**
 * Disposable PostgreSQL-only genuine four-member Comprehensive /5 evidence and
 * automatic Final Formative /40 materialisation. Intended AFTER real Summative,
 * certified Activities and Attendance fixture owner-services have run.
 * NEVER seed protected final results, marks, external access, or audit events.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { RequestContextService } from '../../src/common/request-context/request-context.service';
import { PrincipalLoaderService } from '../../src/modules/authorization/services/principal-loader.service';
import { EvidenceAccessService } from '../../src/common/academic-evidence/evidence-access.service';
import { EXAMINATION_PERMISSION_DEFINITIONS, EXAMINATION_POLICIES as P } from '../../src/common/authorization/examination-policies';
import { ExaminationContextService } from '../../src/modules/summative-examination/examination-context.service';
import { ExaminationStudentContextService } from '../../src/modules/academic/examination-student-context.service';
import { ExaminationRegistrationService } from '../../src/modules/examination-registration/examination-registration.service';
import { ExaminationAuthorityService } from '../../src/modules/examination-registration/examination-authority.service';
import { PasswordHasherService } from '../../src/modules/identity-access/infrastructure/password-hasher.service';
import { ComprehensiveExaminationService } from '../../src/modules/assessment/application/services/comprehensive-examination.service';
import { FinalFormativeService } from '../../src/modules/final-formative/final-formative.service';
import { CourseResultCompositionService } from '../../src/modules/course-result-composition/course-result-composition.service';
import { PRODUCTION_CASES, PRODUCTION_FIXTURE_INPUTS, fixtureIds } from './course-composition-production-baseline';

const dept = 'crc_fixture_law';
const operator = 'crc_fixture_operator';
const ctx = new RequestContextService();
const fixture = (key: string, suffix: string) => `crc_fixture_${key}_${suffix}`;
const exp = '2027-12-31T00:00:00.000Z';

async function asUser<T>(db: PrismaClient, actorId: string, work: () => Promise<T>): Promise<T> {
  const principal = await new PrincipalLoaderService(db as never).loadPrincipal(actorId);
  assert.ok(principal?.isAuthenticated && principal.actorType === 'user' &&
    principal.activeDepartmentId === dept, 'Exact synthetic department principal required');
  return ctx.run({ requestId: `crc-comprehensive-${actorId}`, method: 'POST',
    path: '/synthetic-comprehensive', principal,
    department: { kind: 'department', departmentId: dept, source: 'principal' },
    audit: { requestId: `crc-comprehensive-${actorId}`, departmentId: dept },
  }, work);
}

async function gate(db: PrismaClient) {
  const target = new URL(process.env.LEXORA_CRC_FOUNDATION_DATABASE_URL ?? '');
  const expected = process.env.LEXORA_CRC_FOUNDATION_EXPECTED_DATABASE;
  assert.equal(process.env.LEXORA_CRC_FOUNDATION_CONFIRM, 'YES_DISPOSABLE_SYNTHETIC_FOUNDATION');
  assert.ok(expected && /^crc_[a-zA-Z0-9_]+_test$/.test(expected));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
  assert.equal(decodeURIComponent(target.pathname.slice(1)), expected);
  assert.equal(target.searchParams.get('schema'), 'public');
  const server = await db.$queryRaw<Array<{ name: string; version: string; composition: string | null }>>`
    SELECT current_database() AS name, current_setting('server_version_num') AS version,
      to_regclass('public.course_result_compositions')::text AS composition`;
  assert.equal(server[0]?.name, expected);
  assert.equal(server[0]?.version, '180006');
  assert.equal(server[0]?.composition, 'course_result_compositions', 'New /100 migration must precede Comprehensive finalise');
  assert.equal(await db.examination.count({ where: { departmentId: dept } }), 6);
  assert.equal(await db.summativeCalculatedMark.count({ where: { departmentId: dept } }), 6);
  assert.equal(await db.examinationCandidateList.count({ where: { departmentId: dept, status: 'CERTIFIED' } }), 6);
  assert.equal(await db.formativeActivitiesFinalResult.count(), 6);
  assert.equal(await db.formativeAttendanceVersion.count(), 6);
  assert.equal(await db.comprehensiveMark.count(), 0);
  assert.equal(await db.comprehensiveFinalisation.count(), 0);
  assert.equal(await db.formativeFinalResult.count(), 0);
  assert.equal(await db.summativeChairmanApproval.count(), 0);
  assert.equal(await db.courseResultComposition.count(), 0);
}

/** Only add TEST fixture roles required by actual services; never grant a policy wildcard. */
async function setupSyntheticCoarseGrants(db: PrismaClient) {
  await db.$transaction(async tx => {
    for (const [roleId, policy] of [
      ['crc_fixture_department_admin_role', P.APPOINT],
      ['crc_fixture_teacher_role', P.CONFIGURE],
      ['crc_fixture_teacher_role', P.MARK],
      ['crc_fixture_teacher_role', P.REVIEW],
      ['crc_fixture_teacher_role', P.FINALISE],
    ] as const) {
      const def = EXAMINATION_PERMISSION_DEFINITIONS.find(d => `${d.resource}.${d.action}` === policy);
      assert.ok(def);
      const permission = await tx.permission.upsert({ where: { code: def.code },
        create: { code: def.code, resource: def.resource, action: def.action, scope: 'DEPARTMENT' }, update: {} });
      assert.equal(permission.scope, 'DEPARTMENT');
      assert.equal(permission.resource, def.resource);
      assert.equal(permission.action, def.action);
      await tx.rolePermission.upsert({ where: { roleId_permissionId: { roleId, permissionId: permission.id } },
        create: { roleId, permissionId: permission.id }, update: {} });
    }
  }, { timeout: 30000 });
}

export async function createSyntheticComprehensiveThroughOwners(db: PrismaClient) {
  await gate(db);
  await setupSyntheticCoarseGrants(db);
  const access = new EvidenceAccessService(ctx);
  const examinations = new ExaminationContextService();
  const registration = new ExaminationRegistrationService(db as never, access, examinations,
    new ExaminationStudentContextService());
  const authority = new ExaminationAuthorityService(db as never, access, examinations,
    new PasswordHasherService());
  const formative = new FinalFormativeService(db as never, new CourseResultCompositionService());
  const comprehensive = new ComprehensiveExaminationService(db as never, access, examinations,
    registration, formative);

  const report: Array<{ key: string; comprehensive: string; total40: string }> = [];
  for (const { key, formative: expected40 } of PRODUCTION_CASES) {
    const recipe = PRODUCTION_FIXTURE_INPUTS.find(x => x.key === key);
    assert.ok(recipe && recipe.comprehensiveMode === 'ALL_MEMBERS_AVERAGE');
    assert.equal(recipe.comprehensiveSeatMarks.length, 4);
    const id = fixtureIds(key);
    const chairman = fixture(key, 'chairman');
    const members = [chairman, fixture(key, 'member1'), fixture(key, 'member2')] as const;
    const assignment = await db.examinationCommitteeAssignment.findFirst({
      where: { committee: { examinationId: id.examinationId }, seat: 'EXTERNAL_MEMBER', status: 'ACTIVE' },
    });
    assert.ok(assignment?.externalMemberName && assignment.externalMemberAffiliation && !assignment.assignedUserId);

    console.log(`CRC_COMPREHENSIVE_STAGE=${key}:EXTERNAL_ACCESS_PROVISION`);
    // Credential exists only transiently in memory; no real password, hash or token is printed.
    const binding = await asUser(db, operator, () => authority.provisionExternal(id.examinationId, assignment.id, {
      email: `crc-${key}-external@crc-fixture.invalid`, displayName: 'Synthetic External Member',
      expiresAt: exp, sourceReference: 'Synthetic disposable official appointment',
      temporaryPassword: `A9!z${randomBytes(16).toString('hex')}`,
    }));
    const exam = await asUser(db, chairman, () => comprehensive.configure(id.examinationId, {
      mode: 'ALL_MEMBERS_AVERAGE', examDate: '2026-10-09T09:00:00.000Z',
    }));
    assert.equal(exam.mode, 'ALL_MEMBERS_AVERAGE');
    console.log(`CRC_COMPREHENSIVE_STAGE=${key}:CERTIFIED_ROSTER_LOCK`);
    const roster = await asUser(db, chairman, () => comprehensive.roster(id.examinationId));
    assert.equal(roster.length, 1);
    const entry = roster[0];
    assert.ok(entry);
    for (const [index, actor] of [...members, binding.userId].entries()) {
      const mark = recipe.comprehensiveSeatMarks[index];
      assert.ok(mark !== undefined);
      console.log(`CRC_COMPREHENSIVE_STAGE=${key}:SEAT_${index + 1}_SUBMIT`);
      await asUser(db, actor, () => comprehensive.save(id.examinationId, entry.id, { mark }, true));
    }
    console.log(`CRC_COMPREHENSIVE_STAGE=${key}:CHAIRMAN_FINALISE_AND_AUTO_40`);
    await asUser(db, chairman, () => comprehensive.finalise(id.examinationId));
    const [results, totals] = await Promise.all([
      db.comprehensiveFinalResult.findMany({ where: { rosterEntry: { comprehensiveId: exam.id } } }),
      db.formativeFinalResult.findMany({ where: { departmentId: dept, examinationId: id.examinationId,
        examinationCourseId: id.examinationCourseId, enrollmentId: id.enrollmentId } }),
    ]);
    assert.equal(results.length, 1);
    assert.equal(totals.length, 1);
    const mean = recipe.comprehensiveSeatMarks.reduce((sum, value) => sum.plus(new Prisma.Decimal(value)),
      new Prisma.Decimal(0)).div(4);
    assert.ok(results[0]!.mark.eq(mean), `Incorrect immutable /5: ${key}`);
    assert.ok(totals[0]!.mark.eq(expected40), `Incorrect authoritative /40: ${key}`);
    assert.equal(await db.comprehensiveFinalSource.count({ where: { resultId: results[0]!.id } }), 4);
    report.push({ key, comprehensive: mean.toFixed(6), total40: totals[0]!.mark.toFixed(6) });
  }
  assert.equal(report.length, 6);
  assert.equal(await db.comprehensiveFinalisation.count(), 6);
  assert.equal(await db.comprehensiveFinalResult.count(), 6);
  assert.equal(await db.comprehensiveFinalSource.count(), 24);
  assert.equal(await db.formativeFinalResult.count(), 6);
  assert.equal(await db.summativeChairmanApproval.count(), 0);
  assert.equal(await db.courseResultComposition.count(), 0);
  return report;
}
