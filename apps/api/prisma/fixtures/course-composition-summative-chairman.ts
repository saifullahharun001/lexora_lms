/**
 * Disposable-only genuine Summative Committee Member reviews, Chairman final lock
 * and automatic course /100 composition. Requires the complete six-case /40
 * and /60 owner-service evidence produced by the preceding isolated campaign.
 * No protected academic record or success audit is inserted directly.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { Prisma, PrismaClient, PermissionScope, ExaminationCommitteeAssignmentStatus } from '@prisma/client';
import { RequestContextService } from '../../src/common/request-context/request-context.service';
import { PrincipalLoaderService } from '../../src/modules/authorization/services/principal-loader.service';
import { PERMISSIONS } from '../../src/modules/identity-access/authorization/permissions.constants';
import { SummativeCommitteeWorkflowService } from '../../src/modules/summative-examination/application/services/summative-committee-workflow.service';
import { SummativeCommitteeWorkflowAuthorizerService } from '../../src/modules/summative-examination/application/services/summative-committee-workflow-authorizer.service';
import { ExaminationCommitteeService } from '../../src/modules/summative-examination/application/services/examination-committee.service';
import { SummativeManagementAuthorizerService } from '../../src/modules/summative-examination/application/services/summative-management-authorizer.service';
import { SummativeCalculatedMarkService } from '../../src/modules/summative-examination/application/services/summative-calculated-mark.service';
import { CourseResultCompositionService } from '../../src/modules/course-result-composition/course-result-composition.service';
import { PRODUCTION_CASES, fixtureIds } from './course-composition-production-baseline';

const dept = 'crc_fixture_law';
const ctx = new RequestContextService();
const composition = new CourseResultCompositionService();
const actor = (key: string, suffix: string) => `crc_fixture_${key}_${suffix}`;
const approvalAction = 'summative-examination.chairman-approval.final-lock-completed';
const compositionAction = 'course-result.composed';

function workflow(db: PrismaClient, hook: Pick<CourseResultCompositionService, 'reconcileInTransaction'> = composition) {
  return new SummativeCommitteeWorkflowService(db as never, ctx,
    new SummativeCommitteeWorkflowAuthorizerService(db as never, ctx),
    new SummativeCalculatedMarkService(ctx), hook);
}
async function asUser<T>(db: PrismaClient, userId: string, work: () => Promise<T>): Promise<T> {
  const principal = await new PrincipalLoaderService(db as never).loadPrincipal(userId);
  assert.ok(principal?.isAuthenticated && principal.actorType === 'user' && principal.activeDepartmentId === dept,
    'Synthetic principal must be authenticated in the exact test department');
  return ctx.run({ requestId: `crc-chairman-${userId}`, method: 'POST', path: '/synthetic-chairman', principal,
    department: { kind: 'department', departmentId: dept, source: 'principal' },
    audit: { requestId: `crc-chairman-${userId}`, departmentId: dept } }, work);
}
async function counters(db: PrismaClient): Promise<[number, number, number, number, number]> {
  return [await db.summativeCommitteeMemberReview.count(), await db.summativeChairmanApproval.count(),
    await db.courseResultComposition.count(), await db.auditLog.count({ where: { action: approvalAction } }),
    await db.auditLog.count({ where: { action: compositionAction } })];
}
async function gate(db: PrismaClient) {
  const url = new URL(process.env.LEXORA_CRC_FOUNDATION_DATABASE_URL ?? '');
  const name = process.env.LEXORA_CRC_FOUNDATION_EXPECTED_DATABASE;
  assert.equal(process.env.LEXORA_CRC_FOUNDATION_CONFIRM, 'YES_DISPOSABLE_SYNTHETIC_FOUNDATION');
  assert.ok(name && /^crc_[A-Za-z0-9_]+_test$/.test(name));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
  assert.equal(decodeURIComponent(url.pathname.slice(1)), name);
  assert.equal(url.searchParams.get('schema'), 'public');
  const rows = await db.$queryRaw<Array<{ dbname: string; version: string; compos: string | null }>>`
    SELECT current_database() AS dbname, current_setting('server_version_num') AS version,
      to_regclass('public.course_result_compositions')::text AS compos`;
  assert.equal(rows[0]?.dbname, name);
  assert.equal(rows[0]?.version, '180006');
  assert.equal(rows[0]?.compos, 'course_result_compositions');
  assert.equal(await db.examination.count({ where: { departmentId: dept } }), 6);
  assert.equal(await db.examinationCandidateList.count({ where: { departmentId: dept, status: 'CERTIFIED' } }), 6);
  assert.equal(await db.summativeCalculatedMark.count({ where: { departmentId: dept } }), 6);
  assert.equal(await db.formativeFinalResult.count({ where: { departmentId: dept } }), 6);
  assert.deepEqual(await counters(db), [0, 0, 0, 0, 0]);
}
async function assignExactFixturePermission(db: PrismaClient) {
  await db.$transaction(async tx => {
    const bindings = [
      { code: PERMISSIONS.SUMMATIVE_EXAMINATION.MEMBER_REVIEW_DEPARTMENT,
        resource: 'summative-examination.member-review', action: 'review' },
      { code: PERMISSIONS.SUMMATIVE_EXAMINATION.CHAIRMAN_APPROVAL_DEPARTMENT,
        resource: 'summative-examination.chairman-approval', action: 'approve' },
    ] as const;
    for (const value of bindings) {
      const permission = await tx.permission.upsert({ where: { code: value.code },
        create: { ...value, scope: PermissionScope.DEPARTMENT }, update: {} });
      assert.deepEqual([permission.resource, permission.action, permission.scope],
        [value.resource, value.action, PermissionScope.DEPARTMENT], 'Exact permission contract must match');
      await tx.rolePermission.upsert({ where: { roleId_permissionId: {
        roleId: 'crc_fixture_teacher_role', permissionId: permission.id } },
        create: { roleId: 'crc_fixture_teacher_role', permissionId: permission.id }, update: {} });
    }
  }, { timeout: 30000 });
}
/**
 * Mutation is restricted to a synthetic Committee appointment in the disposable DB.
 * All academic marks, completed reviews, final locks and success audits remain owner-controlled.
 * The authenticated principal is loaded BEFORE the appointment changes; the service must
 * enforce current DB authority rather than relying only on the previously loaded principal.
 */
