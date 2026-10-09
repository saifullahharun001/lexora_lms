/**
 * CRC synthetic-only source-owner attendance /5 setup.
 * Run after authenticated real Summative and certified Activities fixtures,
 * against a fresh, empty-of-terminal-results isolated PostgreSQL 18.6 instance.
 * No protected academic aggregate, audit or publication is inserted directly.
 */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { AttendanceSourceType, Prisma, PrismaClient } from '@prisma/client';
import { RequestContextService } from '../../src/common/request-context/request-context.service';
import { PrincipalLoaderService } from '../../src/modules/authorization/services/principal-loader.service';
import { ClassSessionService } from '../../src/modules/class-session/application/services/class-session.service';
import { PrismaClassSessionRepository } from '../../src/modules/class-session/infrastructure/repositories/prisma-class-session.repository';
import { ClassSessionEvidenceService } from '../../src/modules/class-session/class-session-evidence.service';
import { AttendanceService } from '../../src/modules/attendance/application/services/attendance.service';
import { PrismaAttendanceRepository } from '../../src/modules/attendance/infrastructure/repositories/prisma-attendance.repository';
import { AttendanceMarkGenerationService } from '../../src/modules/attendance/application/services/attendance-mark-generation.service';
import { AttendanceMarkGenerationAuthorizerService } from '../../src/modules/attendance/application/services/attendance-mark-generation-authorizer.service';
import { FinalFormativeService } from '../../src/modules/final-formative/final-formative.service';
import { CourseResultCompositionService } from '../../src/modules/course-result-composition/course-result-composition.service';
import { PERMISSIONS } from '../../src/modules/identity-access/authorization/permissions.constants';
import { PRODUCTION_CASES, PRODUCTION_FIXTURE_INPUTS, fixtureIds } from './course-composition-production-baseline';

const departmentId = 'crc_fixture_law';
const ctx = new RequestContextService();
const fixture = (key: string, suffix: string) => `crc_fixture_${key}_${suffix}`;

// The live Attendance /5 rubric awards 2/5 at exactly 60%, 5/5 at >=90%,
// and 0/5 below 60%. Each session has real teacher capture evidence.
export const ATTENDANCE_RECIPES = Object.freeze({
  boundary: { conducted: 5, present: 3, mark: '2' },
  formative_fail: { conducted: 5, present: 3, mark: '2' },
  summative_fail: { conducted: 1, present: 1, mark: '5' },
  precision: { conducted: 5, present: 3, mark: '2' },
  zero: { conducted: 1, present: 0, mark: '0' },
  maximum: { conducted: 1, present: 1, mark: '5' },
} as const);

async function asUser<T>(db: PrismaClient, userId: string, fn: () => Promise<T>): Promise<T> {
  const principal = await new PrincipalLoaderService(db as never).loadPrincipal(userId);
  assert.ok(principal?.isAuthenticated && principal.actorType === 'user' &&
    principal.activeDepartmentId === departmentId, 'Test actor must be authenticated and department-scoped');
  return ctx.run({ requestId: `crc-attendance-${userId}`, method: 'POST',
    path: '/synthetic-attendance', principal,
    department: { kind: 'department', departmentId, source: 'principal' },
    audit: { requestId: `crc-attendance-${userId}`, departmentId },
  }, fn);
}

function assertEnvironment() {
  const url = new URL(process.env.LEXORA_CRC_FOUNDATION_DATABASE_URL ?? '');
  const expected = process.env.LEXORA_CRC_FOUNDATION_EXPECTED_DATABASE;
  assert.equal(process.env.LEXORA_CRC_FOUNDATION_CONFIRM, 'YES_DISPOSABLE_SYNTHETIC_FOUNDATION');
  assert.ok(expected && /^crc_[a-zA-Z0-9_]+_test$/.test(expected));
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
  assert.equal(decodeURIComponent(url.pathname.slice(1)), expected);
  assert.equal(url.searchParams.get('schema'), 'public');
  return expected;
}

