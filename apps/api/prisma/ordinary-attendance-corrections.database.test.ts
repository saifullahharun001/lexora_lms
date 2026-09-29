import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";

// No DATABASE_URL fallback. A separately supplied disposable local _test DB is mandatory.
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
  const tail = sql.slice(start).trim();
  if (tail) result.push(tail);
  return result.filter((part) => !/^\s*(BEGIN|COMMIT);\s*$/.test(part.replace(/--[^\n]*/g, "")));
}


test("ordinary correction PostgreSQL authority, immutable lineage, freeze and concurrency", { skip: !enabled }, async (t) => {
  const parsed = new URL(url!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname));
  assert.match(parsed.pathname, /_test$/); assert.notEqual(parsed.pathname, "/lexora_lms");
  const schema = `ordinary_attendance_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new PrismaClient({ datasourceUrl: url }); parsed.searchParams.set("schema", schema);
  const client = new PrismaClient({ datasourceUrl: parsed.toString() });
  const execute = async (sql: string) => { for (const statement of statements(sql)) await client.$executeRawUnsafe(statement); };
  const read = (name: string) => readFileSync(path.resolve(`prisma/migrations/${name}/migration.sql`), "utf8");
  const rejected = (code = "23514") => (error: unknown) => {
    assert.ok(error instanceof Prisma.PrismaClientKnownRequestError);
    assert.equal(error.code, "P2010"); assert.equal(error.meta?.code, code); return true;
  };
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await execute(`
CREATE TABLE departments(id TEXT PRIMARY KEY,status TEXT DEFAULT 'ACTIVE',archived_at TIMESTAMP,deleted_at TIMESTAMP);
CREATE TABLE users(id TEXT PRIMARY KEY,department_id TEXT,status TEXT DEFAULT 'ACTIVE',archived_at TIMESTAMP,deleted_at TIMESTAMP);
CREATE TABLE academic_programs(id TEXT PRIMARY KEY,department_id TEXT,archived_at TIMESTAMP);
CREATE TABLE academic_sessions(id TEXT PRIMARY KEY,department_id TEXT,archived_at TIMESTAMP);
CREATE TABLE student_batches(id TEXT PRIMARY KEY,department_id TEXT,academic_program_id TEXT,academic_session_id TEXT,archived_at TIMESTAMP);
CREATE TABLE academic_terms(id TEXT PRIMARY KEY,department_id TEXT,archived_at TIMESTAMP);
CREATE TABLE batch_coordinator_assignments(id TEXT PRIMARY KEY,department_id TEXT,student_batch_id TEXT,academic_term_id TEXT,coordinator_user_id TEXT,status TEXT DEFAULT 'ACTIVE',assigned_at TIMESTAMP DEFAULT now(),expires_at TIMESTAMP,unassigned_at TIMESTAMP,archived_at TIMESTAMP);
CREATE TABLE course_offerings(id TEXT PRIMARY KEY,department_id TEXT,student_batch_id TEXT,academic_term_id TEXT,status TEXT DEFAULT 'IN_PROGRESS',archived_at TIMESTAMP);
CREATE TABLE enrollments(id TEXT PRIMARY KEY,department_id TEXT,course_offering_id TEXT,student_user_id TEXT,academic_term_id TEXT NOT NULL DEFAULT 'term',status TEXT DEFAULT 'APPROVED',archived_at TIMESTAMP,dropped_at TIMESTAMP,UNIQUE(id,department_id,course_offering_id,student_user_id));
CREATE TABLE class_sessions(id TEXT PRIMARY KEY,department_id TEXT,course_offering_id TEXT,status TEXT DEFAULT 'COMPLETED',scheduled_start_at TIMESTAMP DEFAULT now(),scheduled_end_at TIMESTAMP DEFAULT (now()+interval '1 hour'),actual_start_at TIMESTAMP DEFAULT now(),actual_end_at TIMESTAMP DEFAULT (now()+interval '1 hour'),canceled_at TIMESTAMP);
CREATE TABLE attendance_records(id TEXT PRIMARY KEY,department_id TEXT,class_session_id TEXT,enrollment_id TEXT,student_user_id TEXT,status TEXT,archived_at TIMESTAMP,UNIQUE(class_session_id,enrollment_id));
CREATE TABLE test_audits(id TEXT PRIMARY KEY);
CREATE TYPE "ClassSessionStatus" AS ENUM ('SCHEDULED','ACTIVE','COMPLETED','CANCELED','LOCKED','ARCHIVED');
CREATE TABLE roles(id TEXT PRIMARY KEY,department_id TEXT,code TEXT,name TEXT,description TEXT,archived_at TIMESTAMP,created_at TIMESTAMP DEFAULT now(),updated_at TIMESTAMP DEFAULT now(),UNIQUE(department_id,code));
CREATE TABLE user_roles(id TEXT PRIMARY KEY,user_id TEXT,department_id TEXT,role_id TEXT,revoked_at TIMESTAMP,expires_at TIMESTAMP);
CREATE TABLE permissions(id TEXT PRIMARY KEY,code TEXT,resource TEXT,action TEXT,scope TEXT);
CREATE TABLE role_permissions(id TEXT PRIMARY KEY,role_id TEXT,permission_id TEXT);
CREATE TABLE teacher_course_assignments(id TEXT PRIMARY KEY,department_id TEXT,course_offering_id TEXT,teacher_user_id TEXT,status TEXT DEFAULT 'ACTIVE',assigned_at TIMESTAMP DEFAULT now(),unassigned_at TIMESTAMP,archived_at TIMESTAMP);
`);
    await execute("INSERT INTO departments(id) VALUES ('law');");
    for (const migration of ["202609230001_add_authoritative_formative_attendance", "202609270001_class_session_scheduled_end", "202609280001_ordinary_attendance_corrections"]) await execute(read(migration));
    await execute(`
INSERT INTO departments(id) VALUES ('other');
INSERT INTO users(id,department_id) VALUES ('teacher','law'),('chairman','law'),('admin','law'),('student','law'),('coordinator','law');
INSERT INTO academic_programs VALUES ('program','law',NULL);
INSERT INTO academic_sessions VALUES ('academic-session','law',NULL);
INSERT INTO student_batches VALUES ('batch','law','program','academic-session',NULL);
INSERT INTO academic_terms VALUES ('term','law',NULL);
INSERT INTO course_offerings(id,department_id,student_batch_id,academic_term_id) VALUES ('offering','law','batch','term');
INSERT INTO enrollments(id,department_id,course_offering_id,student_user_id) VALUES ('enrollment','law','offering','student');
INSERT INTO class_sessions(id,department_id,course_offering_id) VALUES ('session','law','offering');
INSERT INTO roles(id,department_id,code) VALUES ('teacher-role','law','teacher'),('admin-role','law','department_admin'),('student-role','law','student');
INSERT INTO user_roles(id,user_id,department_id,role_id) VALUES ('teacher-ur','teacher','law','teacher-role'),('chairman-ur','chairman','law','department_chairman:law'),('admin-ur','admin','law','admin-role');
INSERT INTO permissions VALUES ('permission','attendance.record.correct_department','attendance.record','correct','DEPARTMENT');
INSERT INTO role_permissions VALUES ('teacher-rp','teacher-role','permission'),('chairman-rp','department_chairman:law','permission'),('admin-rp','admin-role','permission');
INSERT INTO teacher_course_assignments(id,department_id,course_offering_id,teacher_user_id) VALUES ('assignment','law','offering','teacher');
INSERT INTO batch_coordinator_assignments(id,department_id,student_batch_id,academic_term_id,coordinator_user_id) VALUES ('coordinator-assignment','law','batch','term','coordinator');
`);
    const authority = (actor: string) => JSON.stringify({ userRoleId: `${actor}-ur`, roleId: actor === "chairman" ? "department_chairman:law" : `${actor}-role`, rolePermissionId: `${actor}-rp`, permissionId: "permission" });
    const insert = (id: string, revision: number, actor = "teacher", overrides: Record<string, string> = {}) => {
      const values: Record<string, string> = { id: `'${id}'`, department_id: "'law'", course_offering_id: "'offering'", enrollment_id: "'enrollment'", student_user_id: "'student'",
        student_batch_id: "'batch'", academic_term_id: "'term'", class_session_id: "'session'", revision: String(revision), status: "'PRESENT'", reason: "'Reviewed evidence'",
        basis_fingerprint: "'basis'", original_evidence_json: "'{}'", actor_user_id: `'${actor}'`,
        authority_kind: `'${actor === "teacher" ? "ASSIGNED_TEACHER" : actor === "chairman" ? "DEPARTMENT_CHAIRMAN" : "DEPARTMENT_ADMIN"}'`, authority_json: `'${authority(actor)}'`, ...overrides };
      return `INSERT INTO formative_attendance_corrections(${Object.keys(values).join(",")}) VALUES (${Object.values(values).join(",")})`;
    };
    const rows = () => client.$queryRawUnsafe<any[]>("SELECT * FROM formative_attendance_corrections ORDER BY revision");
    await t.test("existing and future departments bootstrap distinct ungranted Chairman roles", async () => {
      const roles = await client.$queryRawUnsafe<any[]>("SELECT department_id FROM roles WHERE code='department_chairman' ORDER BY department_id");
      assert.deepEqual(roles.map((r) => r.department_id), ["law", "other"]);
    });
    await t.test("live permission semantics, provenance, expiry, Student collision and assignment are mandatory", async () => {
      for (const [mutation, restore, code] of [
        ["UPDATE permissions SET code='alias'", "UPDATE permissions SET code='attendance.record.correct_department'", "42501"],
        ["UPDATE permissions SET resource='attendance'", "UPDATE permissions SET resource='attendance.record'", "42501"],
        ["UPDATE permissions SET action='*'", "UPDATE permissions SET action='correct'", "42501"],
        ["UPDATE permissions SET scope='SELF'", "UPDATE permissions SET scope='DEPARTMENT'", "42501"],
        ["UPDATE user_roles SET revoked_at=now() WHERE id='teacher-ur'", "UPDATE user_roles SET revoked_at=NULL WHERE id='teacher-ur'", "42501"],
        ["UPDATE user_roles SET expires_at=now()-interval '1 second' WHERE id='teacher-ur'", "UPDATE user_roles SET expires_at=NULL WHERE id='teacher-ur'", "42501"],
        ["UPDATE user_roles SET department_id='other' WHERE id='teacher-ur'", "UPDATE user_roles SET department_id='law' WHERE id='teacher-ur'", "42501"],
        ["UPDATE roles SET archived_at=now() WHERE id='teacher-role'", "UPDATE roles SET archived_at=NULL WHERE id='teacher-role'", "42501"],
        ["UPDATE teacher_course_assignments SET unassigned_at=now()", "UPDATE teacher_course_assignments SET unassigned_at=NULL", "P0002"],
        ["UPDATE teacher_course_assignments SET assigned_at=now()+interval '1 day'", "UPDATE teacher_course_assignments SET assigned_at=now()-interval '1 day'", "P0002"],
      ]) { await execute(mutation!); await assert.rejects(execute(insert("bad",1)), rejected(code)); await execute(restore!); }
      await execute("INSERT INTO user_roles(id,user_id,department_id,role_id) VALUES ('mixed','teacher','law','student-role')");
      await assert.rejects(execute(insert("bad",1)), rejected("42501")); await execute("DELETE FROM user_roles WHERE id='mixed'");
      await assert.rejects(execute(insert("bad",1,"chairman",{ authority_json: `'${authority("admin")}'` })), rejected("42501"));
      assert.equal((await rows()).length,0);
    });
    await t.test("invalid academic relationships, reason, status and non-conducted sessions fail closed", async () => {
      for (const [field, value, code] of [["department_id","'other'","P0002"], ["enrollment_id","'missing'","P0002"],
        ["course_offering_id","'other'","23514"], ["student_user_id","'teacher'","23514"], ["student_batch_id","'other'","23514"],
        ["academic_term_id","'other'","23514"], ["reason","E' \t\n '","23514"], ["status","'EXCUSED'","23514"], ["reason","repeat('x',2001)","22001"]])
        await assert.rejects(execute(insert("bad",1,"teacher",{ [field!]: value! })), rejected(code));
      await execute("UPDATE enrollments SET status='DROPPED'");
      await assert.rejects(execute(insert("bad",1)), rejected("P0002")); await execute("UPDATE enrollments SET status='APPROVED'");
      await execute("INSERT INTO class_sessions(id,department_id,course_offering_id,status,actual_start_at,actual_end_at,scheduled_end_at,non_conducted_at) VALUES ('never','law','offering','NOT_CONDUCTED',NULL,NULL,'2026-01-01','2026-01-01')");
      await assert.rejects(execute(insert("bad",1,"teacher",{ class_session_id: "'never'" })), rejected("P0002"));
    });
    await t.test("missing raw evidence supports all three authorities and preserves prior revisions", async () => {
      await execute(insert("first",1)); await execute(insert("second",2,"chairman",{ status: "'ABSENT'" })); await execute(insert("third",3,"admin"));
      const corrections = await rows(); assert.equal(corrections.length,3);
      assert.equal(corrections[0].version_id,null); assert.equal(corrections[0].coordinator_assignment_id,null);
      assert.equal(corrections[0].record_evidence_revision,null);
      assert.equal(corrections[0].authority_json.teacherCourseAssignmentId,"assignment");
      assert.equal(corrections[1].previous_evidence_json.correctionId,"first");
      assert.equal(corrections[1].previous_evidence_json.effectiveStatus,"PRESENT");
      assert.equal(corrections[2].previous_evidence_json.effectiveStatus,"ABSENT");
      assert.equal((await client.$queryRawUnsafe<any[]>("SELECT count(*)::int AS count FROM attendance_records"))[0].count,0);
      await assert.rejects(execute("UPDATE formative_attendance_corrections SET reason='rewrite' WHERE id='first'"),rejected());
      await assert.rejects(execute("DELETE FROM formative_attendance_corrections WHERE id='first'"),rejected());
      await assert.rejects(execute(insert("skip",5)),rejected());
    });
    await t.test("concurrent writers cannot persist competing revision numbers", async () => {
      const results = await Promise.allSettled([execute(insert("race-a",4)),execute(insert("race-b",4))]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length,1);
      assert.equal((await rows()).length,4);
    });
    await t.test("audit failure rolls back a real correction transaction", async () => {
      await assert.rejects(client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(insert("rolled-back",5));
        await tx.$executeRawUnsafe("INSERT INTO test_audits(id) VALUES (NULL)");
      }), rejected("23502")); assert.equal((await rows()).length,4);
    });
    const version = (id: string, rev: number, previous = "NULL") => `INSERT INTO formative_attendance_versions(id,department_id,course_offering_id,enrollment_id,student_user_id,student_batch_id,academic_term_id,revision,previous_id,rule_version_code,calculation_basis,present_count,conducted_count,percentage,mark,status,source_fingerprint,configuration_json,diagnostics_json,actor_user_id,coordinator_assignment_id)
      VALUES ('${id}','law','offering','enrollment','student','batch','term',${rev},${previous},'FORMATIVE_ATTENDANCE_5_APPROVED_20260920_V1','basis',1,1,100,5,'READY','basis','{}','[]','coordinator','coordinator-assignment')`;
    const item = (id: string, versionId: string, correctionId: string) => `INSERT INTO formative_attendance_source_items(id,version_id,department_id,course_offering_id,enrollment_id,class_session_id,correction_id,status,basis_fingerprint,evidence_json) VALUES ('${id}','${versionId}','law','offering','enrollment','session','${correctionId}','PRESENT','basis','{}')`;
    const transition = (id: string, state: string, versionId = "version") => `INSERT INTO formative_attendance_transitions(id,version_id,department_id,course_offering_id,enrollment_id,student_batch_id,academic_term_id,state,reason,actor_user_id,coordinator_assignment_id) VALUES ('${id}','${versionId}','law','offering','enrollment','batch','term','${state}','Evidence reviewed','coordinator','coordinator-assignment')`;
    await t.test("source revision changes invalidate an overlay until a fresh ordinary correction", async () => {
      await execute("UPDATE class_sessions SET actual_end_at=actual_end_at+interval '1 second' WHERE id='session'");
      const latest = (await rows()).at(-1).id;
      await assert.rejects(client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(version("stale",1));
        await tx.$executeRawUnsafe(item("stale-item","stale",latest));
        await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
      }), (error: unknown) => {
        rejected()(error);
        assert.match((error as Error).message, /Attendance source status does not match current effective evidence/);
        return true;
      });
      await execute(insert("fresh",5));
      assert.equal((await rows()).at(-1).previous_evidence_json.stale,true);
    });
    await t.test("new overlays are consumable by historical packages; legacy corrections retain exact lineage", async () => {
      const latest = (await rows()).at(-1).id;
      await client.$transaction(async (tx) => { await tx.$executeRawUnsafe(version("version",1)); await tx.$executeRawUnsafe(item("item","version",latest)); });
      await execute(insert("legacy",6,"coordinator",{ version_id: "'version'", coordinator_assignment_id: "'coordinator-assignment'", authority_kind: "'LEGACY_COORDINATOR'", authority_json: "NULL" }));
      await client.$transaction(async (tx) => { await tx.$executeRawUnsafe(version("successor",2,"'version'")); await tx.$executeRawUnsafe(item("successor-item","successor","legacy")); });
      await assert.rejects(execute(insert("wrong-legacy",7,"coordinator",{ version_id: "'version'", coordinator_assignment_id: "'coordinator-assignment'", authority_kind: "'LEGACY_COORDINATOR'", authority_json: "NULL" })),rejected());
      for (const state of ["VERIFIED","FINALISED","LOCKED"]) await execute(transition(state,state,"successor"));
      await assert.rejects(execute(insert("frozen",7)),rejected());
      await execute(transition("reopened","REOPENED","successor"));
      await assert.rejects(execute(insert("still-frozen",7,"chairman")),rejected());
      await assert.rejects(execute("UPDATE class_sessions SET actual_end_at=actual_end_at+interval '1 second' WHERE id='session'"),rejected());
    });
  } finally {
    await client.$disconnect(); await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect();
  }
});