async function probeExpiredMemberAppointment(
  db: PrismaClient, key: string, memberId: string, calculatedMarkId: string,
  before: [number, number, number, number, number],
) {
  const id = fixtureIds(key);
  await asUser(db, memberId, async () => {
    const appointment = await db.examinationCommitteeAssignment.findFirstOrThrow({
      where: { departmentId: dept, examinationId: id.examinationId,
        assignedUserId: memberId, seat: 'MEMBER_2', status: ExaminationCommitteeAssignmentStatus.ACTIVE },
      select: { id: true, assignedAt: true, expiresAt: true, unassignedAt: true, archivedAt: true },
    });
    assert.equal(appointment.expiresAt, null);
    assert.equal(appointment.unassignedAt, null);
    assert.equal(appointment.archivedAt, null);
    const expired = new Date(appointment.assignedAt.getTime() + 1);
    assert.ok(expired.getTime() < Date.now(), 'Fixture appointment must be in the past for a wall-clock expiry test');
    await db.examinationCommitteeAssignment.update({ where: { id: appointment.id },
      data: { expiresAt: expired } });
    try {
      await assert.rejects(workflow(db).submitMemberReview(calculatedMarkId,
        { outcome: 'VERIFIED' }));
      assert.deepEqual(await counters(db), before,
        'Expired ACTIVE Member appointment must not create review, approval, /100 or terminal audits');
    } finally {
      await db.examinationCommitteeAssignment.update({ where: { id: appointment.id },
        data: { expiresAt: appointment.expiresAt } });
    }
  });
  assert.deepEqual(await counters(db), before);
}
async function probeInactiveChairmanAppointment(
  db: PrismaClient, key: string, chairmanId: string, calculatedMarkId: string,
  before: [number, number, number, number, number],
) {
  const id = fixtureIds(key);
  await asUser(db, chairmanId, async () => {
    const appointment = await db.examinationCommitteeAssignment.findFirstOrThrow({
      where: { departmentId: dept, examinationId: id.examinationId,
        assignedUserId: chairmanId, seat: 'CHAIRMAN', status: ExaminationCommitteeAssignmentStatus.ACTIVE },
      select: { id: true, status: true, assignedAt: true, expiresAt: true,
        unassignedAt: true, archivedAt: true },
    });
    assert.equal(appointment.unassignedAt, null);
    assert.equal(appointment.archivedAt, null);
    const at = new Date();
    assert.ok(at.getTime() >= appointment.assignedAt.getTime());
    await db.examinationCommitteeAssignment.update({ where: { id: appointment.id },
      data: { status: ExaminationCommitteeAssignmentStatus.INACTIVE, unassignedAt: at } });
    try {
      await assert.rejects(workflow(db).approveAndFinalLock(calculatedMarkId));
      assert.deepEqual(await counters(db), before,
        'Inactive current Chairman appointment must not create approval, /100 or terminal audits');
    } finally {
      await db.examinationCommitteeAssignment.update({ where: { id: appointment.id },
        data: { status: appointment.status, unassignedAt: appointment.unassignedAt } });
    }
  });
  assert.deepEqual(await counters(db), before);
}
/**
 * The real Committee management service retires and replaces one synthetic
 * Member appointment. Old immutable reviews MUST NOT satisfy Chairman final
 * lock after replacement. New member submits a fresh review via owner service.
 */
