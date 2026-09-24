import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";

// Explicitly opt-in disposable local database only. Never falls back to DATABASE_URL.
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

test("SQL parser preserves a statement without a trailing semicolon", () => {
  assert.deepEqual(statements("SELECT 1"), ["SELECT 1"]);
  assert.deepEqual(statements("  SELECT 1  \n"), ["SELECT 1"]);
});

test("SQL parser preserves a terminated statement without adding an empty tail", () => {
  assert.deepEqual(statements("SELECT 1;"), ["SELECT 1;"]);
  assert.deepEqual(statements("SELECT 1; \n"), ["SELECT 1;"]);
  assert.deepEqual(statements(" \n"), []);
});

test("SQL parser preserves two statements with or without a final semicolon", () => {
  assert.deepEqual(statements("SELECT 1;SELECT 2;"), ["SELECT 1;", "SELECT 2;"]);
  assert.deepEqual(statements("SELECT 1;SELECT 2"), ["SELECT 1;", "SELECT 2"]);
});

test("SQL parser preserves internal semicolons in a dollar-quoted function body", () => {
  const sql = "CREATE FUNCTION parser_probe() RETURNS void AS $$ BEGIN PERFORM 1; PERFORM 2; END; $$ LANGUAGE plpgsql";
  assert.deepEqual(statements(sql), [sql]);
  assert.deepEqual(statements(`${sql};`), [`${sql};`]);
});

test("SQL parser filters BEGIN and COMMIT transaction wrappers", () => {
  assert.deepEqual(statements("BEGIN;SELECT 1;COMMIT;"), ["SELECT 1;"]);
  assert.deepEqual(statements("-- migration\nBEGIN;SELECT 1;-- end\nCOMMIT; \n"), ["SELECT 1;"]);
});

function isPostgresNotNullViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === "P2010"
    && error.meta?.code === "23502";
}

test("rollback probe matches structured PostgreSQL NOT NULL SQLSTATE only", async () => {
  const error = (code: string, meta?: Record<string, unknown>) => new Prisma.PrismaClientKnownRequestError(
    "Raw query failed. Code: `23502`. Message: `Failing row contains (null).`",
    { code, clientVersion: Prisma.prismaVersion.client, meta },
  );
  await assert.rejects(async () => { throw error("P2010", { code: "23502", message: "Failing row contains (null)." }); }, isPostgresNotNullViolation);
  assert.equal(isPostgresNotNullViolation(error("P2010", { code: "23514" })), false);
  assert.equal(isPostgresNotNullViolation(error("P2002", { code: "23502" })), false);
  assert.equal(isPostgresNotNullViolation(error("P2010")), false);
  assert.equal(isPostgresNotNullViolation(new Error("23502: null value")), false);
  assert.equal(isPostgresNotNullViolation(null), false);
});