export async function generateSyntheticAttendanceByRealServices(db: PrismaClient) {
  const expected = assertEnvironment();
  const actual = await db.$queryRaw<Array<{ name: string; version: string; composition: string | null }>>`
    SELECT current_database() AS name, current_setting('server_version_num') AS version,
      to_regclass('public.course_result_compositions')::text AS composition`;
  assert.equal(actual[0]?.name, expected);
  assert.equal(actual[0]?.version, '180006');
  assert.equal(actual[0]?.composition, null);
  assert.equal(await db.summativeCalculatedMark.count({ where: { departmentId } }), 6);
  assert.equal(await db.formativeActivitiesFinalResult.count({ where: { finalisation: { is: { departmentId } } } }), 6);
  assert.equal(await db.examinationCandidateList.count({ where: { departmentId, status: 'CERTIFIED' } }), 6);
  assert.equal(await db.classSession.count(), 0);
  assert.equal(await db.attendanceRecord.count(), 0);
  assert.equal(await db.formativeAttendanceGeneration.count(), 0);
  assert.equal(await db.formativeFinalResult.count(), 0);
  assert.equal(await db.summativeChairmanApproval.count(), 0);

  // One scoped synthetic permission for the already-appointed Teacher/Chairman.
  // This is fixture RBAC preparation, not a bypass of principal or live DB authorization.
  await db.$transaction(async tx => {
    await tx.permission.create({ data: {
      id: 'crc_fixture_attendance_generate_permission',
      code: PERMISSIONS.ATTENDANCE.MARK_GENERATE_DEPARTMENT,
      resource: 'attendance.mark', action: 'generate', scope: 'DEPARTMENT',
    } });
    await tx.rolePermission.create({ data: {
      id: 'crc_fixture_attendance_generate_grant',
      roleId: 'crc_fixture_teacher_role', permissionId: 'crc_fixture_attendance_generate_permission',
    } });
  });

  const classSessions = new ClassSessionService(
    new PrismaClassSessionRepository(db as never), db as never, ctx);
  const capture = new AttendanceService(
    new PrismaAttendanceRepository(db as never, ctx), db as never, ctx);
  const finalFormative = new FinalFormativeService(db as never, new CourseResultCompositionService());
  const generation = new AttendanceMarkGenerationService(db as never, ctx,
    new AttendanceMarkGenerationAuthorizerService(db as never, ctx),
    new ClassSessionEvidenceService(), finalFormative);

  const manifest: Array<{ key: string; present: number; conducted: number; mark: string }> = [];
  for (const { key } of PRODUCTION_CASES) {
    const recipe = ATTENDANCE_RECIPES[key];
    const academic = PRODUCTION_FIXTURE_INPUTS.find(x => x.key === key);
    assert.ok(academic && new Prisma.Decimal(recipe.mark).eq(academic.attendance));
    const ids = fixtureIds(key);
    const teacher = fixture(key, 'chairman');
    const student = fixture(key, 'student');
    console.log(`CRC_ATTENDANCE_STAGE=${key}:TEACHER_CLASS_CAPTURE`);
    await asUser(db, teacher, async () => {
      for (let i = 0; i < recipe.conducted; i++) {
        // Per-session future deadline is essential: capture is allowed ONLY while ACTIVE.
        const start = new Date(Date.now() - 60_000);
        const end = new Date(Date.now() + 30_000);
        const session = await classSessions.create({
          courseOfferingId: fixture(key, 'offering'),
          teacherAssignmentId: fixture(key, 'teacher_course_assignment'),
          sessionCode: `CRC-${i + 1}`,
          title: 'Synthetic CRC conducted class',
          scheduledStartAt: start, scheduledEndAt: end,
        });
        await classSessions.activate(session.id);
        await capture.captureAttendance({
          classSessionId: session.id, enrollmentId: ids.enrollmentId,
          studentUserId: student, sourceType: AttendanceSourceType.MANUAL,
          status: i < recipe.present ? 'PRESENT' : 'ABSENT',
        });
        await classSessions.complete(session.id);
      }
    });
    console.log(`CRC_ATTENDANCE_STAGE=${key}:CHAIRMAN_GENERATION`);
    await asUser(db, teacher, () => generation.generate(ids.examinationId));
    const evidence = await db.formativeAttendanceVersion.findMany({
      where: { departmentId, examinationId: ids.examinationId, enrollmentId: ids.enrollmentId },
    });
    assert.equal(evidence.length, 1, `Exactly one immutable Attendance version required: ${key}`);
    const attendanceVersion = evidence[0];
    if (attendanceVersion === undefined) throw new Error('Missing expected Attendance version');
    assert.equal(attendanceVersion.status, 'READY');
    assert.equal(attendanceVersion.conductedCount, recipe.conducted);
    assert.equal(attendanceVersion.presentCount, recipe.present);
    assert.ok(attendanceVersion.mark?.eq(recipe.mark));
    manifest.push({ key, conducted: recipe.conducted, present: recipe.present, mark: recipe.mark });
  }
  assert.equal(manifest.length, 6);
  assert.equal(await db.formativeAttendanceGeneration.count(), 6);
  assert.equal(await db.formativeAttendanceVersion.count(), 6);
  assert.equal(await db.formativeAttendanceSourceItem.count(), 18);
  assert.equal(await db.formativeFinalResult.count(), 0);
  assert.equal(await db.summativeChairmanApproval.count(), 0);
  return manifest;
}
