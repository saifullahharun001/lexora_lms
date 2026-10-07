import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { AttendanceMarkGenerationService } from "../src/modules/attendance/application/services/attendance-mark-generation.service";
import { AttendanceMarkGenerationAuthorizerService } from "../src/modules/attendance/application/services/attendance-mark-generation-authorizer.service";
import { AttendanceCorrectionService } from "../src/modules/attendance/application/services/attendance-correction.service";
import { ClassSessionEvidenceService } from "../src/modules/class-session/class-session-evidence.service";
import type { PrincipalContext } from "@lexora/types";
import { calculateAttendance } from "../src/modules/attendance/domain/formative-attendance.rules";

const url = process.env.LEXORA_ATTENDANCE_TEST_DATABASE_URL;
const enabled = !!url && process.env.LEXORA_ATTENDANCE_DISPOSABLE_DB_CONFIRM === "YES_DISPOSABLE";
function statements(sql: string) {
  const result: string[] = []; let start = 0, quote = false, dollar = false, comment = false;
  for (let i = 0; i < sql.length; i++) {
    if (comment) { if (sql[i] === "\n") comment = false; continue; }
    if (!quote && !dollar && sql.slice(i, i + 2) === "--") { comment = true; i++; continue; }
    if (!quote && sql.slice(i, i + 2) === "$$") { dollar = !dollar; i++; continue; }
    if (!dollar && sql[i] === "'") { if (quote && sql[i + 1] === "'") { i++; continue; } quote = !quote; }
    if (!quote && !dollar && sql[i] === ";") { result.push(sql.slice(start, i + 1)); start = i + 1; }
  }
  const tail = sql.slice(start).trim(); if (tail) result.push(tail);
  return result.filter((part) => !/^\s*(BEGIN|COMMIT);\s*$/.test(part.replace(/--[^\n]*/g, "")));
}

