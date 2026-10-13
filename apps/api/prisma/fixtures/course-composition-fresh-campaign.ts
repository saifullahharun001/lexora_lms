import 'reflect-metadata';
import assert from 'node:assert/strict';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { isFreshSynthetic } from './course-composition-fresh-gate';
import { PRODUCTION_CASES, fixtureIds } from './course-composition-production-baseline';
import { generateRealSummativePreterminal } from './course-composition-summative-preterminal';
import { certifyAndFinaliseSyntheticActivities } from './course-composition-formative-certified-activities';
import { generateSyntheticAttendanceByRealServices } from './course-composition-formative-attendance';
import { createSyntheticComprehensiveThroughOwners } from './course-composition-formative-comprehensive';
import { approveSyntheticSummativeThroughOwners } from './course-composition-summative-chairman';
import { CourseResultCompositionService } from '../../src/modules/course-result-composition/course-result-composition.service';
import { RequestContextService } from '../../src/common/request-context/request-context.service';
import { PrincipalLoaderService } from '../../src/modules/authorization/services/principal-loader.service';
import { SummativeCommitteeWorkflowService } from '../../src/modules/summative-examination/application/services/summative-committee-workflow.service';
import { SummativeCommitteeWorkflowAuthorizerService } from '../../src/modules/summative-examination/application/services/summative-committee-workflow-authorizer.service';
import { SummativeCalculatedMarkService } from '../../src/modules/summative-examination/application/services/summative-calculated-mark.service';

import { protectedSnapshot } from './course-composition-protected-snapshot';

