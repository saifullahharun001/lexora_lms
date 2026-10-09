'use strict';
/*
 * Disposable-only SYNTHETIC ACADEMIC FOUNDATION for the /100 integration campaign.
 * NOT a complete baseline, not permission to run on canonical DB, not a substitute
 * for source-owner services or official certification/approval evidence.
 * This stage intentionally does not create terminal academic source evidence.
 * Generated from the 2026-10-08 23:03 supplied Lexora source snapshot.
 */
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { disposableTarget, assertHistory } = require('./crc-synthetic-foundation-safety.cjs');

const keys = ['boundary','formative_fail','summative_fail','precision','zero','maximum'];
const dept = 'crc_fixture_law';
const confirm = 'YES_DISPOSABLE_SYNTHETIC_FOUNDATION';
const raw = process.env.LEXORA_CRC_FOUNDATION_DATABASE_URL;
const expected = process.env.LEXORA_CRC_FOUNDATION_EXPECTED_DATABASE;
const marker = process.env.LEXORA_CRC_FOUNDATION_CONFIRM;

function safeConnection() {
  return disposableTarget(raw, expected, marker);
}

const fixed = {
  program: 'crc_fixture_program', session: 'crc_fixture_session',
  year: 'crc_fixture_year', term: 'crc_fixture_term', batch: 'crc_fixture_batch',
  course: 'crc_fixture_shared_course', template: 'crc_fixture_template',
  componentActivities: 'crc_fixture_component_activities',
  componentAttendance: 'crc_fixture_component_attendance',
  componentComprehensive: 'crc_fixture_component_comprehensive',
  componentSummative: 'crc_fixture_component_summative',
  curriculum: 'crc_fixture_curriculum', curriculumCourse: 'crc_fixture_curriculum_course',
  syllabus: 'crc_fixture_syllabus', operator: 'crc_fixture_operator',
  poe: 'crc_fixture_poe', adminRole: 'crc_fixture_department_admin_role', teacherRole: 'crc_fixture_teacher_role',
  studentRole: 'crc_fixture_student_role', poeRole: 'crc_fixture_poe_role',
  chairmanPermission: 'crc_fixture_chairman_permission',
  memberPermission: 'crc_fixture_member_permission',
};
const id = (key, suffix) => `crc_fixture_${key}_${suffix}`;
const ago = new Date('2026-09-01T00:00:00.000Z');
const later = new Date('2027-12-31T23:59:59.000Z');
const early = new Date('2026-01-01T00:00:00.000Z');
const termEnd = new Date('2027-06-30T23:59:59.000Z');
const user = (uid) => ({ id: uid, departmentId: dept, email: `${uid}@crc-fixture.invalid`,
  normalizedEmail: `${uid}@crc-fixture.invalid`, displayName: `Synthetic ${uid}`, status: 'ACTIVE', passwordHash: null });


async function verifyHistory(db) {
  const history = await db.$queryRaw`SELECT migration_name AS name, checksum,
    finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back
    FROM _prisma_migrations`;
  return assertHistory(assert, history,
    readFileSync(path.join(process.cwd(), 'prisma/fixtures/course-composition-production-baseline.ts'), 'utf8'),
    path.join(process.cwd(), 'prisma/migrations'));
}