test("Chairman generation PostgreSQL atomicity, provenance, irreversible freeze and concurrency", { skip: !enabled }, async (t) => {
  const parsed = new URL(url!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname));
  assert.match(parsed.pathname, /_test$/); assert.notEqual(parsed.pathname, "/lexora_lms");
  const schema = `attendance_generation_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new PrismaClient({ datasourceUrl: url }); parsed.searchParams.set("schema", schema);
  const client = new PrismaClient({ datasourceUrl: parsed.toString() });
  const execute = async (sql: string, tx: Prisma.TransactionClient = client) => {
    for (const statement of statements(sql)) await tx.$executeRawUnsafe(statement);
  };
  let sequence = 0;
  async function fixture() {
    const d = `g${++sequence}`; // Generated test identifiers only; never caller SQL.
    await execute(`
INSERT INTO departments(id) VALUES ('${d}');
INSERT INTO users(id,department_id) VALUES ('${d}-chair','${d}'),('${d}-s1','${d}'),('${d}-s2','${d}');
INSERT INTO academic_programs VALUES ('${d}-program','${d}',NULL);
INSERT INTO academic_sessions VALUES ('${d}-session','${d}',NULL);
INSERT INTO academic_terms VALUES ('${d}-term','${d}',NULL);
INSERT INTO student_batches VALUES ('${d}-batch','${d}','${d}-program','${d}-session',NULL);
INSERT INTO roles(id,department_id,code) VALUES ('${d}-role','${d}','teacher');
INSERT INTO user_roles(id,user_id,department_id,role_id) VALUES ('${d}-ur','${d}-chair','${d}','${d}-role');
INSERT INTO permissions VALUES ('${d}-permission','attendance.mark.generate_department','attendance.mark','generate','DEPARTMENT'),
 ('${d}-correction','attendance.record.correct_department','attendance.record','correct','DEPARTMENT');
INSERT INTO role_permissions VALUES ('${d}-rp','${d}-role','${d}-permission'),('${d}-crp','${d}-role','${d}-correction');
INSERT INTO examinations VALUES ('${d}-exam','${d}','${d}-program','${d}-session','${d}-term',NULL);
INSERT INTO examination_committees VALUES ('${d}-committee','${d}','${d}-exam',NULL);
INSERT INTO examination_committee_assignments(id,department_id,examination_id,committee_id,assigned_user_id,seat,assigned_at)
 VALUES ('${d}-assignment','${d}','${d}-exam','${d}-committee','${d}-chair','CHAIRMAN','2026-01-01');
INSERT INTO curriculum_versions VALUES ('${d}-cv','${d}','${d}-program');
INSERT INTO course_assessment_templates VALUES ('${d}-template','${d}',1,100,NULL);
INSERT INTO assessment_template_components VALUES
 ('${d}-a','${d}','${d}-template','FORMATIVE_ACTIVITIES',30,true),('${d}-b','${d}','${d}-template','ATTENDANCE',5,true),
 ('${d}-c','${d}','${d}-template','COMPREHENSIVE_EXAMINATION',5,true),('${d}-d','${d}','${d}-template','SUMMATIVE_EXAMINATION',60,true);
`);
    for (const n of [1, 2]) {
      await execute(`
INSERT INTO curriculum_courses VALUES ('${d}-cc${n}','${d}','${d}-course${n}','${d}-cv','${d}-template');
INSERT INTO syllabus_versions VALUES ('${d}-sv${n}','${d}','${d}-cc${n}');
INSERT INTO course_offerings(id,department_id,course_id,curriculum_course_id,syllabus_version_id,student_batch_id,academic_term_id)
 VALUES ('${d}-o${n}','${d}','${d}-course${n}','${d}-cc${n}','${d}-sv${n}','${d}-batch','${d}-term');
INSERT INTO examination_courses(id,department_id,examination_id,academic_program_id,academic_session_id,academic_term_id,
 course_offering_id,student_batch_id,curriculum_version_id,curriculum_course_id,syllabus_version_id,assessment_template_id,archived_at)
 VALUES ('${d}-ec${n}','${d}','${d}-exam','${d}-program','${d}-session','${d}-term',
 '${d}-o${n}','${d}-batch','${d}-cv','${d}-cc${n}','${d}-sv${n}','${d}-template',NULL);
INSERT INTO teacher_course_assignments(id,department_id,course_offering_id,teacher_user_id) VALUES ('${d}-teacher${n}','${d}','${d}-o${n}','${d}-chair');
INSERT INTO class_sessions(id,department_id,course_offering_id,status,actual_start_at,actual_end_at)
 VALUES ('${d}-class${n}','${d}','${d}-o${n}','ACTIVE',now()-interval '1 hour',NULL);
`);
      for (const e of [1, 2]) await execute(`
INSERT INTO enrollments(id,department_id,course_offering_id,student_user_id,academic_term_id)
 VALUES ('${d}-e${n}${e}','${d}','${d}-o${n}','${d}-s${e}','${d}-term');
INSERT INTO attendance_records(id,department_id,class_session_id,enrollment_id,student_user_id,status)
 VALUES ('${d}-r${n}${e}','${d}','${d}-class${n}','${d}-e${n}${e}','${d}-s${e}','PRESENT');
`);
      await execute(`UPDATE class_sessions SET status='COMPLETED',actual_end_at=now() WHERE id='${d}-class${n}'`);
    }
    const principal: PrincipalContext = { actorId: `${d}-chair`, actorType: "user", isAuthenticated: true, activeDepartmentId: d,
      roleAssignments: [{ userRoleId: `${d}-ur`, roleId: `${d}-role`, departmentId: d, role: "teacher" }],
      permissions: ["generate", "correct"].map((action) => ({
        id: action === "generate" ? `${d}-permission` : `${d}-correction`,
        code: action === "generate" ? "attendance.mark.generate_department" : "attendance.record.correct_department",
        rolePermissionId: action === "generate" ? `${d}-rp` : `${d}-crp`,
        resource: action === "generate" ? "attendance.mark" : "attendance.record",
        action, scope: "department", source: { userRoleId: `${d}-ur`, roleId: `${d}-role`, departmentId: d,
          rolePermissionId: action === "generate" ? `${d}-rp` : `${d}-crp`, permissionId: action === "generate" ? `${d}-permission` : `${d}-correction` } })) };
    const context = { get: () => ({ principal, departmentId: "forged", audit: {} }) };
    const authorizer = new AttendanceMarkGenerationAuthorizerService(client as never, context as never);
    const service = new AttendanceMarkGenerationService(client as never, context as never, authorizer, new ClassSessionEvidenceService(), { reconcileInTransaction: async () => [] } as never);
    const correction = new AttendanceCorrectionService(client as never, context as never, new ClassSessionEvidenceService());
    return { d, principal, context, authorizer, service, correction, generate: () => service.generate(`${d}-exam`) };
  }
  const counts = async (d: string) => {
    const [row] = await client.$queryRaw<Array<{ generations: number; versions: number; audits: number }>>(Prisma.sql`
      SELECT (SELECT count(*)::int FROM formative_attendance_generations WHERE department_id=${d}) AS generations,
        (SELECT count(*)::int FROM formative_attendance_versions WHERE department_id=${d} AND generation_id IS NOT NULL) AS versions,
        (SELECT count(*)::int FROM audit_logs WHERE department_id=${d} AND action='attendance.mark.generated') AS audits
    `); return row;
  };
  const rejectsGuard = (message: RegExp) => (error: unknown) => {
    assert.ok(error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientUnknownRequestError);
    const metadata = error instanceof Prisma.PrismaClientKnownRequestError ? error.meta : undefined;
    assert.match(`${String(error)} ${JSON.stringify(metadata)}`, message);
    return true;
  };
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await execute(readFileSync("prisma/test-fixtures/attendance-generation.sql", "utf8"));
    // Legacy unsupported evidence predates the source guards. Do not bypass a guard to manufacture it.
    const unsupported = await fixture();
    await execute(`UPDATE attendance_records SET status='LATE' WHERE id='${unsupported.d}-r22'`);
    for (const migration of ["202609230001_add_authoritative_formative_attendance", "202609270001_class_session_scheduled_end",
      "202609280001_ordinary_attendance_corrections", "202609290001_chairman_attendance_generation"]) {
      await execute(readFileSync(`prisma/migrations/${migration}/migration.sql`, "utf8"));
    }
    await t.test("historically unsupported raw status blocks the complete Examination", async () => {
      await assert.rejects(unsupported.generate());
      assert.deepEqual(await counts(unsupported.d), { generations: 0, versions: 0, audits: 0 });
    });
    await t.test("generated revision extends historical LOCKED lineage without rewriting it or inventing REOPENED", async () => {
      const f = await fixture();
      await execute(`INSERT INTO batch_coordinator_assignments(id,department_id,student_batch_id,academic_term_id,coordinator_user_id)
        VALUES ('${f.d}-coordinator','${f.d}','${f.d}-batch','${f.d}-term','${f.d}-chair')`);
      const legacy = await client.$transaction(async (tx) => {
        const identity = { departmentId: f.d, courseOfferingId: `${f.d}-o1`, enrollmentId: `${f.d}-e11`, studentUserId: `${f.d}-s1` };
        const sessions = await new ClassSessionEvidenceService().read(tx, f.d, identity.courseOfferingId);
        const records = await tx.attendanceRecord.findMany({ where: { enrollmentId: identity.enrollmentId }, select: {
          id: true, departmentId: true, classSessionId: true, enrollmentId: true, studentUserId: true, status: true,
          sourceType: true, externalSourceRef: true, markedByUserId: true, overrideByUserId: true, overrideReason: true,
          markedAt: true, updatedAt: true, archivedAt: true, resolutionStatus: true, conflictEvidenceJson: true, attendanceEvidenceRevision: true,
        } });
        const { items, diagnostics, ...calculation } = calculateAttendance(identity, sessions, records, []);
        const v = await tx.formativeAttendanceVersion.create({ data: { ...identity, ...calculation, revision: 1,
          studentBatchId: `${f.d}-batch`, academicTermId: `${f.d}-term`, coordinatorAssignmentId: `${f.d}-coordinator`,
          actorUserId: `${f.d}-chair`, configurationJson: [], diagnosticsJson: diagnostics as unknown as Prisma.InputJsonValue } });
        await tx.formativeAttendanceSourceItem.createMany({ data: items.map((i) => ({ ...i, versionId: v.id,
          departmentId: f.d, courseOfferingId: identity.courseOfferingId, enrollmentId: identity.enrollmentId })) });
        for (const state of ["VERIFIED", "FINALISED", "LOCKED"]) await tx.formativeAttendanceTransition.create({ data: {
          versionId: v.id, departmentId: f.d, courseOfferingId: identity.courseOfferingId, enrollmentId: identity.enrollmentId,
          studentBatchId: `${f.d}-batch`, academicTermId: `${f.d}-term`, actorUserId: `${f.d}-chair`, coordinatorAssignmentId: `${f.d}-coordinator`, state,
        } });
        return v;
      });
      const result = await f.generate();
      const child = await client.formativeAttendanceVersion.findFirstOrThrow({ where: { generationId: result.generationId, enrollmentId: legacy.enrollmentId } });
      assert.equal(child.previousId, legacy.id); assert.equal(child.revision, 2);
      assert.deepEqual(await client.formativeAttendanceVersion.findUnique({ where: { id: legacy.id } }), legacy);
      assert.equal(await client.formativeAttendanceTransition.count({ where: { versionId: child.id } }), 0);
      assert.equal(await client.formativeAttendanceTransition.count({ where: { departmentId: f.d, state: "REOPENED" } }), 0);
      await assert.rejects(execute(`DELETE FROM attendance_records WHERE id='${f.d}-r11'`));
      await assert.rejects(f.correction.correct({ classSessionId: `${f.d}-class1`, enrollmentId: legacy.enrollmentId, status: "ABSENT", reason: "Historical freeze" }));
    });
    await t.test("one Chairman only generates two courses/four enrollments, one audit, no transitions; freeze is irreversible", async () => {
      const f = await fixture(); const result = await f.generate();
      assert.equal(result.courseCount, 2); assert.equal(result.resultCount, 4);
      assert.deepEqual(await counts(f.d), { generations: 1, versions: 4, audits: 1 });
      assert.equal(await client.formativeAttendanceTransition.count({ where: { departmentId: f.d } }), 0);
      const versions = await client.formativeAttendanceVersion.findMany({ where: { generationId: result.generationId } });
      assert.ok(versions.every((v) => v.mark?.eq(5) && v.status === "READY" && v.coordinatorAssignmentId === null));
      await assert.rejects(f.generate());
      for (const sql of [
        `DELETE FROM attendance_records WHERE id='${f.d}-r11'`,
        `UPDATE attendance_records SET status='ABSENT' WHERE id='${f.d}-r11'`,
        `INSERT INTO attendance_records(id,department_id,class_session_id,enrollment_id,student_user_id,status) VALUES ('extra','${f.d}','${f.d}-class1','${f.d}-e11','${f.d}-s1','PRESENT')`,
        `UPDATE class_sessions SET actual_end_at=actual_end_at+interval '1 minute' WHERE id='${f.d}-class1'`,
        `DELETE FROM class_sessions WHERE id='${f.d}-class1'`,
        `INSERT INTO class_sessions(id,department_id,course_offering_id) VALUES ('extra','${f.d}','${f.d}-o1')`,
        `UPDATE formative_attendance_generations SET result_count=0 WHERE id='${result.generationId}'`,
        `DELETE FROM formative_attendance_generations WHERE id='${result.generationId}'`,
      ]) await assert.rejects(execute(sql));
      await assert.rejects(f.correction.correct({ classSessionId: `${f.d}-class1`, enrollmentId: `${f.d}-e11`, status: "ABSENT", reason: "Frozen" }));
      const v = versions[0]!;
      await assert.rejects(client.formativeAttendanceTransition.create({ data: { versionId: v.id, departmentId: v.departmentId,
        courseOfferingId: v.courseOfferingId, enrollmentId: v.enrollmentId, studentBatchId: v.studentBatchId, academicTermId: v.academicTermId,
        state: "REOPENED", reason: "Forbidden", actorUserId: f.principal.actorId, coordinatorAssignmentId: "fake" } }));
      const { id: _id, calculatedAt: _at, configurationJson, diagnosticsJson, ...fields } = v;
      const copy = { ...fields, configurationJson: configurationJson as Prisma.InputJsonValue, diagnosticsJson: diagnosticsJson as Prisma.InputJsonValue };
      await assert.rejects(client.formativeAttendanceVersion.create({ data: { ...copy, revision: v.revision + 1, previousId: v.id } }));
      await assert.rejects(client.formativeAttendanceVersion.create({ data: { ...copy, generationId: null, examinationId: null,
        examinationCourseId: null, coordinatorAssignmentId: "fake", revision: v.revision + 1, previousId: v.id } }));
      const unrelated = await fixture();
      await unrelated.correction.correct({ classSessionId: `${unrelated.d}-class1`, enrollmentId: `${unrelated.d}-e11`, status: "ABSENT", reason: "Unfrozen" });
      await unrelated.generate();
    });
    for (const fault of ["missing", "conflict", "zero", "scheduled", "active", "unbound", "template", "stale"] as const) {
      await t.test(`${fault} in the last scope rolls back the whole package and success audit`, async () => {
        const f = await fixture();
        if (fault === "missing") await execute(`DELETE FROM attendance_records WHERE id='${f.d}-r22'`);
        if (fault === "conflict") {
          // Raw writes require ACTIVE; restore the valid completed period after capturing unresolved evidence.
          await execute(`UPDATE class_sessions SET status='ACTIVE',actual_end_at=NULL WHERE id='${f.d}-class2';
            UPDATE attendance_records SET resolution_status='CONFLICT' WHERE id='${f.d}-r22';
            UPDATE class_sessions SET status='COMPLETED',actual_end_at=now() WHERE id='${f.d}-class2'`);
        }
        if (fault === "zero") await execute(`UPDATE class_sessions SET canceled_at=now() WHERE id='${f.d}-class2'`);
        if (fault === "scheduled" || fault === "active") await execute(`INSERT INTO class_sessions(id,department_id,course_offering_id,status,actual_start_at,actual_end_at)
          VALUES ('${f.d}-open','${f.d}','${f.d}-o2','${fault.toUpperCase()}',NULL,NULL)`);
        if (fault === "unbound") await execute(`UPDATE examination_courses SET student_batch_id=NULL WHERE id='${f.d}-ec2'`);
        if (fault === "template") await execute(`UPDATE assessment_template_components SET maximum_marks=4 WHERE id='${f.d}-b'`);
        if (fault === "stale") {
          await f.correction.correct({ classSessionId: `${f.d}-class2`, enrollmentId: `${f.d}-e22`, status: "ABSENT", reason: "Before source changes" });
          await execute(`UPDATE class_sessions SET actual_end_at=actual_end_at+interval '1 minute' WHERE id='${f.d}-class2'`);
        }
        await assert.rejects(f.generate()); assert.deepEqual(await counts(f.d), { generations: 0, versions: 0, audits: 0 });
      });
    }
    await t.test("persisted assignment and grant changes, including stale resolved authority, fail", async () => {
      const f = await fixture(); const authority = await f.authorizer.authorize(`${f.d}-exam`);
      for (const [set, restore] of [
        ["seat='MEMBER_1'", "seat='CHAIRMAN'"], ["expires_at=now()-interval '1 second'", "expires_at=NULL"],
        ["unassigned_at=now()", "unassigned_at=NULL"], ["archived_at=now()", "archived_at=NULL"],
        ["status='INACTIVE'", "status='ACTIVE'"], ["assigned_at=now()+interval '1 day'", "assigned_at='2026-01-01'"],
      ]) {
        await execute(`UPDATE examination_committee_assignments SET ${set} WHERE id='${f.d}-assignment'`);
        await assert.rejects(f.generate());
        await assert.rejects(client.$transaction((tx) => f.authorizer.assertCurrentAuthority(tx, authority, new Date())));
        await execute(`UPDATE examination_committee_assignments SET ${restore} WHERE id='${f.d}-assignment'`);
      }
      for (const [table, id, set, restore] of [
        ["user_roles", "ur", "revoked_at=now()", "revoked_at=NULL"],
        ["user_roles", "ur", "expires_at=now()-interval '1 second'", "expires_at=NULL"],
        ["roles", "role", "archived_at=now()", "archived_at=NULL"],
        ["users", "chair", "status='SUSPENDED'", "status='ACTIVE'"],
        ["users", "chair", "deleted_at=now()", "deleted_at=NULL"],
        ["permissions", "permission", "code='alias'", "code='attendance.mark.generate_department'"],
        ["permissions", "permission", "action='*'", "action='generate'"],
      ]) {
        await execute(`UPDATE ${table} SET ${set} WHERE id='${f.d}-${id}'`);
        await assert.rejects(f.generate());
        await assert.rejects(client.$transaction((tx) => f.authorizer.assertCurrentAuthority(tx, authority, new Date())));
        await execute(`UPDATE ${table} SET ${restore} WHERE id='${f.d}-${id}'`);
      }
      await execute(`DELETE FROM role_permissions WHERE id='${f.d}-rp'`);
      await assert.rejects(f.generate()); assert.deepEqual(await counts(f.d), { generations: 0, versions: 0, audits: 0 });
    });
    await t.test("replacement Chairman invalidates an authority already resolved outside the transaction", async () => {
      const f = await fixture(); const stale = await f.authorizer.authorize(`${f.d}-exam`);
      await execute(`UPDATE examination_committee_assignments SET status='INACTIVE',unassigned_at=now() WHERE id='${f.d}-assignment';
        INSERT INTO examination_committee_assignments(id,department_id,examination_id,committee_id,assigned_user_id,seat,assigned_at)
        VALUES ('${f.d}-replacement','${f.d}','${f.d}-exam','${f.d}-committee','${f.d}-chair','CHAIRMAN',now())`);
      await assert.rejects(client.$transaction((tx) => f.authorizer.assertCurrentAuthority(tx, stale, new Date())));
      assert.deepEqual(await counts(f.d), { generations: 0, versions: 0, audits: 0 });
    });
    await t.test("scope uses only current exact-term enrollments and freezes courses with zero applicable enrollments", async () => {
      const f = await fixture();
      await execute(`UPDATE enrollments SET status='PENDING' WHERE id='${f.d}-e12';
        UPDATE enrollments SET dropped_at=now() WHERE id='${f.d}-e21';
        UPDATE enrollments SET archived_at=now() WHERE id='${f.d}-e22';
        INSERT INTO enrollments(id,department_id,course_offering_id,student_user_id,academic_term_id)
        VALUES ('${f.d}-wrong-term','${f.d}','${f.d}-o1','${f.d}-s1','another-term')`);
      const result = await f.generate(); assert.equal(result.courseCount, 2); assert.equal(result.resultCount, 1);
      await assert.rejects(execute(`INSERT INTO class_sessions(id,department_id,course_offering_id)
        VALUES ('${f.d}-extension','${f.d}','${f.d}-o2')`));
    });
    await t.test("generated ExaminationCourse membership is frozen while Summative-only updates remain writable", async () => {
      const f = await fixture(); await f.generate();
      await assert.rejects(execute(`INSERT INTO examination_courses SELECT
        (jsonb_populate_record(NULL::examination_courses,to_jsonb(c)||'{"id":"${f.d}-extra"}'::jsonb)).*
        FROM examination_courses c WHERE id='${f.d}-ec1'`), rejectsGuard(/Examination scope cannot expand/));
      for (const field of ["department_id", "examination_id", "academic_program_id", "academic_session_id", "academic_term_id",
        "course_offering_id", "student_batch_id", "curriculum_version_id", "curriculum_course_id", "syllabus_version_id", "assessment_template_id"]) {
        await assert.rejects(execute(`UPDATE examination_courses SET ${field}='changed' WHERE id='${f.d}-ec1'`),
          rejectsGuard(/ExaminationCourse scope is immutable/));
      }
      await assert.rejects(execute(`UPDATE examination_courses SET archived_at=now() WHERE id='${f.d}-ec1'`),
        rejectsGuard(/ExaminationCourse scope is immutable/));
      await assert.rejects(execute(`DELETE FROM examination_courses WHERE id='${f.d}-ec1'`),
        rejectsGuard(/ExaminationCourse scope is immutable/));
      // Archived nonmembers remain nonmembers; unarchiving cannot expand the snapshot.
      await execute(`INSERT INTO examination_courses SELECT (jsonb_populate_record(NULL::examination_courses,
        to_jsonb(c)||jsonb_build_object('id','${f.d}-archived','archived_at',now()))).*
        FROM examination_courses c WHERE id='${f.d}-ec1'`);
      await assert.rejects(execute(`UPDATE examination_courses SET archived_at=NULL WHERE id='${f.d}-archived'`),
        rejectsGuard(/Examination scope cannot expand/));
      await execute(`DELETE FROM examination_courses WHERE id='${f.d}-archived';
        UPDATE examination_courses SET locked_question_configuration_id='later-summative-config' WHERE id='${f.d}-ec1'`);
      const [row] = await client.$queryRawUnsafe<Array<{ locked_question_configuration_id: string }>>(
        `SELECT locked_question_configuration_id FROM examination_courses WHERE id='${f.d}-ec1'`);
      assert.equal(row!.locked_question_configuration_id, "later-summative-config");
      const other = await fixture();
      await execute(`INSERT INTO examination_courses SELECT (jsonb_populate_record(NULL::examination_courses,
        to_jsonb(c)||'{"id":"${other.d}-extra"}'::jsonb)).* FROM examination_courses c WHERE id='${other.d}-ec1';
        UPDATE examination_courses SET archived_at=now() WHERE id='${other.d}-extra';
        UPDATE examination_courses SET archived_at=NULL WHERE id='${other.d}-extra';
        DELETE FROM examination_courses WHERE id='${other.d}-extra'`);
      await assert.rejects(execute(`UPDATE examination_courses SET department_id='${f.d}',examination_id='${f.d}-exam'
        WHERE id='${other.d}-ec1'`), rejectsGuard(/Examination scope cannot expand/));
    });
    await t.test("generated enrollment scope cannot gain approved, reactivated, or moved members", async () => {
      const f = await fixture();
      await execute(`UPDATE enrollments SET status='PENDING' WHERE id='${f.d}-e12';
        UPDATE enrollments SET archived_at=now() WHERE id='${f.d}-e21';
        UPDATE enrollments SET dropped_at=now() WHERE id='${f.d}-e22';
        INSERT INTO enrollments(id,department_id,course_offering_id,student_user_id,academic_term_id)
        VALUES ('${f.d}-wrong-term','${f.d}','${f.d}-o1','${f.d}-s1','other-term')`);
      await f.generate();
      await assert.rejects(execute(`INSERT INTO enrollments(id,department_id,course_offering_id,student_user_id,academic_term_id)
        VALUES ('${f.d}-new','${f.d}','${f.d}-o1','${f.d}-s1','${f.d}-term')`), rejectsGuard(/enrollment scope cannot expand/));
      for (const [id, change] of [["e12", "status='APPROVED'"], ["e21", "archived_at=NULL"], ["e22", "dropped_at=NULL"],
        ["wrong-term", `academic_term_id='${f.d}-term'`]]) {
        await assert.rejects(execute(`UPDATE enrollments SET ${change} WHERE id='${f.d}-${id}'`), rejectsGuard(/enrollment scope cannot expand/));
      }
      await execute(`INSERT INTO enrollments(id,department_id,course_offering_id,student_user_id,academic_term_id,status)
        VALUES ('${f.d}-pending','${f.d}','${f.d}-o1','${f.d}-s2','${f.d}-term','PENDING')`);
      await assert.rejects(execute(`UPDATE enrollments SET status='APPROVED' WHERE id='${f.d}-pending'`), rejectsGuard(/enrollment scope cannot expand/));
      const other = await fixture();
      await assert.rejects(execute(`UPDATE enrollments SET department_id='${f.d}',course_offering_id='${f.d}-o1',
        academic_term_id='${f.d}-term',student_user_id='${f.d}-s2' WHERE id='${other.d}-e11'`), rejectsGuard(/enrollment scope cannot expand/));
      await execute(`UPDATE enrollments SET status='PENDING' WHERE id='${other.d}-e11';
        UPDATE enrollments SET status='APPROVED' WHERE id='${other.d}-e11';
        INSERT INTO enrollments(id,department_id,course_offering_id,student_user_id,academic_term_id)
        VALUES ('${other.d}-new','${other.d}','${other.d}-o1','${other.d}-s1','${other.d}-term');
        UPDATE enrollments SET dropped_at=now() WHERE id='${f.d}-e11'`);
      assert.deepEqual(await counts(f.d), { generations: 1, versions: 1, audits: 1 });
    });
    await t.test("an entirely empty Examination fails in the service and in direct DB parent validation", async () => {
      const f = await fixture();
      await execute(`UPDATE enrollments SET status='PENDING' WHERE department_id='${f.d}'`);
      await assert.rejects(f.generate(), /no applicable Attendance enrollments/);
      const authority = await f.authorizer.authorize(`${f.d}-exam`);
      for (const resultCount of [0, 1]) await assert.rejects(client.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<Array<{ scope: Prisma.InputJsonValue }>>(Prisma.sql`
          SELECT attendance_generation_scope(${f.d},${f.d + "-exam"}) AS scope`);
        await tx.formativeAttendanceGeneration.create({ data: { departmentId: f.d, examinationId: `${f.d}-exam`,
          academicProgramId: `${f.d}-program`, academicSessionId: `${f.d}-session`, academicTermId: `${f.d}-term`,
          committeeId: authority.committeeId, chairmanAssignmentId: authority.committeeAssignmentId,
          chairmanUserId: authority.actorUserId, chairmanAssignedAtSnapshot: authority.assignmentAssignedAt,
          userRoleId: authority.userRoleId, roleId: authority.roleId, ruleVersionCode: "FORMATIVE_ATTENDANCE_5_APPROVED_20260920_V1",
          courseCount: 2, resultCount, sourceFingerprint: "a".repeat(64), scopeJson: row!.scope } });
      }), rejectsGuard(resultCount === 0 ? /attendance_generation_shape/ : /child package incomplete or inconsistent/));
      assert.deepEqual(await counts(f.d), { generations: 0, versions: 0, audits: 0 });
    });
    await t.test("incomplete or forged audit context cannot satisfy deferred generation validation", async () => {
      for (const fault of ["incomplete", "actorType", "targetType", "generationId", "examinationId", "academicTermId", "committeeId",
        "chairmanAssignmentId", "chairmanUserId", "chairmanAssignedAtSnapshot", "ruleVersionCode", "courseCount", "resultCount",
        "sourceFingerprint", "generatedAt"]) {
        const f = await fixture(); let auditAttempted = false; let databaseError: unknown;
        const service = new AttendanceMarkGenerationService({ $transaction: (work: any, options: any) => client.$transaction((tx) =>
          work(new Proxy(tx, { get(target, key) {
            if (key === "auditLog") return { create: async (args: any) => {
              auditAttempted = true;
              const data = { ...args.data, contextJson: { ...args.data.contextJson } };
              if (fault === "incomplete") data.contextJson = { generationId: data.contextJson.generationId, sourceFingerprint: data.contextJson.sourceFingerprint };
              else if (fault === "actorType") data.actorType = "SERVICE";
              else if (fault === "targetType") data.targetType = "another_academic_action";
              else data.contextJson[fault] = ["courseCount", "resultCount"].includes(fault) ? String(data.contextJson[fault]) : "forged";
              return tx.auditLog.create({ data });
            } };
            const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
          } })), options).catch((error: unknown) => { databaseError = error; throw error; }) } as never,
          f.context as never, f.authorizer, new ClassSessionEvidenceService(), { reconcileInTransaction: async () => [] } as never);
        await assert.rejects(service.generate(`${f.d}-exam`));
        assert.equal(auditAttempted, true, fault);
        rejectsGuard(/exactly one success audit/)(databaseError);
        assert.deepEqual(await counts(f.d), { generations: 0, versions: 0, audits: 0 }, fault);
      }
    });
    await t.test("incomplete parent, missing source child package, and mixed provenance cannot commit", async () => {
      const f = await fixture(); const authority = await f.authorizer.authorize(`${f.d}-exam`);
      const parent = async (tx: Prisma.TransactionClient) => {
        const [row] = await tx.$queryRaw<Array<{ scope: Prisma.InputJsonValue }>>(Prisma.sql`SELECT attendance_generation_scope(${f.d},${f.d + "-exam"}) AS scope`);
        return tx.formativeAttendanceGeneration.create({ data: { departmentId: f.d, examinationId: `${f.d}-exam`, academicProgramId: `${f.d}-program`,
          academicSessionId: `${f.d}-session`, academicTermId: `${f.d}-term`, committeeId: authority.committeeId,
          chairmanAssignmentId: authority.committeeAssignmentId, chairmanUserId: authority.actorUserId, chairmanAssignedAtSnapshot: authority.assignmentAssignedAt,
          userRoleId: authority.userRoleId, roleId: authority.roleId, ruleVersionCode: "FORMATIVE_ATTENDANCE_5_APPROVED_20260920_V1",
          courseCount: 2, resultCount: 4, sourceFingerprint: "a".repeat(64), scopeJson: row!.scope } });
      };
      await assert.rejects(client.$transaction(parent));
      for (const mixed of [false, true]) await assert.rejects(client.$transaction(async (tx) => {
        const g = await parent(tx);
        await tx.formativeAttendanceVersion.create({ data: { departmentId: f.d, courseOfferingId: `${f.d}-o1`, enrollmentId: `${f.d}-e11`,
          studentUserId: `${f.d}-s1`, studentBatchId: `${f.d}-batch`, academicTermId: `${f.d}-term`, generationId: g.id,
          examinationId: g.examinationId, examinationCourseId: `${f.d}-ec1`, actorUserId: g.chairmanUserId,
          coordinatorAssignmentId: mixed ? "fake" : null, revision: 1, ruleVersionCode: g.ruleVersionCode,
          calculationBasis: "PRESENT / VALID_CONDUCTED_CLASSES; EXACT_RATIO_V1", presentCount: 1, conductedCount: 1,
          percentage: 100, mark: 5, status: "READY", sourceFingerprint: "b".repeat(64), configurationJson: [], diagnosticsJson: [] } });
      }));
      assert.deepEqual(await counts(f.d), { generations: 0, versions: 0, audits: 0 });
    });
    await t.test("audit failure rolls back children, aggregate, freeze and success audit", async () => {
      const f = await fixture();
      // A test-specific constraint fails the real INSERT; immutable evidence triggers stay enabled.
      await execute(`ALTER TABLE audit_logs ADD CONSTRAINT test_generation_audit_failure CHECK (department_id<>'${f.d}' OR action<>'attendance.mark.generated')`);
      await assert.rejects(f.generate()); assert.deepEqual(await counts(f.d), { generations: 0, versions: 0, audits: 0 });
      await f.correction.correct({ classSessionId: `${f.d}-class1`, enrollmentId: `${f.d}-e11`, status: "ABSENT", reason: "No surviving freeze" });
    });
    await t.test("concurrent generation yields exactly one complete success", async () => {
      const f = await fixture(); const results = await Promise.allSettled([f.generate(), f.generate()]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.deepEqual(await counts(f.d), { generations: 1, versions: 4, audits: 1 });
    });
    await t.test("generation waits for the correction offering mutex before taking any Chairman authority lock", { timeout: 45000 }, async () => {
      const f = await fixture(); const databaseErrors: unknown[] = [];
      let signalOffering!: () => void, releaseCorrection!: () => void, signalScope!: () => void;
      const offeringLocked = new Promise<void>((resolve) => { signalOffering = resolve; });
      const correctionMayProceed = new Promise<void>((resolve) => { releaseCorrection = resolve; });
      const scopeRequested = new Promise<void>((resolve) => { signalScope = resolve; });
      let authorityReached = false;
      const correctionService = new AttendanceCorrectionService({ $transaction: (work: any, options: any) =>
        client.$transaction(async (tx) => {
          await tx.$executeRaw(Prisma.sql`UPDATE course_offerings SET id=id WHERE id=${f.d + "-o1"}`);
          signalOffering(); await correctionMayProceed;
          return work(tx);
        }, options).catch((error: unknown) => { databaseErrors.push(error); throw error; }) } as never,
        f.context as never, new ClassSessionEvidenceService());
      const correction = correctionService.correct({ classSessionId: `${f.d}-class1`, enrollmentId: `${f.d}-e11`, status: "ABSENT", reason: "Mutex order" });
      await Promise.race([offeringLocked, correction.then(() => { throw Error("Correction completed before the barrier"); })]);
      const generationService = new AttendanceMarkGenerationService({ $transaction: (work: any, options: any) =>
        client.$transaction((tx) => work(new Proxy(tx, { get(target, key) {
          if (key === "$queryRaw") return (query: Prisma.Sql) => {
            if (query.sql.includes("attendance_generation_scope")) signalScope();
            return target.$queryRaw(query);
          };
          const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
        } })), options).catch((error: unknown) => { databaseErrors.push(error); throw error; }) } as never,
        f.context as never, { authorize: (id: string) => f.authorizer.authorize(id),
          assertCurrentAuthority: async (...args: Parameters<AttendanceMarkGenerationAuthorizerService["assertCurrentAuthority"]>) => {
            authorityReached = true; return f.authorizer.assertCurrentAuthority(...args);
          } } as never, new ClassSessionEvidenceService(), { reconcileInTransaction: async () => [] } as never);
      const finished = Promise.allSettled([correction, generationService.generate(`${f.d}-exam`)]);
      try {
        await Promise.race([scopeRequested, finished.then(() => { throw Error("Generation never requested its scope mutex"); })]);
        assert.equal(authorityReached, false, "No Chairman authority lock may precede the offering mutexes");
      } finally { releaseCorrection(); }
      const outcomes = await finished;
      assert.ok(outcomes.every((outcome) => outcome.status === "fulfilled"), JSON.stringify(outcomes));
      for (const error of databaseErrors) assert.doesNotMatch(`${String(error)} ${JSON.stringify(error)}`, /40P01|deadlock detected/i);
      assert.deepEqual(await counts(f.d), { generations: 1, versions: 4, audits: 1 });
      const child = await client.formativeAttendanceVersion.findFirstOrThrow({ where: { departmentId: f.d, enrollmentId: `${f.d}-e11` } });
      assert.equal(child.mark?.toString(), "0");
    });
    for (const source of ["correction", "raw", "class"] as const) await t.test(`generation versus ${source} source writer is serialized`, async () => {
      const f = await fixture();
      const write = source === "correction" ? () => f.correction.correct({ classSessionId: `${f.d}-class1`, enrollmentId: `${f.d}-e11`, status: "ABSENT", reason: "Concurrent correction" })
        : source === "raw" ? () => execute(`DELETE FROM attendance_records WHERE id='${f.d}-r11'`)
        : () => execute(`INSERT INTO class_sessions(id,department_id,course_offering_id,status,actual_start_at,actual_end_at)
            VALUES ('${f.d}-open','${f.d}','${f.d}-o1','SCHEDULED',NULL,NULL)`);
      const [generation, mutation] = await Promise.allSettled([f.generate(), write()]);
      if (generation.status === "fulfilled") {
        assert.deepEqual(await counts(f.d), { generations: 1, versions: 4, audits: 1 });
        if (source !== "correction") assert.equal(mutation.status, "rejected");
        if (source === "correction" && mutation.status === "fulfilled") {
          const child = await client.formativeAttendanceVersion.findFirstOrThrow({ where: { generationId: generation.value.generationId, enrollmentId: `${f.d}-e11` } });
          assert.equal(child.mark?.toString(), "0");
        }
      } else {
        assert.equal(mutation.status, "fulfilled"); assert.deepEqual(await counts(f.d), { generations: 0, versions: 0, audits: 0 });
      }
    });
  } finally {
    // Retain this isolated disposable schema as evidence; never disable immutable triggers for cleanup.
    t.diagnostic(`Disposable PostgreSQL evidence schema: ${schema}`);
    await client.$disconnect(); await admin.$disconnect();
  }
});