async function deniedUnchanged(db: PrismaClient, work: () => Promise<unknown>, error?: typeof NotFoundException) {
  const before = await protectedSnapshot(db);
  if (error) await assert.rejects(work, error);
  else await assert.rejects(work);
  assert.equal(await protectedSnapshot(db), before, 'Denied write changed protected evidence or audit');
}
async function verifyResults(db: PrismaClient) {
  const service = new CourseResultCompositionService();
  for (const scenario of PRODUCTION_CASES) {
    const id = fixtureIds(scenario.key);
    const rows = await db.courseResultComposition.findMany({ where: { examinationId: id.examinationId } });
    assert.equal(rows.length, 1);
    const result = rows[0]!;
    const formative = await db.formativeFinalResult.findUniqueOrThrow({ where: { id: result.formativeResultId } });
    const approval = await db.summativeChairmanApproval.findUniqueOrThrow({ where: { id: result.chairmanApprovalId } });
    const calculated = await db.summativeCalculatedMark.findUniqueOrThrow({ where: { id: result.calculatedMarkId } });
    assert.equal(result.enrollmentId, id.enrollmentId);
    assert.equal(result.examinationCourseId, id.examinationCourseId);
    assert.equal(result.formativeResultId, formative.id);
    assert.equal(result.calculatedMarkId, approval.calculatedMarkId);
    assert.equal(result.calculatedMarkVersion, approval.calculatedMarkVersionSnapshot);
    assert.equal(result.calculatedMarkVersion, calculated.calculatedMarkVersion);
    assert.ok(result.formativeMark.eq(scenario.formative));
    assert.ok(result.summativeMark.eq(scenario.summative));
    assert.ok(result.totalMark.eq(new Prisma.Decimal(scenario.formative).plus(scenario.summative)));
    assert.deepEqual([result.formativePassed, result.summativePassed, result.coursePassed],
      [scenario.formativePassed, scenario.summativePassed, scenario.formativePassed && scenario.summativePassed]);
    const before = await protectedSnapshot(db);
    for (let attempt = 0; attempt < 2; attempt++) {
      const replay = await db.$transaction(tx => service.reconcileInTransaction(tx,
        id.departmentId, id.examinationId, id.examinationCourseId, id.enrollmentId),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
      assert.equal(replay.status, 'EXISTING');
    }
    const contenders = await Promise.allSettled([0, 1].map(() => db.$transaction(tx =>
      service.reconcileInTransaction(tx, id.departmentId, id.examinationId, id.examinationCourseId, id.enrollmentId),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 })));
    for (const contender of contenders) {
      if (contender.status === 'fulfilled') assert.equal(contender.value.status, 'EXISTING');
      else {
        const error = contender.reason;
        const expectedSerializationConflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' ||
            (error.code === 'P2010' && error.meta?.code === '40001'));
        if (!expectedSerializationConflict) {
          const code = typeof error?.code === 'string' && /^[A-Z0-9]{4,8}$/.test(error.code)
            ? error.code : 'NONE';
          const sqlstate = typeof error?.meta?.code === 'string' &&
            /^[A-Z0-9]{5}$/.test(error.meta.code) ? error.meta.code : 'NONE';
          const kind = error?.name === 'PrismaClientKnownRequestError'
            ? 'PRISMA_KNOWN' : error?.name === 'PrismaClientUnknownRequestError'
            ? 'PRISMA_UNKNOWN' : 'OTHER';
          console.error(`CRC_REPLAY_REJECTION case=${scenario.key} class=${kind} code=${code} sqlstate=${sqlstate}`);
        }
        assert.ok(expectedSerializationConflict, 'Unexpected concurrency rejection');
      }
    }
    assert.ok(contenders.some(c => c.status === 'fulfilled'));
    assert.equal(await protectedSnapshot(db), before);
    await deniedUnchanged(db, () => db.formativeFinalResult.update({
      where: { id: formative.id }, data: { mark: new Prisma.Decimal(1) } }));
    await deniedUnchanged(db, () => db.summativeCalculatedMark.update({
      where: { id: calculated.id }, data: { calculatedMarkVersion: calculated.calculatedMarkVersion + 1 } }));
    await deniedUnchanged(db, () => db.summativeChairmanApproval.delete({ where: { id: approval.id } }));
    const [projection] = await db.$queryRawUnsafe<Array<{ payload: Record<string, unknown> }>>(
      'SELECT course_composition_sources($1,$2,$3,$4) AS payload',
      id.departmentId, id.examinationId, id.examinationCourseId, id.enrollmentId);
    assert.ok(projection?.payload);
    const [match] = await db.$queryRawUnsafe<Array<{ matches: boolean }>>(
      'SELECT course_composition_matches($1,$2::jsonb) AS matches', result.id, JSON.stringify(projection.payload));
    assert.equal(match?.matches, true);
    for (const field of ['calculatedMarkVersion', 'candidateListVersion', 'formativeResultId', 'candidateListId']) {
      assert.ok(Object.hasOwn(projection.payload, field));
      const forged: Record<string, unknown> = { ...projection.payload, [field]: field.endsWith('Version')
        ? Number(projection.payload[field]) + 1 : 'crc_fixture_wrong_lineage' };
      const [mismatch]: Array<{ matches: boolean }> = await db.$queryRawUnsafe<Array<{ matches: boolean }>>(
        'SELECT course_composition_matches($1,$2::jsonb) AS matches', result.id, JSON.stringify(forged));
      assert.equal(mismatch?.matches, false);
      if (scenario.key === 'boundary') {
        // Deliberately inject a stale projection AFTER the real source query.
        // DB source rows, authorization and matcher remain real and immutable.
        await deniedUnchanged(db, () => db.$transaction(async tx => {
          const wrapped = new Proxy(tx, { get(target, operation) {
            if (operation !== '$queryRaw') return Reflect.get(target, operation);
            return async (query: Prisma.Sql) => {
              const actual = await target.$queryRaw(query);
              if (query.sql.includes('SELECT course_composition_sources')) return [{ sources: forged }];
              return actual;
            };
          }});
          return service.reconcileInTransaction(wrapped as Prisma.TransactionClient,
            id.departmentId, id.examinationId, id.examinationCourseId, id.enrollmentId);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }), ConflictException);
      }

    }
  }
  assert.equal(await db.summativeCommitteeMemberReview.count(), 13);
  assert.equal(await db.summativeChairmanApproval.count(), 6);
  assert.equal(await db.formativeFinalResult.count(), 6);
  assert.equal(await db.courseResultComposition.count(), 6);
  assert.equal(await db.auditLog.count({ where: { action: 'course-result.composed', outcome: 'SUCCESS' } }), 6);
  assert.equal(await db.auditLog.count({ where: { action: 'summative-examination.chairman-approval.final-lock-completed', outcome: 'SUCCESS' } }), 6);
}
async function foreignPrincipalAndLockedWrites(db: PrismaClient) {
  const ctx = new RequestContextService();
  const workflow = new SummativeCommitteeWorkflowService(db as never, ctx,
    new SummativeCommitteeWorkflowAuthorizerService(db as never, ctx),
    new SummativeCalculatedMarkService(ctx), new CourseResultCompositionService());
  // Ordinary synthetic identity setup only. No academic source or audit is fabricated.
  await db.department.create({ data: { id: 'crc_fixture_foreign', code: 'CRC_FOREIGN',
    slug: 'crc-foreign', name: 'Synthetic foreign department', status: 'ACTIVE' } });
  await db.user.create({ data: { id: 'crc_fixture_foreign_actor', departmentId: 'crc_fixture_foreign',
    email: 'foreign@crc-fixture.invalid', normalizedEmail: 'foreign@crc-fixture.invalid',
    displayName: 'Synthetic foreign teacher', status: 'ACTIVE', passwordHash: null } });
  const role = await db.role.create({ data: { departmentId: 'crc_fixture_foreign', code: 'teacher', name: 'Synthetic teacher' } });
  await db.userRole.create({ data: { departmentId: 'crc_fixture_foreign', userId: 'crc_fixture_foreign_actor', roleId: role.id } });
  const grants = await db.rolePermission.findMany({ where: { roleId: 'crc_fixture_teacher_role' } });
  for (const grant of grants) await db.rolePermission.create({ data: { roleId: role.id, permissionId: grant.permissionId } });
  async function asUser<T>(userId: string, work: () => Promise<T>, header = 'crc_fixture_law') {
    const principal = await new PrincipalLoaderService(db as never).loadPrincipal(userId);
    assert.ok(principal?.isAuthenticated);
    return ctx.run({ requestId: 'crc-fresh-negative', method: 'POST', path: '/synthetic-negative',
      principal, department: { kind: 'department', departmentId: header, source: 'header' },
      audit: { requestId: 'crc-fresh-negative', departmentId: principal.activeDepartmentId } }, work);
  }
  const mark = await db.summativeCalculatedMark.findFirstOrThrow({ where: { examinationId: fixtureIds('boundary').examinationId } });
  await deniedUnchanged(db, () => asUser('crc_fixture_foreign_actor', () => workflow.submitMemberReview(mark.id, { outcome: 'VERIFIED' })), NotFoundException);
  await deniedUnchanged(db, () => asUser('crc_fixture_foreign_actor', () => workflow.approveAndFinalLock(mark.id)), NotFoundException);
  // The exact review bound into the final lock remains replayable, never editable.
  const approval = await db.summativeChairmanApproval.findUniqueOrThrow({ where: { calculatedMarkId: mark.id } });
  assert.ok(approval.lockedAt);
  const existingReview = await db.summativeCommitteeMemberReview.findUniqueOrThrow({
    where: { id: approval.member1ReviewId },
  });
  assert.equal(existingReview.reviewerUserId, 'crc_fixture_boundary_member1');
  assert.equal(existingReview.outcome, 'VERIFIED');
  assert.equal(existingReview.reviewComment?.trim() || null, null);
  const beforeReplay = await protectedSnapshot(db);
  const replay = await asUser('crc_fixture_boundary_member1',
    () => workflow.submitMemberReview(mark.id, { outcome: 'VERIFIED' }));
  assert.equal(replay.id, existingReview.id);
  assert.equal(replay.reviewVersion, existingReview.reviewVersion);
  assert.equal(await protectedSnapshot(db), beforeReplay, 'Exact Member replay changed protected evidence or audit');
  await deniedUnchanged(db, () => asUser('crc_fixture_boundary_member1', () => workflow.submitMemberReview(mark.id, {
    outcome: 'CORRECTION_REQUIRED', reviewComment: 'Synthetic attempted outcome change after final lock',
  })), ConflictException);
  await deniedUnchanged(db, () => asUser('crc_fixture_boundary_member1', () => workflow.submitMemberReview(mark.id, {
    outcome: 'VERIFIED', reviewComment: 'Synthetic attempted comment change after final lock',
  })), ConflictException);
  await deniedUnchanged(db, () => asUser('crc_fixture_boundary_chairman', () => workflow.approveAndFinalLock(mark.id)));
  console.log('CRC_FRESH_FOREIGN_PRINCIPAL_AND_LOCKED_WRITES=PASS');
}
export async function runFreshOwnerCampaign(db: PrismaClient, order: 'formative-first' | 'summative-first') {
  assert.equal(await isFreshSynthetic(db), true);
  await generateRealSummativePreterminal(db);
  await certifyAndFinaliseSyntheticActivities(db);
  await generateSyntheticAttendanceByRealServices(db);
  if (order === 'summative-first') {
    await approveSyntheticSummativeThroughOwners(db, true);
    assert.equal(await db.formativeFinalResult.count(), 0);
    assert.equal(await db.courseResultComposition.count(), 0);
    await createSyntheticComprehensiveThroughOwners(db, true);
  } else {
    await createSyntheticComprehensiveThroughOwners(db);
    await approveSyntheticSummativeThroughOwners(db);
  }
  await verifyResults(db);
  await foreignPrincipalAndLockedWrites(db);
  console.log('CRC_FRESH_ORDER=' + order + ':PASS');
  return { order, reviews: 13, approvals: 6, formative: 6, compositions: 6, terminalAudits: 12 };
}