async function probeReplacedMemberReview(
  db: PrismaClient, key: string, memberId: string, chairmanId: string,
  calculatedMarkId: string, before: [number, number, number, number, number],
) {
  const id = fixtureIds(key);
  const original = await db.examinationCommitteeAssignment.findFirstOrThrow({
    where: { departmentId: dept, examinationId: id.examinationId,
      assignedUserId: memberId, seat: 'MEMBER_1', status: ExaminationCommitteeAssignmentStatus.ACTIVE },
    select: { id: true, committeeId: true, assignedAt: true },
  });
  const manager = new ExaminationCommitteeService(db as never, ctx,
    new SummativeManagementAuthorizerService(db as never, ctx));
  await asUser(db, 'crc_fixture_operator', () => manager.unassignMember(original.id));
  const successor = await asUser(db, 'crc_fixture_operator', () => manager.assignInternalMember({
    committeeId: original.committeeId, seat: 'MEMBER_1', assignedUserId: memberId,
  }));
  assert.notEqual(successor.id, original.id, 'Replacement must issue a distinct appointment identity');
  assert.equal(successor.seat, 'MEMBER_1');
  assert.equal(successor.assignedUserId, memberId);
  const retired = await db.examinationCommitteeAssignment.findUniqueOrThrow({ where: { id: original.id } });
  assert.equal(retired.status, ExaminationCommitteeAssignmentStatus.INACTIVE);
  assert.ok(retired.unassignedAt);
  await assert.rejects(asUser(db, chairmanId, () => workflow(db).approveAndFinalLock(calculatedMarkId)));
  assert.deepEqual(await counters(db), before,
    'Stale VERIFIED review must not approve after real Member replacement');
  const review = await asUser(db, memberId, () => workflow(db).submitMemberReview(calculatedMarkId,
    { outcome: 'VERIFIED' }));
  assert.equal(review.reviewVersion, 2, 'Replacement must append a second review version, never rewrite the first');
  const rows = await db.summativeCommitteeMemberReview.findMany({
    where: { departmentId: dept, calculatedMarkId, reviewerSeat: 'MEMBER_1' },
    orderBy: { reviewVersion: 'asc' },
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.committeeAssignmentId, original.id);
  assert.equal(rows[1]?.committeeAssignmentId, successor.id);
  assert.equal(rows[0]?.assignmentAssignedAtSnapshot.getTime(), original.assignedAt.getTime());
  assert.equal(rows[1]?.assignmentAssignedAtSnapshot.getTime(), successor.assignedAt.getTime());
  assert.deepEqual(await counters(db), [before[0] + 1, before[1], before[2], before[3], before[4]]);
}
async function exactCalculated(db: PrismaClient, key: string) {
  const id = fixtureIds(key);
  const marks = await db.summativeCalculatedMark.findMany({ where: { departmentId: dept,
    examinationId: id.examinationId, examinationCourseId: id.examinationCourseId,
    candidate: { is: { enrollmentId: id.enrollmentId } } }, select: { id: true, candidateId: true } });
  assert.equal(marks.length, 1, `Exactly one real calculated mark required for ${key}`);
  assert.ok(marks[0]);
  return marks[0];
}
export async function approveSyntheticSummativeThroughOwners(db: PrismaClient) {
  await gate(db);
  await assignExactFixturePermission(db);
  const report: string[] = [];
  for (const scenario of PRODUCTION_CASES) {
    const key = scenario.key;
    const id = fixtureIds(key);
    const calculated = await exactCalculated(db, key);
    const chairman = actor(key, 'chairman');
    const member1 = actor(key, 'member1');
    const member2 = actor(key, 'member2');
    const base = await counters(db);
    console.log(`CRC_CHAIRMAN_STAGE=${key}:DENY_WITHOUT_REVIEWS`);
    await assert.rejects(asUser(db, chairman, () => workflow(db).approveAndFinalLock(calculated.id)));
    assert.deepEqual(await counters(db), base, 'A denied Chairman action must leave no terminal records');
    // A department Admin without a Committee Member duty cannot write Member evidence.
    if (key === 'boundary') {
      const foreign = await exactCalculated(db, 'precision');
      console.log('CRC_CHAIRMAN_STAGE=boundary:DENY_OTHER_CANDIDATE');
      await assert.rejects(asUser(db, chairman, () => workflow(db).approveAndFinalLock(foreign.id)));
      await assert.rejects(asUser(db, member1, () => workflow(db).submitMemberReview(foreign.id,
        { outcome: 'VERIFIED' })));
      console.log('CRC_CHAIRMAN_STAGE=boundary:DENY_ADMIN_REVIEW');
      await assert.rejects(asUser(db, 'crc_fixture_operator', () => workflow(db).submitMemberReview(calculated.id,
        { outcome: 'VERIFIED' })));
      assert.deepEqual(await counters(db), base);
    }
    console.log(`CRC_CHAIRMAN_STAGE=${key}:MEMBER_1_VERIFIED`);
    await asUser(db, member1, () => workflow(db).submitMemberReview(calculated.id, { outcome: 'VERIFIED' }));
    console.log(`CRC_CHAIRMAN_STAGE=${key}:DENY_INCOMPLETE_REVIEW`);
    await assert.rejects(asUser(db, chairman, () => workflow(db).approveAndFinalLock(calculated.id)));
    const afterFirst = await counters(db);
    assert.deepEqual(afterFirst, [base[0] + 1, base[1], base[2], base[3], base[4]]);
    if (key === 'summative_fail') {
      // Simulate live role revocation AFTER loading the authenticated principal.
      // Only the synthetic role binding is mutated; no protected review/evidence is fabricated.
      console.log('CRC_SECURITY_STAGE=summative_fail:MEMBER_LIVE_ROLE_REVOCATION');
      await asUser(db, member2, async () => {
        const assignment = await db.userRole.findUniqueOrThrow({
          where: { userId_roleId_departmentId: {
            userId: member2, roleId: 'crc_fixture_teacher_role', departmentId: dept,
          } },
        });
        assert.equal(assignment.revokedAt, null);
        await db.userRole.update({ where: { id: assignment.id }, data: { revokedAt: new Date() } });
        try {
          await assert.rejects(workflow(db).submitMemberReview(calculated.id, { outcome: 'VERIFIED' }));
          assert.deepEqual(await counters(db), afterFirst,
            'Revoked Member cannot create a review or terminal records');
        } finally {
          await db.userRole.update({ where: { id: assignment.id }, data: { revokedAt: null } });
        }
      });
    }
    if (key === 'summative_fail') {
      console.log('CRC_APPOINTMENT_STAGE=summative_fail:DENY_EXPIRED_ACTIVE_MEMBER');
      await probeExpiredMemberAppointment(db, key, member2, calculated.id, afterFirst);
      console.log('CRC_APPOINTMENT_STAGE=summative_fail:EXPIRED_MEMBER_RESTORED');
    }
    console.log(`CRC_CHAIRMAN_STAGE=${key}:MEMBER_2_VERIFIED`);
    await asUser(db, member2, () => workflow(db).submitMemberReview(calculated.id, { outcome: 'VERIFIED' }));
    if (key === 'formative_fail') {
      console.log('CRC_ADVERSARIAL_STAGE=formative_fail:REAL_MEMBER_REPLACEMENT_STALE_REVIEW_DENIED');
      await probeReplacedMemberReview(db, key, member1, chairman, calculated.id, await counters(db));
      console.log('CRC_ADVERSARIAL_STAGE=formative_fail:NEW_APPOINTMENT_REVIEW_VERSION_2');
    }
    const beforeApproval = await counters(db);
    if (key === 'boundary') {
      console.log('CRC_SECURITY_STAGE=boundary:WRONG_SEAT_AND_CHAIRMAN_LIVE_ROLE_REVOCATION');
      await assert.rejects(asUser(db, member1, () => workflow(db).approveAndFinalLock(calculated.id)));
      await assert.rejects(asUser(db, chairman, () => workflow(db).submitMemberReview(calculated.id,
        { outcome: 'VERIFIED' })));
      assert.deepEqual(await counters(db), beforeApproval);
      await asUser(db, chairman, async () => {
        const assignment = await db.userRole.findUniqueOrThrow({
          where: { userId_roleId_departmentId: {
            userId: chairman, roleId: 'crc_fixture_teacher_role', departmentId: dept,
          } },
        });
        assert.equal(assignment.revokedAt, null);
        await db.userRole.update({ where: { id: assignment.id }, data: { revokedAt: new Date() } });
        try {
          await assert.rejects(workflow(db).approveAndFinalLock(calculated.id));
          assert.deepEqual(await counters(db), beforeApproval,
            'Revoked Chairman cannot create approval/composition/audit');
        } finally {
          await db.userRole.update({ where: { id: assignment.id }, data: { revokedAt: null } });
        }
      });
      assert.deepEqual(await counters(db), beforeApproval);
    }
    if (key === 'boundary') {
      console.log('CRC_APPOINTMENT_STAGE=boundary:DENY_INACTIVE_CHAIRMAN');
      await probeInactiveChairmanAppointment(db, key, chairman, calculated.id, beforeApproval);
      console.log('CRC_APPOINTMENT_STAGE=boundary:CHAIRMAN_APPOINTMENT_RESTORED');
    }
    if (key === 'precision') {
      // Intentionally fail the SERVICE's course.composed audit write after the
      // owner has inserted the immutable /100 row. No production code changes.
      console.log('CRC_ADVERSARIAL_STAGE=precision:COMPOSITION_AUDIT_WRITE_FAILURE');
      const auditFailHook = { reconcileInTransaction: async (
        tx: Prisma.TransactionClient, ...args: [string,string,string,string]
      ) => {
        const wrapped = new Proxy(tx, { get(target, field) {
          if (field !== 'auditLog') return Reflect.get(target, field);
          return new Proxy(target.auditLog, { get(delegate, op) {
            if (op !== 'create') return Reflect.get(delegate, op);
            return (input: Prisma.AuditLogCreateArgs) => {
              if (input.data.action === compositionAction) throw new Error('Synthetic composition audit insertion failure');
              return delegate.create(input);
            };
          }});
        }});
        return composition.reconcileInTransaction(wrapped as Prisma.TransactionClient, ...args);
      }};
      await assert.rejects(asUser(db, chairman,
        () => workflow(db, auditFailHook).approveAndFinalLock(calculated.id)));
      assert.deepEqual(await counters(db), beforeApproval,
        'Failed composition audit write must roll back Chairman approval, /100 and both success audits');
      console.log('CRC_ADVERSARIAL_STAGE=precision:COMPOSITION_AUDIT_FAILURE_ROLLBACK_PASS');
    }
    if (key === 'precision') {
      console.log('CRC_CHAIRMAN_STAGE=precision:ATOMIC_ROLLBACK_PROBE');
      const failingHook = { reconcileInTransaction: async (tx: Prisma.TransactionClient, ...args: [string,string,string,string]) => {
        await composition.reconcileInTransaction(tx, ...args);
        throw new Error('Synthetic terminal interruption');
      } };
      await assert.rejects(asUser(db, chairman, () => workflow(db, failingHook).approveAndFinalLock(calculated.id)));
      assert.deepEqual(await counters(db), beforeApproval,
        'Approval, composition and both terminal success audits must roll back atomically');
    }
    if (key === 'maximum') {
      console.log('CRC_SECURITY_STAGE=maximum:PARALLEL_REAL_CHAIRMAN_APPROVALS');
      const contenders = await Promise.allSettled([
        asUser(db, chairman, () => workflow(db).approveAndFinalLock(calculated.id)),
        asUser(db, chairman, () => workflow(db).approveAndFinalLock(calculated.id)),
      ]);
      const succeeded = contenders.filter((result) => result.status === 'fulfilled');
      const rejected = contenders.filter((result) => result.status === 'rejected');
      assert.equal(succeeded.length, 1, 'Exactly one competing Chairman transaction must succeed');
      assert.equal(rejected.length, 1, 'Duplicate competing Chairman transaction must be denied');
      console.log('CRC_SECURITY_STAGE=maximum:PARALLEL_APPROVAL_ONE_WINNER');
    } else {
      console.log(`CRC_CHAIRMAN_STAGE=${key}:REAL_FINAL_LOCK_AUTO_100`);
      await asUser(db, chairman, () => workflow(db).approveAndFinalLock(calculated.id));
    }
    const result = await db.courseResultComposition.findMany({ where: { departmentId: dept,
      examinationId: id.examinationId, examinationCourseId: id.examinationCourseId,
      enrollmentId: id.enrollmentId } });
    assert.equal(result.length, 1, `Exactly one immutable /100 aggregate required for ${key}`);
    const composed = result[0]!;
    const total = new Prisma.Decimal(scenario.formative).plus(new Prisma.Decimal(scenario.summative));
    assert.ok(composed.formativeMark.eq(scenario.formative));
    assert.ok(composed.summativeMark.eq(scenario.summative));
    assert.ok(composed.totalMark.eq(total));
    assert.deepEqual([composed.formativeFullMark.toString(), composed.summativeFullMark.toString(),
      composed.totalFullMark.toString()], ['40', '60', '100']);
    assert.deepEqual([composed.formativePassed, composed.summativePassed, composed.coursePassed],
      [scenario.formativePassed, scenario.summativePassed, scenario.formativePassed && scenario.summativePassed]);
    assert.equal(composed.summativeCandidateId, calculated.candidateId);
    const approval = await db.summativeChairmanApproval.findUniqueOrThrow({ where: { calculatedMarkId: calculated.id } });
    assert.equal(composed.chairmanApprovalId, approval.id);
    assert.equal(composed.calculatedMarkId, calculated.id);
    assert.deepEqual(await counters(db), [beforeApproval[0], beforeApproval[1] + 1,
      beforeApproval[2] + 1, beforeApproval[3] + 1, beforeApproval[4] + 1]);
    console.log(`CRC_CHAIRMAN_STAGE=${key}:DENY_DUPLICATE_APPROVAL`);
    await assert.rejects(asUser(db, chairman, () => workflow(db).approveAndFinalLock(calculated.id)));
    assert.equal(await db.courseResultComposition.count({ where: { examinationId: id.examinationId } }), 1);
    // A source-owner retry must be an exact no-op, never a second aggregate or audit.
    console.log(`CRC_SOURCE_STAGE=${key}:EXACT_SOURCE_RECONCILIATION_REPLAY`);
    const beforeReplay = await counters(db);
    const replay = await db.$transaction(tx => composition.reconcileInTransaction(tx,
      dept, id.examinationId, id.examinationCourseId, id.enrollmentId),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    if (replay.status !== 'EXISTING') throw new Error('An exact already-composed package must be reused');
    assert.equal(replay.result.id, composed.id, 'Retry must preserve the original aggregate identity');
    assert.deepEqual(await counters(db), beforeReplay, 'Retry must not emit a success audit');
    if (key === 'boundary') {
      // Wrong-department ownership never reaches a source package or terminal write.
      console.log('CRC_SOURCE_STAGE=boundary:DENY_WRONG_DEPARTMENT_RECONCILIATION');
      await assert.rejects(db.$transaction(tx => composition.reconcileInTransaction(tx,
        'crc_fixture_unrelated_department', id.examinationId, id.examinationCourseId, id.enrollmentId),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }));
      assert.deepEqual(await counters(db), beforeReplay);
      // A valid examination/course with a different enrollment cannot borrow evidence.
      console.log('CRC_SOURCE_STAGE=boundary:DENY_MIXED_ENROLLMENT_SOURCE');
      const other = fixtureIds('precision');
      // PostgreSQL source projection rejects a cross-offering enrollment at its
      // academic parent gate (P0002). This is an explicit safe not-found, not
      // NOT_READY: a valid enrollment in the wrong offering is out of scope.
      await assert.rejects(
        db.$transaction(tx => composition.inspectInTransaction(tx,
          dept, id.examinationId, id.examinationCourseId, other.enrollmentId),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }),
        (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2010' &&
          (error.meta as { code?: unknown } | undefined)?.code === 'P0002',
        'Cross-offering enrollment must fail with the exact PostgreSQL safe-not-found SQLSTATE',
      );
      assert.deepEqual(await counters(db), beforeReplay,
        'Rejected mixed-enrollment projection cannot create an approval, aggregate or success audit');
      // Read-only comparison: refuse a forged source ID without mutating protected tables.
      console.log('CRC_SOURCE_STAGE=boundary:REJECT_FORGED_SOURCE_ID');
      const [row] = await db.$queryRaw<Array<{ payload: Record<string, unknown> | null }>>(Prisma.sql`
        SELECT course_composition_sources(${dept},${id.examinationId},
          ${id.examinationCourseId},${id.enrollmentId}) AS payload`);
      assert.ok(row?.payload && typeof row.payload === 'object');
      const [legitimate] = await db.$queryRaw<Array<{ matches: boolean }>>(Prisma.sql`
        SELECT course_composition_matches(${composed.id},${JSON.stringify(row.payload)}::jsonb) AS matches`);
      assert.equal(legitimate?.matches, true, 'Untampered source must match the immutable aggregate');
      const forged = { ...row.payload, calculatedMarkId: 'crc_fixture_forged_calculated_mark' };
      const [invalid] = await db.$queryRaw<Array<{ matches: boolean }>>(Prisma.sql`
        SELECT course_composition_matches(${composed.id},${JSON.stringify(forged)}::jsonb) AS matches`);
      assert.equal(invalid?.matches, false, 'Forged calculated source must not match');
      console.log('CRC_ADVERSARIAL_STAGE=boundary:SOURCE_VERSION_AND_LINEAGE_MISMATCH');
      for (const field of ['calculatedMarkVersion', 'candidateListVersion', 'formativeResultId', 'candidateListId']) {
        assert.ok(Object.prototype.hasOwnProperty.call(row.payload, field),
          `Authoritative source projection lacks ${field}`);
        const conflict: Record<string, unknown> = { ...row.payload, [field]: field.endsWith('Version')
          ? Number(row.payload[field]) + 1 : 'crc_fixture_invalid_source_lineage' };
        const [mismatch]: Array<{ matches: boolean }> = await db.$queryRaw<Array<{ matches: boolean }>>(Prisma.sql`
          SELECT course_composition_matches(${composed.id},${JSON.stringify(conflict)}::jsonb) AS matches`);
        assert.equal(mismatch?.matches, false, `${field} mismatch must not match immutable /100`);
      }
      console.log('CRC_ADVERSARIAL_STAGE=boundary:SOURCE_VERSION_AND_LINEAGE_MISMATCH_PASS');

      assert.deepEqual(await counters(db), beforeReplay);
    }
    // Revalidate immutable evidence and protected write guards on the real database.
    if (key === 'boundary') {
      console.log('CRC_CHAIRMAN_STAGE=boundary:PROTECTED_EVIDENCE_IMMUTABLE');
      await assert.rejects(db.courseResultComposition.update({ where: { id: composed.id },
        data: { totalMark: new Prisma.Decimal(0) } }));
      await assert.rejects(db.courseResultComposition.delete({ where: { id: composed.id } }));
      await assert.rejects(db.summativeChairmanApproval.update({ where: { id: approval.id },
        data: { approvedSummativeValueSnapshot: new Prisma.Decimal(0) } }));
      assert.equal(await db.courseResultComposition.count({ where: { id: composed.id } }), 1);
    }
    report.push(key);
  }
  assert.equal(report.length, 6);
  assert.deepEqual(await counters(db), [13, 6, 6, 6, 6]);
  assert.equal(await db.formativeFinalResult.count({ where: { departmentId: dept } }), 6);
  assert.equal(await db.summativeCalculatedMark.count({ where: { departmentId: dept } }), 6);
  return report;
}