async function verifyIdentity(db, name) {
  const rows = await db.$queryRaw`SELECT current_database() AS name,
    current_setting('server_version_num') AS version,
    inet_server_addr()::text AS server_addr,
    (SELECT count(*)::int FROM _prisma_migrations) AS migration_count`;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, name);
  assert.equal(rows[0].version, '180006', 'PostgreSQL 18.6 required');
  assert.ok([41,43].includes(rows[0].migration_count), 'Expected real history: 41 applied, 2 historical rollbacks');
  const applied = await db.$queryRaw`SELECT count(*)::int AS n FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  assert.equal(applied[0].n, 41, 'Pre-composition history must have 41 successful migrations');
  await verifyHistory(db);
  const composition = await db.$queryRaw`SELECT to_regclass('public.course_result_compositions')::text AS name`;
  assert.equal(composition[0]?.name, null, 'Only pre-/100 schema is permitted');
  const any = await Promise.all([
    db.department.count(), db.user.count(), db.examination.count(), db.enrollment.count(),
    db.summativeChairmanApproval.count(), db.formativeFinalResult.count(),
    db.summativeCommitteeMemberReview.count(), db.comprehensiveFinalResult.count(),
    db.summativeCalculatedMark.count(), db.auditLog.count()
  ]);
  assert.ok(any.every(n => n === 0), 'Genesis requires EMPTY academic/user baseline; never mutate an existing dataset');
}

async function seed(db) {
    await db.$transaction(async tx => {
    await tx.department.create({ data: { id: dept, code: 'CRC_TEST', slug: 'crc-test', name: 'CRC synthetic law only', status: 'ACTIVE' } });
    await tx.user.create({ data: user(fixed.operator) });
    await tx.user.create({ data: user(fixed.poe) });
    await tx.role.create({ data: { id: fixed.adminRole, departmentId: dept, code: 'department_admin', name: 'Synthetic department administrator' } });
    await tx.userRole.create({ data: { id: 'crc_fixture_admin_operator_binding', departmentId: dept, userId: fixed.operator, roleId: fixed.adminRole, assignedByUserId: fixed.operator } });
    for (const [slug, resource] of [['setup','summative-examination.setup'], ['committee','summative-examination.committee'], ['examiner_assignment','summative-examination.examiner-assignment']]) {
      const permissionId = `crc_fixture_management_${slug}_permission`;
      await tx.permission.create({ data: { id: permissionId, code: `${resource}.manage_department`, resource, action: 'manage', scope: 'DEPARTMENT' } });
      await tx.rolePermission.create({ data: { id: `crc_fixture_management_${slug}_grant`, roleId: fixed.adminRole, permissionId } });
    }
    await tx.role.create({ data: { id: fixed.teacherRole, departmentId: dept, code: 'teacher', name: 'Synthetic teacher' } });
    await tx.role.create({ data: { id: fixed.studentRole, departmentId: dept, code: 'student', name: 'Synthetic student' } });
    await tx.role.create({ data: { id: fixed.poeRole, departmentId: dept, code: 'poe_chairman', name: 'Synthetic PoE chairman' } });
    await tx.userRole.create({ data: { id: 'crc_fixture_poe_role_binding', departmentId: dept,
      userId: fixed.poe, roleId: fixed.poeRole, assignedByUserId: fixed.operator } });
    await tx.permission.create({ data: { id: fixed.memberPermission,
      code: 'summative-examination.member-review.review_department',
      resource: 'summative-examination.member-review', action: 'review', scope: 'DEPARTMENT' } });
    await tx.permission.create({ data: { id: fixed.chairmanPermission,
      code: 'summative-examination.chairman-approval.approve_department',
      resource: 'summative-examination.chairman-approval', action: 'approve', scope: 'DEPARTMENT' } });
    await tx.rolePermission.create({ data: { id: 'crc_fixture_teacher_member_grant',
      roleId: fixed.teacherRole, permissionId: fixed.memberPermission } });
    await tx.rolePermission.create({ data: { id: 'crc_fixture_teacher_chair_grant',
      roleId: fixed.teacherRole, permissionId: fixed.chairmanPermission } });
    // The real ExaminerAuthorityService requires an exact live Teacher grant;
    // an Examiner assignment alone must not authorize marking.
    await tx.permission.create({ data: { id: 'crc_fixture_examiner_marks_permission',
      code: 'summative-examination.examiner-marks.enter_department',
      resource: 'summative-examination.examiner-marks', action: 'enter', scope: 'DEPARTMENT' } });
    await tx.rolePermission.create({ data: { id: 'crc_fixture_teacher_marks_grant',
      roleId: fixed.teacherRole, permissionId: 'crc_fixture_examiner_marks_permission' } });
    await tx.academicProgram.create({ data: { id: fixed.program, departmentId: dept, code: 'CRC', name: 'Synthetic Law programme', status: 'ACTIVE' } });
    await tx.academicSession.create({ data: { id: fixed.session, departmentId: dept, code: 'CRC-2026', name: 'Synthetic 2026 session' } });
    await tx.academicYear.create({ data: { id: fixed.year, departmentId: dept,
      code: 'CRC-2026-Y', name: 'Synthetic year', startDate: early, endDate: termEnd, isCurrent: true, status: 'ACTIVE' } });
    await tx.academicTerm.create({ data: { id: fixed.term, departmentId: dept,
      academicYearId: fixed.year, code: 'CRC-TERM', name: 'Synthetic term', sequence: 1,
      startDate: early, endDate: termEnd, status: 'IN_PROGRESS' } });
    await tx.studentBatch.create({ data: { id: fixed.batch, departmentId: dept,
      academicProgramId: fixed.program, academicSessionId: fixed.session, code: 'CRC-BATCH', name: 'Synthetic batch' } });
    await tx.course.create({ data: { id: fixed.course, departmentId: dept, academicProgramId: fixed.program,
      code: 'CRC100', title: 'Synthetic Law Evidence', creditHours: '3', status: 'ACTIVE' } });
    await tx.courseAssessmentTemplate.create({ data: { id: fixed.template, departmentId: dept,
      academicProgramId: fixed.program, code: 'CRC-40-60', versionNumber: 1, name: 'Synthetic 40/60',
      totalMarks: '100', status: 'ACTIVE', approvedAt: ago } });
    for (const [componentId, code, marks, order] of [
      [fixed.componentActivities,'FORMATIVE_ACTIVITIES','30',1],
      [fixed.componentAttendance,'ATTENDANCE','5',2],
      [fixed.componentComprehensive,'COMPREHENSIVE_EXAMINATION','5',3],
      [fixed.componentSummative,'SUMMATIVE_EXAMINATION','60',4],
    ]) await tx.assessmentTemplateComponent.create({ data: { id: componentId, departmentId: dept,
      assessmentTemplateId: fixed.template, code, displayName: code, maximumMarks: marks, displayOrder: order } });
    await tx.curriculumVersion.create({ data: {
      id: fixed.curriculum, departmentId: dept, academicProgramId: fixed.program,
      code: 'CRC-CURRIC', name: 'Synthetic curriculum', status: 'ACTIVE',
      effectiveAcademicSessionCode: 'CRC-2026', durationYears: 1, totalSemesters: 1,
      creditsOffered: '3', minimumCreditsRequired: '3', totalCourses: 1,
      totalProgrammeMarks: '100', coreCredits: '3', gedCredits: '0', capstoneCredits: '0',
      coreCourseCount: 1, gedCourseCount: 0, capstoneCourseCount: 0, approvedAt: ago,
    } });
    await tx.curriculumCourse.create({ data: { id: fixed.curriculumCourse,
      departmentId: dept, curriculumVersionId: fixed.curriculum, courseId: fixed.course,
      assessmentTemplateId: fixed.template, categoryCode: 'CORE', academicYearNumber: 1,
      semesterNumber: 1, displayOrder: 1, courseCodeSnapshot: 'CRC100',
      courseTitleSnapshot: 'Synthetic Law Evidence', creditHoursSnapshot: '3', totalMarksSnapshot: '100' } });
    await tx.syllabusVersion.create({ data: { id: fixed.syllabus, departmentId: dept,
      curriculumCourseId: fixed.curriculumCourse, code: 'CRC-SYL', versionNumber: 1,
      status: 'ACTIVE', approvedAt: ago } });
    await tx.poeChairmanAssignment.create({ data: { id: 'crc_fixture_poe_assignment', departmentId: dept,
      userId: fixed.poe, recordedByUserId: fixed.operator, sourceReference: 'CRC SYNTHETIC',
      startsAt: ago, expiresAt: later } });
    for (const key of keys) {
      const examId = id(key, 'exam'), exCourseId = id(key, 'course'), offeringId = id(key, 'offering');
      const studentId = id(key, 'student'), chairmanId = id(key, 'chairman');
      const committeeId = id(key, 'committee');
      for (const uid of [studentId, chairmanId, id(key,'member1'), id(key,'member2'), id(key,'first'), id(key,'second')])
        await tx.user.create({ data: user(uid) });
      for (const [uid, suffix, roleId] of [
        [studentId,'student',fixed.studentRole], [chairmanId,'chairman',fixed.teacherRole],
        [id(key,'member1'),'member1',fixed.teacherRole], [id(key,'member2'),'member2',fixed.teacherRole],
        [id(key,'first'),'first',fixed.teacherRole], [id(key,'second'),'second',fixed.teacherRole],
      ]) await tx.userRole.create({ data: { id: id(key,`userrole_${suffix}`),
        departmentId: dept, userId: uid, roleId, assignedByUserId: fixed.operator } });
      await tx.courseOffering.create({ data: { id: offeringId, departmentId: dept,
        courseId: fixed.course, academicTermId: fixed.term, studentBatchId: fixed.batch,
        curriculumCourseId: fixed.curriculumCourse, syllabusVersionId: fixed.syllabus,
        sectionCode: key.toUpperCase(), status: 'IN_PROGRESS' } });
      await tx.studentCurriculumAssignment.create({ data: { id: id(key,'assignment'), departmentId: dept,
        studentUserId: studentId, academicProgramId: fixed.program,
        curriculumVersionId: fixed.curriculum, assignedByUserId: fixed.operator } });
      await tx.enrollment.create({ data: { id: id(key,'enrollment'), departmentId: dept,
        academicTermId: fixed.term, courseOfferingId: offeringId, studentUserId: studentId,
        studentCurriculumAssignmentId: id(key,'assignment'), curriculumCourseId: fixed.curriculumCourse,
        approvedByUserId: fixed.operator, status: 'APPROVED', eligibilityStatus: 'ELIGIBLE', enrolledAt: ago } });
      await tx.examination.create({ data: { id: examId, departmentId: dept,
        academicProgramId: fixed.program, academicSessionId: fixed.session, academicTermId: fixed.term,
        code: `CRC-${key}`.slice(0,64), name: `CRC synthetic ${key}`, categoryCode: 'REGULAR',
        ruleVersionCode: 'CRC_EXAM_V1' } });
      await tx.examinationCourse.create({ data: { id: exCourseId, departmentId: dept,
        examinationId: examId, academicProgramId: fixed.program, academicSessionId: fixed.session,
        academicTermId: fixed.term, courseOfferingId: offeringId, studentBatchId: fixed.batch,
        curriculumVersionId: fixed.curriculum, curriculumCourseId: fixed.curriculumCourse,
        syllabusVersionId: fixed.syllabus, assessmentTemplateId: fixed.template,
        summativeAssessmentComponentId: fixed.componentSummative,
        summativeFullMark: '60', ruleVersionCode: 'CRC_EXAM_V1' } });
      await tx.examinationCommittee.create({ data: { id: committeeId, departmentId: dept, examinationId: examId } });
      // Committee seats are intentionally NOT inserted here. Appointment service
      // must author the live assignments and their required audit records later.
      // Source-owner services, not this foundation, must certify the list and generate
      // Activities / Attendance / Comprehensive / Summative immutable evidence.
    }
    assert.equal(await tx.examination.count({ where: { departmentId: dept } }), 6);
    assert.equal(await tx.examinationCommittee.count({ where: { departmentId: dept } }), 6);
    assert.equal(await tx.examinationCommitteeAssignment.count({ where: { departmentId: dept } }), 0);
  }, { timeout: 90000, maxWait: 30000, isolationLevel: 'Serializable' });
  return true;
}

(async () => {
  const name = safeConnection();
  if (!process.argv.includes('--apply') || process.argv.length !== 3)
    throw Error('Use only explicit --apply; this file is a reviewed FOUNDATION stage, not a complete /100 baseline');
  const db = new PrismaClient({ datasourceUrl: raw });
  try {
    await verifyIdentity(db, name);
    await seed(db);
    console.log('SYNTHETIC_FOUNDATION=CREATED');
    console.log('SIX_CASE_ROOT_ACADEMIC_CONTEXTS=CREATED');
    console.log('COMMITTEE_APPOINTMENT_SERVICES=PENDING');
    console.log('IMMUTABLE_SOURCE_EVIDENCE=PENDING');
    console.log('BASELINE_APPROVAL=NOT_GRANTED');
    console.log('REAL_CHAIRMAN_TESTS=NOT_RUN');
  } finally { await db.$disconnect(); }
})().catch(() => { console.error('GENESIS_FAILED: disposable SQL state must be inspected; never approve this incomplete baseline'); process.exitCode=1; });