test("Attendance PostgreSQL authority, immutable packages, concurrency and rollback (disposable only)", { skip: !enabled }, async (t) => {
  const parsed = new URL(url!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname));
  assert.match(parsed.pathname, /_test$/);
  const schema = `attendance_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new PrismaClient({ datasourceUrl: url });
  parsed.searchParams.set("schema", schema);
  const client = new PrismaClient({ datasourceUrl: parsed.toString() });
  const execute = async (sql: string) => { for (const statement of statements(sql)) await client.$executeRawUnsafe(statement); };
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await execute(`
CREATE TABLE departments(id TEXT PRIMARY KEY,status TEXT DEFAULT 'ACTIVE',archived_at TIMESTAMP,deleted_at TIMESTAMP);
CREATE TABLE users(id TEXT PRIMARY KEY,department_id TEXT,status TEXT DEFAULT 'ACTIVE',archived_at TIMESTAMP,deleted_at TIMESTAMP);
CREATE TABLE student_batches(id TEXT PRIMARY KEY,department_id TEXT,archived_at TIMESTAMP);
CREATE TABLE academic_terms(id TEXT PRIMARY KEY,department_id TEXT,archived_at TIMESTAMP);
CREATE TABLE batch_coordinator_assignments(id TEXT PRIMARY KEY,department_id TEXT,student_batch_id TEXT,academic_term_id TEXT,coordinator_user_id TEXT,status TEXT DEFAULT 'ACTIVE',assigned_at TIMESTAMP DEFAULT now(),expires_at TIMESTAMP,unassigned_at TIMESTAMP,archived_at TIMESTAMP);
CREATE TABLE course_offerings(id TEXT PRIMARY KEY,department_id TEXT,student_batch_id TEXT,academic_term_id TEXT,status TEXT DEFAULT 'IN_PROGRESS',archived_at TIMESTAMP);
CREATE TABLE enrollments(id TEXT PRIMARY KEY,department_id TEXT,course_offering_id TEXT,student_user_id TEXT,academic_term_id TEXT NOT NULL DEFAULT 'term',status TEXT DEFAULT 'APPROVED',archived_at TIMESTAMP,dropped_at TIMESTAMP,UNIQUE(id,department_id,course_offering_id,student_user_id));
CREATE TABLE class_sessions(id TEXT PRIMARY KEY,department_id TEXT,course_offering_id TEXT,status TEXT DEFAULT 'COMPLETED',actual_start_at TIMESTAMP DEFAULT now(),actual_end_at TIMESTAMP DEFAULT (now()+interval '1 hour'),canceled_at TIMESTAMP);
CREATE TABLE attendance_records(id TEXT PRIMARY KEY,department_id TEXT,class_session_id TEXT,enrollment_id TEXT,student_user_id TEXT,status TEXT,archived_at TIMESTAMP,UNIQUE(class_session_id,enrollment_id));
CREATE TABLE test_audits(id TEXT PRIMARY KEY);
`);
    const migration = readFileSync(path.resolve(process.cwd(), "prisma/migrations/202609230001_add_authoritative_formative_attendance/migration.sql"), "utf8");
    await execute(migration);
    await execute(`
INSERT INTO departments(id) VALUES ('law'),('other');
INSERT INTO users(id,department_id) VALUES ('coordinator','law'),('teacher','law'),('student','law'),('admin','law');
INSERT INTO student_batches VALUES ('batch','law',NULL),('wrong-batch','law',NULL);
INSERT INTO academic_terms VALUES ('term','law',NULL),('wrong-term','law',NULL);
INSERT INTO batch_coordinator_assignments(id,department_id,student_batch_id,academic_term_id,coordinator_user_id) VALUES ('assignment','law','batch','term','coordinator');
INSERT INTO course_offerings(id,department_id,student_batch_id,academic_term_id) VALUES ('offering','law','batch','term');
INSERT INTO enrollments(id,department_id,course_offering_id,student_user_id) VALUES ('enrollment','law','offering','student');
INSERT INTO class_sessions(id,department_id,course_offering_id) VALUES ('session','law','offering');
INSERT INTO attendance_records(id,department_id,class_session_id,enrollment_id,student_user_id,status) VALUES ('record','law','session','enrollment','student','PRESENT');
`);
    const version = (id: string, revision = 1, previous = "NULL") => `INSERT INTO formative_attendance_versions
      (id,department_id,course_offering_id,enrollment_id,student_user_id,student_batch_id,academic_term_id,revision,previous_id,rule_version_code,calculation_basis,present_count,conducted_count,percentage,mark,status,source_fingerprint,configuration_json,diagnostics_json,actor_user_id,coordinator_assignment_id)
      VALUES ('${id}','law','offering','enrollment','student','batch','term',${revision},${previous},'FORMATIVE_ATTENDANCE_5_APPROVED_20260920_V1','PRESENT / VALID_CONDUCTED_CLASSES; EXACT_RATIO_V1',1,1,100,5,'READY','fingerprint','{}','[]','coordinator','assignment')`;
    const item = (id: string, v: string) => `INSERT INTO formative_attendance_source_items(id,version_id,department_id,course_offering_id,enrollment_id,class_session_id,attendance_record_id,status,basis_fingerprint,evidence_json)
      VALUES ('${id}','${v}','law','offering','enrollment','session','record','PRESENT','basis','{}')`;
    const transition = (id: string, state: string, v = "v1") => `INSERT INTO formative_attendance_transitions(id,version_id,department_id,course_offering_id,enrollment_id,student_batch_id,academic_term_id,state,reason,actor_user_id,coordinator_assignment_id)
      VALUES ('${id}','${v}','law','offering','enrollment','batch','term','${state}','Evidence correction','coordinator','assignment')`;
    const correction = (id: string, v = "v1", revision = 1, status = "ABSENT") => `INSERT INTO formative_attendance_corrections
      (id,version_id,department_id,course_offering_id,enrollment_id,student_user_id,student_batch_id,academic_term_id,class_session_id,revision,status,reason,basis_fingerprint,original_evidence_json,actor_user_id,coordinator_assignment_id)
      VALUES ('${id}','${v}','law','offering','enrollment','student','batch','term','session',${revision},'${status}','Signed register','basis','{}','coordinator','assignment')`;
    const correctedItem = (id: string, v: string, c: string) => item(id, v)
      .replace("attendance_record_id,status", "attendance_record_id,correction_id,status")
      .replace("'record','PRESENT'", `'record','${c}','ABSENT'`);
    const absentVersion = (id: string, revision: number, previous: string) => version(id, revision, previous).replace("1,1,100,5,'READY'", "0,1,0,0,'READY'");
    const packageInsert = async (id: string, revision = 1, previous = "NULL") => client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(version(id, revision, previous)); await tx.$executeRawUnsafe(item(`item-${id}`, id));
    });
    await t.test("incomplete package fails at commit", async () => { await assert.rejects(execute(version("incomplete")), /incomplete|inconsistent/); });
    await t.test("exact current assignment rejects wrong batch/term/department, inactive, future, expired, revoked and archived", async () => {
      for (const change of ["student_batch_id='wrong-batch'", "academic_term_id='wrong-term'", "department_id='other'", "status='INACTIVE'",
        "assigned_at=now()+interval '1 day'", "expires_at=now()-interval '1 day'", "unassigned_at=now()", "archived_at=now()"] ) {
        await execute(`UPDATE batch_coordinator_assignments SET ${change} WHERE id='assignment'`);
        await assert.rejects(packageInsert("unauthorized"), /authority/);
        await execute("UPDATE batch_coordinator_assignments SET student_batch_id='batch',academic_term_id='term',department_id='law',status='ACTIVE',assigned_at=now(),expires_at=NULL,unassigned_at=NULL,archived_at=NULL WHERE id='assignment'");
      }
    });
    await t.test("teacher/student/admin without exact assignment cannot insert a package", async () => {
      for (const actor of ["teacher", "student", "admin"]) await assert.rejects(execute(version("bad-actor").replace("'coordinator','assignment'", `'${actor}','assignment'`)), /authority/);
    });
    // Every negative transaction is rolled back, including setup writes; force deferred guards before asserting.
    const rejectTransaction = async (setup: string[], writes: string[], pattern: RegExp | ((error: unknown) => boolean)) => {
      await assert.rejects(client.$transaction(async (tx) => {
        for (const sql of [...setup, ...writes]) await tx.$executeRawUnsafe(sql);
        await tx.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
      }), pattern);
    };
    const openSession = (status: string, canceled = false) => `INSERT INTO class_sessions(id,department_id,course_offering_id,status,actual_end_at,canceled_at)
      VALUES ('open','law','offering','${status}',NULL,${canceled ? "now()" : "NULL"})`;
    const invalidAcademicScopes = [
      ["pending enrollment", "UPDATE enrollments SET status='PENDING' WHERE id='enrollment'"],
      ["rejected enrollment", "UPDATE enrollments SET status='REJECTED' WHERE id='enrollment'"],
      ["dropped enrollment", "UPDATE enrollments SET dropped_at=now() WHERE id='enrollment'"],
      ["archived enrollment", "UPDATE enrollments SET archived_at=now() WHERE id='enrollment'"],
      ["wrong enrollment term", "UPDATE enrollments SET academic_term_id='wrong-term' WHERE id='enrollment'"],
      ["archived offering timestamp", "UPDATE course_offerings SET archived_at=now() WHERE id='offering'"],
      ["canceled offering", "UPDATE course_offerings SET status='CANCELED' WHERE id='offering'"],
      ["archived offering status", "UPDATE course_offerings SET status='ARCHIVED' WHERE id='offering'"],
    ] as const;
    for (const [label, change] of invalidAcademicScopes) await t.test(`initial package rejects ${label}`, async () => {
      await rejectTransaction([change], [version("invalid-scope"), item("invalid-scope-item", "invalid-scope")], /Attendance academic .* scope/);
    });
    await t.test("exact conducted set rejects omissions and extra non-conducted items", async () => {
      await rejectTransaction(["INSERT INTO class_sessions(id,department_id,course_offering_id) VALUES ('omitted','law','offering')"],
        [version("incomplete-set"), item("item-incomplete", "incomplete-set")], /source set/);
      await rejectTransaction([openSession("SCHEDULED")], [version("extra").replace("1,1,100,5,'READY'", "2,2,100,5,'READY'"),
        item("item-valid", "extra"), item("item-extra", "extra").replace("'session','record'", "'open',NULL")], /source set/);
    });
    for (const [label, change] of [
      ["ABSENT", "status='ABSENT'"], ["unresolved", "resolution_status='CONFLICT'"], ["archived", "archived_at=now()"],
    ]) await t.test(`${label} record cannot back fabricated PRESENT/READY package`, async () => {
      await rejectTransaction([`UPDATE attendance_records SET ${change} WHERE id='record'`],
        [version("fabricated"), item("fabricated-item", "fabricated")], /source status|source reference/);
    });
    await t.test("malformed direct AttendanceRecord identities and non-current enrollments are rejected", async () => {
      for (const values of ["'other','session','enrollment','student'", "'law','session','enrollment','teacher'", "'law','session','wrong','student'"]) {
        await assert.rejects(execute(`INSERT INTO attendance_records(id,department_id,class_session_id,enrollment_id,student_user_id,status) VALUES ('malformed',${values},'PRESENT')`), /identity/);
      }
      for (const change of ["status='PENDING'", "status='REJECTED'", "dropped_at=now()", "archived_at=now()", "course_offering_id='other'"]) {
        await rejectTransaction([`UPDATE enrollments SET ${change} WHERE id='enrollment'`],
          ["UPDATE attendance_records SET status='ABSENT' WHERE id='record'"], /identity/);
      }
    });
    await t.test("mismatched source record session/enrollment reference is rejected", async () => {
      await rejectTransaction([
        "INSERT INTO enrollments(id,department_id,course_offering_id,student_user_id) VALUES ('second-enrollment','law','offering','teacher')",
        "INSERT INTO attendance_records(id,department_id,class_session_id,enrollment_id,student_user_id,status) VALUES ('second-record','law','session','second-enrollment','teacher','PRESENT')",
      ], [version("wrong-reference"), item("wrong-item", "wrong-reference").replace("'record'", "'second-record'")], /source reference/);
    });
    await packageInsert("v1");
    for (const [label, change] of invalidAcademicScopes) await t.test(`existing version cannot verify or correct after ${label}`, async () => {
      await rejectTransaction([change], [transition("invalid-scope-verify", "VERIFIED")], /Attendance academic .* scope/);
      await rejectTransaction([change], [correction("invalid-scope-correction")], /Attendance academic .* scope/);
    });
    await t.test("new ClassSession creation remains allowed after calculation and before any historical lock", async () => {
      await execute(openSession("SCHEDULED"));
      const rows = await client.$queryRawUnsafe<Array<{ count: bigint }>>("SELECT count(*) FROM class_sessions WHERE id='open'");
      assert.equal(Number(rows[0]!.count), 1);
      await execute("DELETE FROM class_sessions WHERE id='open'");
    });
    await t.test("referenced raw records cannot be removed or reassigned beneath an immutable package", async () => {
      await assert.rejects(execute("DELETE FROM attendance_records WHERE id='record'"), /foreign key|constraint/);
      await assert.rejects(execute("UPDATE attendance_records SET student_user_id='teacher' WHERE id='record'"), /identity/);
    });
    await t.test("ordinary pre-lock capture remains possible and makes old packages stale", async () => {
      await rejectTransaction([openSession("ACTIVE"),
        "INSERT INTO attendance_records(id,department_id,class_session_id,enrollment_id,student_user_id,status) VALUES ('future-record','law','open','enrollment','student','PRESENT')",
        "UPDATE class_sessions SET status='COMPLETED',actual_end_at=actual_start_at+interval '1 hour' WHERE id='open'"],
        [transition("stale-new-session", "VERIFIED")], /source set/);
    });
    for (const [label, change] of [
      ["status", "UPDATE attendance_records SET status='ABSENT' WHERE id='record'"],
      ["resolution", "UPDATE attendance_records SET resolution_status='PENDING_REVIEW' WHERE id='record'"],
      ["archival", "UPDATE attendance_records SET archived_at=now() WHERE id='record'"],
      ["session facts", "UPDATE class_sessions SET actual_end_at=actual_end_at+interval '1 minute' WHERE id='session'"],
    ]) await t.test(`stale ${label} cannot verify/finalise/lock`, async () => {
      for (const state of ["VERIFIED", "FINALISED", "LOCKED"]) await rejectTransaction([change!], [transition(`stale-${state}`, state)], /Stale/);
    });
    await t.test("database revision stamps cannot be reset by a direct source writer", async () => {
      await rejectTransaction(["UPDATE attendance_records SET attendance_evidence_revision=0 WHERE id='record'"], [transition("forged-token", "VERIFIED")], /Stale/);
    });
    for (const status of ["SCHEDULED", "ACTIVE"]) await t.test(`${status} blocks direct finalise/lock but canceled sessions do not`, async () => {
      for (const state of ["FINALISED", "LOCKED"]) {
        await rejectTransaction([openSession(status), transition("open-verify", "VERIFIED")], [transition("open-transition", state)], /ATTENDANCE_PERIOD_OPEN/);
      }
      // A deliberate final error proves both transitions succeeded without persisting their effects.
      await rejectTransaction([openSession(status, true), transition("canceled-verify", "VERIFIED"), transition("canceled-finalise", "FINALISED"), transition("canceled-lock", "LOCKED")],
        ["INSERT INTO test_audits(id) VALUES (NULL)"], isPostgresNotNullViolation);
    });
    await t.test("deferred transition check rejects source mutation after verification in the same transaction", async () => {
      await rejectTransaction([transition("verify-before-change", "VERIFIED")], ["UPDATE attendance_records SET status='ABSENT' WHERE id='record'"], /Stale/);
    });
    await t.test("current correction and its source lineage cannot be ignored, forged or reused after source change", async () => {
      for (const state of ["VERIFIED", "FINALISED", "LOCKED"]) {
        await rejectTransaction([correction("c1")], [transition("ignored-correction", state)], /source reference/);
      }
      await rejectTransaction([correction("c1")], [version("bad-correction", 2, "'v1'"), correctedItem("bad-item", "bad-correction", "c1").replace("'ABSENT'", "'PRESENT'")], /source status/);
      await rejectTransaction([correction("c1"), correction("c2", "v1", 2)],
        [absentVersion("old-correction", 2, "'v1'"), correctedItem("old-item", "old-correction", "c1")], /source reference/);
      await rejectTransaction([correction("c1"), "UPDATE attendance_records SET status='ABSENT' WHERE id='record'"],
        [absentVersion("stale-correction", 2, "'v1'"), correctedItem("stale-item", "stale-correction", "c1")], /source status/);
      await rejectTransaction([], [correction("wrong-student").replace("'enrollment','student'", "'enrollment','teacher'")], /lineage/);
    });
    await t.test("state order, immutable source and package checks are enforced", async () => {
      await assert.rejects(execute(transition("early-lock", "LOCKED")), /lifecycle/);
      await assert.rejects(execute("UPDATE formative_attendance_versions SET mark=0 WHERE id='v1'"), /immutable/);
      await assert.rejects(execute("DELETE FROM formative_attendance_source_items WHERE version_id='v1'"), /immutable/);
      await execute(transition("verify", "VERIFIED"));
    });
    await t.test("two concurrent finalisations yield one immutable event", async () => {
      const results = await Promise.allSettled([execute(transition("finalise-a", "FINALISED")), execute(transition("finalise-b", "FINALISED"))]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    });
    await t.test("concurrent locks and opening a class serialize to one safe outcome", async () => {
      const results = await Promise.allSettled([execute(transition("lock-a", "LOCKED")), execute(transition("lock-b", "LOCKED")), execute(openSession("ACTIVE"))]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      if (results[2]!.status === "fulfilled") {
        await assert.rejects(execute(transition("open-lock", "LOCKED")), /ATTENDANCE_PERIOD_OPEN/);
        await execute("DELETE FROM class_sessions WHERE id='open'");
        const retries = await Promise.allSettled([execute(transition("lock-a", "LOCKED")), execute(transition("lock-b", "LOCKED"))]);
        assert.equal(retries.filter((r) => r.status === "fulfilled").length, 1);
      }
      const rows = await client.$queryRawUnsafe<Array<{ count: bigint }>>("SELECT count(*) FROM formative_attendance_transitions WHERE state='LOCKED'");
      assert.equal(Number(rows[0]!.count), 1);
    });
    await t.test("postlock direct source changes and replacement versions are blocked", async () => {
      await assert.rejects(execute("UPDATE attendance_records SET status='ABSENT' WHERE id='record'"), /reopening/);
      await assert.rejects(execute("UPDATE class_sessions SET status='CANCELED' WHERE id='session'"), /reopening/);
      await assert.rejects(packageInsert("uncontrolled", 2, "'v1'"), /reopened/);
    });
    await t.test("failure after reopen rolls the academic event back", async () => {
      await assert.rejects(client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(transition("rollback-reopen", "REOPENED"));
        await tx.$executeRawUnsafe("INSERT INTO test_audits(id) VALUES (NULL)");
      }));
      const rows = await client.$queryRawUnsafe<Array<{ count: bigint }>>("SELECT count(*) FROM formative_attendance_transitions WHERE state='REOPENED'");
      assert.equal(Number(rows[0]!.count), 0);
    });
    await t.test("concurrent reopening/revision cannot create competing successors", async () => {
      const reopen = (suffix: string) => client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(transition(`reopen-${suffix}`, "REOPENED"));
        await tx.$executeRawUnsafe(version(`v2-${suffix}`, 2, "'v1'"));
        await tx.$executeRawUnsafe(item(`item-v2-${suffix}`, `v2-${suffix}`));
      });
      const results = await Promise.allSettled([reopen("a"), reopen("b")]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const rows = await client.$queryRawUnsafe<Array<{ count: bigint }>>("SELECT count(*) FROM formative_attendance_versions");
      assert.equal(Number(rows[0]!.count), 2);
    });
    await t.test("historical raw records and counted classes stay immutable after reopening", async () => {
      for (const sql of ["UPDATE attendance_records SET status='ABSENT' WHERE id='record'", "DELETE FROM attendance_records WHERE id='record'",
        "UPDATE class_sessions SET actual_end_at=actual_end_at+interval '1 minute' WHERE id='session'", "DELETE FROM class_sessions WHERE id='session'"]) {
        await assert.rejects(execute(sql), /Historical locked/);
      }
    });
    await t.test("historical Attendance lock forbids new ClassSession insertion even after reopening", async () => {
      for (const status of ["SCHEDULED", "ACTIVE", "COMPLETED"]) {
        await assert.rejects(execute(openSession(status)), /Historical locked class set cannot be extended/);
      }
    });
    const current = await client.$queryRawUnsafe<Array<{ id: string }>>("SELECT id FROM formative_attendance_versions ORDER BY revision DESC LIMIT 1");
    const reopenedId = current[0]!.id;
    await t.test("correction audit failure rolls back overlay and successor", async () => {
      await assert.rejects(client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(correction("rollback-correction", reopenedId));
        await tx.$executeRawUnsafe(absentVersion("rollback-v3", 3, `'${reopenedId}'`));
        await tx.$executeRawUnsafe(correctedItem("rollback-item", "rollback-v3", "rollback-correction"));
        await tx.$executeRawUnsafe("INSERT INTO test_audits(id) VALUES (NULL)");
      }));
      const rows = await client.$queryRawUnsafe<Array<{ count: bigint }>>("SELECT count(*) FROM formative_attendance_corrections");
      assert.equal(Number(rows[0]!.count), 0);
    });
    await t.test("correction overlay creates and relocks a new immutable version without rewriting raw evidence", async () => {
      await client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(correction("final-correction", reopenedId));
        await tx.$executeRawUnsafe(absentVersion("v3", 3, `'${reopenedId}'`));
        await tx.$executeRawUnsafe(correctedItem("item-v3", "v3", "final-correction"));
        for (const state of ["VERIFIED", "FINALISED", "LOCKED"]) await tx.$executeRawUnsafe(transition(`v3-${state}`, state, "v3"));
      });
      const rows = await client.$queryRawUnsafe<Array<{ status: string }>>("SELECT status FROM attendance_records WHERE id='record'");
      assert.equal(rows[0]!.status, "PRESENT");
    });
  } finally {
    await client.$disconnect();
    assert.match(schema, /^attendance_test_[a-f0-9]{32}$/);
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
  }
});
