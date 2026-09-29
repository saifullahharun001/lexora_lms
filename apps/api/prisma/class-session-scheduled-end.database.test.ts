import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaClassSessionRepository } from "../src/modules/class-session/infrastructure/repositories/prisma-class-session.repository";

// Never uses DATABASE_URL or the application .env. Only an explicitly disposable local test DB.
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
  if (sql.slice(start).trim()) result.push(sql.slice(start));
  return result.filter((s) => !/^\s*(BEGIN|COMMIT);\s*$/.test(s.replace(/--[^\n]*/g, "")));
}

function checkViolation(pattern: RegExp) {
  return (error: unknown) => {
    assert.ok(error instanceof Prisma.PrismaClientKnownRequestError);
    assert.equal(error.code, "P2010"); assert.equal(error.meta?.code, "23514");
    assert.match(error.message, pattern);
    return true;
  };
}

test("scheduled-end PostgreSQL migration, repository atomicity and concurrent reconciliation", { skip: !enabled }, async (t) => {
  const parsed = new URL(url!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)); assert.match(parsed.pathname, /_test$/);
  const schema = `class_session_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new PrismaClient({ datasourceUrl: url }); parsed.searchParams.set("schema", schema);
  const client = new PrismaClient({ datasourceUrl: parsed.toString() });
  const execute = async (sql: string) => { for (const statement of statements(sql)) await client.$executeRawUnsafe(statement); };
  const repo = new PrismaClassSessionRepository(client as any);
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    // Minimal relational fixture for the real historical migration and real repository queries.
    await execute(`
CREATE TYPE "ClassSessionStatus" AS ENUM ('SCHEDULED','ACTIVE','COMPLETED','CANCELED','LOCKED','ARCHIVED');
CREATE TYPE "AuditActorType" AS ENUM ('USER','SERVICE','ANONYMOUS');
CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS','FAILURE','DENIED');
CREATE TABLE departments(id TEXT PRIMARY KEY,status TEXT DEFAULT 'ACTIVE',archived_at TIMESTAMP,deleted_at TIMESTAMP);
CREATE TABLE users(id TEXT PRIMARY KEY,department_id TEXT,status TEXT DEFAULT 'ACTIVE',archived_at TIMESTAMP,deleted_at TIMESTAMP);
CREATE TABLE student_batches(id TEXT PRIMARY KEY,department_id TEXT,archived_at TIMESTAMP);
CREATE TABLE academic_terms(id TEXT PRIMARY KEY,department_id TEXT,archived_at TIMESTAMP);
CREATE TABLE batch_coordinator_assignments(id TEXT PRIMARY KEY,department_id TEXT,student_batch_id TEXT,academic_term_id TEXT,coordinator_user_id TEXT,status TEXT DEFAULT 'ACTIVE',assigned_at TIMESTAMP DEFAULT now(),expires_at TIMESTAMP,unassigned_at TIMESTAMP,archived_at TIMESTAMP);
CREATE TABLE course_offerings(id TEXT PRIMARY KEY,department_id TEXT,student_batch_id TEXT,academic_term_id TEXT,status TEXT DEFAULT 'IN_PROGRESS',archived_at TIMESTAMP);
CREATE TABLE enrollments(id TEXT PRIMARY KEY,department_id TEXT,course_offering_id TEXT,student_user_id TEXT,academic_term_id TEXT DEFAULT 'term',status TEXT DEFAULT 'APPROVED',archived_at TIMESTAMP,dropped_at TIMESTAMP,UNIQUE(id,department_id,course_offering_id,student_user_id));
CREATE TABLE class_sessions(id TEXT PRIMARY KEY,department_id TEXT NOT NULL,course_offering_id TEXT NOT NULL,
 teacher_assignment_id TEXT,session_code TEXT,title TEXT,scheduled_start_at TIMESTAMP(3) NOT NULL,scheduled_end_at TIMESTAMP(3) NOT NULL,
 actual_start_at TIMESTAMP(3),actual_end_at TIMESTAMP(3),location TEXT,external_source_ref TEXT,status "ClassSessionStatus" DEFAULT 'SCHEDULED',
 locked_at TIMESTAMP(3),canceled_at TIMESTAMP(3),archived_at TIMESTAMP(3),created_at TIMESTAMP(3) DEFAULT now(),updated_at TIMESTAMP(3) DEFAULT now());
CREATE TABLE attendance_records(id TEXT PRIMARY KEY,department_id TEXT,class_session_id TEXT,enrollment_id TEXT,student_user_id TEXT,status TEXT,override_by_user_id TEXT,override_reason TEXT,archived_at TIMESTAMP,UNIQUE(class_session_id,enrollment_id));
CREATE TABLE audit_logs(id TEXT PRIMARY KEY,request_id TEXT,actor_user_id TEXT,actor_type "AuditActorType",department_id TEXT,action TEXT,
 target_type TEXT,target_id TEXT,outcome "AuditOutcome",ip_address TEXT,user_agent TEXT,context_json JSONB,occurred_at TIMESTAMP(3) DEFAULT now());
`);
    for (const name of ["202609230001_add_authoritative_formative_attendance", "202609270001_class_session_scheduled_end"]) {
      await execute(readFileSync(path.resolve(`prisma/migrations/${name}/migration.sql`), "utf8"));
    }
    await execute(`INSERT INTO departments(id) VALUES ('law');
INSERT INTO users(id,department_id) VALUES ('student','law');
INSERT INTO course_offerings(id,department_id) VALUES ('offering','law');
INSERT INTO enrollments(id,department_id,course_offering_id,student_user_id) VALUES ('enrollment','law','offering','student');`);
    const insert = async (id: string, status: string, due = true, valid = true) => {
      const end = new Date(Date.now() + (due ? -60_000 : 3_600_000));
      const start = new Date(end.getTime() - 3_600_000);
      await client.$executeRaw`INSERT INTO class_sessions(id,department_id,course_offering_id,status,scheduled_start_at,scheduled_end_at,actual_start_at)
        VALUES (${id},'law','offering',${status}::"ClassSessionStatus",${start},${end},${status === "ACTIVE" && valid ? start : null})`;
    };
    await t.test("enum, timestamp, due index and provenance check are installed", async () => {
      const indexes = await client.$queryRawUnsafe<Array<{ indexdef: string }>>("SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'class_sessions_due_idx'");
      assert.match(indexes[0]!.indexdef, /status, scheduled_end_at, id/);
      await assert.rejects(insert("invalid-non-conducted", "NOT_CONDUCTED"), /class_session_non_conducted_check/);
    });
    await t.test("concurrent sweeps produce exactly one transition and success audit per due row", async () => {
      await insert("due-active", "ACTIVE"); await insert("due-scheduled", "SCHEDULED");
      await insert("future-active", "ACTIVE", false); await insert("future-scheduled", "SCHEDULED", false);
      for (const status of ["CANCELED", "COMPLETED", "LOCKED", "ARCHIVED"]) await insert(status, status);
      const results = await Promise.all([repo.reconcileDue(), repo.reconcileDue()]);
      assert.equal(results.reduce((sum, r) => sum + r.processed, 0), 2);
      assert.equal(results.reduce((sum, r) => sum + r.conflicts, 0), 0);
      assert.equal((await repo.reconcileDue()).processed, 0);
      const rows = await client.classSession.findMany();
      const active = rows.find((r) => r.id === "due-active")!, scheduled = rows.find((r) => r.id === "due-scheduled")!;
      assert.equal(active.status, "COMPLETED"); assert.equal(active.actualEndAt!.getTime(), active.scheduledEndAt.getTime());
      assert.equal(active.canceledAt, null);
      assert.ok(active.actualStartAt); assert.equal(scheduled.status, "NOT_CONDUCTED");
      assert.equal(scheduled.actualStartAt, null); assert.equal(scheduled.actualEndAt, null);
      assert.equal(scheduled.nonConductedAt!.getTime(), scheduled.scheduledEndAt.getTime());
      assert.equal(await client.auditLog.count(), 2); assert.equal(await client.attendanceRecord.count(), 0);
      assert.equal(rows.find((r) => r.id === "future-active")!.status, "ACTIVE");
      assert.equal(rows.find((r) => r.id === "future-scheduled")!.status, "SCHEDULED");
      for (const status of ["CANCELED", "COMPLETED", "LOCKED", "ARCHIVED"]) assert.equal(rows.find((r) => r.id === status)!.status, status);
    });
    await t.test("due ACTIVE completion cannot introduce cancellation evidence and rolls back unchanged", async () => {
      await execute(`INSERT INTO class_sessions(id,department_id,course_offering_id,status,scheduled_start_at,scheduled_end_at,actual_start_at)
        VALUES ('completion-cancellation','law','offering','ACTIVE',
          (clock_timestamp() AT TIME ZONE 'UTC')-interval '1 hour',
          (clock_timestamp() AT TIME ZONE 'UTC')-interval '1 minute',
          (clock_timestamp() AT TIME ZONE 'UTC')-interval '1 hour')`);
      const before = await client.classSession.findUniqueOrThrow({ where: { id: "completion-cancellation" } });
      assert.equal(before.status, "ACTIVE"); assert.equal(before.actualEndAt, null); assert.equal(before.canceledAt, null);
      const [eligibility] = await client.$queryRaw<Array<{ due: boolean }>>`SELECT
        scheduled_end_at <= (clock_timestamp() AT TIME ZONE 'UTC') AND actual_start_at < scheduled_end_at AS due
        FROM class_sessions WHERE id='completion-cancellation'`;
      assert.equal(eligibility!.due, true);
      await assert.rejects(execute("UPDATE class_sessions SET status='COMPLETED',actual_end_at=scheduled_end_at,canceled_at=scheduled_end_at WHERE id='completion-cancellation'"),
        checkViolation(/Expired active session requires valid scheduled-end completion/));
      assert.deepEqual(await client.classSession.findUniqueOrThrow({ where: { id: "completion-cancellation" } }), before);
      assert.equal(await client.auditLog.count({ where: { targetId: "completion-cancellation" } }), 0);

      assert.equal((await repo.reconcileDue()).processed, 1);
      const completed = await client.classSession.findUniqueOrThrow({ where: { id: "completion-cancellation" } });
      assert.equal(completed.status, "COMPLETED"); assert.equal(completed.canceledAt, null);
      assert.equal(completed.actualEndAt!.getTime(), before.scheduledEndAt.getTime());
      assert.deepEqual(completed.actualStartAt, before.actualStartAt);
      assert.equal(await client.auditLog.count({ where: { targetId: "completion-cancellation" } }), 1);
    });
    await t.test("future SCHEDULED without Attendance cannot be changed directly to NOT_CONDUCTED", async () => {
      await insert("premature", "SCHEDULED", false);
      const before = await client.classSession.findUniqueOrThrow({ where: { id: "premature" } });
      const evidence = await client.$queryRaw<Array<{ exists: boolean }>>`SELECT EXISTS (
        SELECT 1 FROM attendance_records WHERE class_session_id = 'premature'
        UNION ALL SELECT 1 FROM formative_attendance_source_items WHERE class_session_id = 'premature'
        UNION ALL SELECT 1 FROM formative_attendance_corrections WHERE class_session_id = 'premature'
      ) AS "exists"`;
      assert.equal(evidence[0]!.exists, false);
      await assert.rejects(execute("UPDATE class_sessions SET status='NOT_CONDUCTED',non_conducted_at=scheduled_end_at WHERE id='premature'"), checkViolation(/scheduled end has not been reached/));
      assert.deepEqual(await client.classSession.findUniqueOrThrow({ where: { id: "premature" } }), before);
    });
    await t.test("non-conducted transition preserves the exact due schedule and null start/end/cancellation evidence", async () => {
      await insert("invariant-due", "SCHEDULED");
      const before = await client.classSession.findUniqueOrThrow({ where: { id: "invariant-due" } });
      for (const change of ["scheduled_start_at=scheduled_start_at-interval '1 minute'",
        "scheduled_end_at=scheduled_end_at+interval '1 minute'", "actual_start_at=scheduled_start_at",
        "actual_end_at=scheduled_end_at", "canceled_at=scheduled_end_at"]) {
        await assert.rejects(execute(`UPDATE class_sessions SET status='NOT_CONDUCTED',non_conducted_at=scheduled_end_at,${change} WHERE id='invariant-due'`), checkViolation(/unchanged schedule and never-started evidence/));
      }
      for (const timestamp of ["NULL", "scheduled_end_at+interval '1 minute'"]) {
        await assert.rejects(execute(`UPDATE class_sessions SET status='NOT_CONDUCTED',non_conducted_at=${timestamp} WHERE id='invariant-due'`), checkViolation(/unchanged schedule and never-started evidence/));
      }
      assert.deepEqual(await client.classSession.findUniqueOrThrow({ where: { id: "invariant-due" } }), before);
      for (const id of ["due-active", "CANCELED", "LOCKED", "ARCHIVED"]) {
        await assert.rejects(client.$executeRaw`UPDATE class_sessions SET status='NOT_CONDUCTED',actual_start_at=NULL,actual_end_at=NULL,non_conducted_at=scheduled_end_at WHERE id=${id}`, checkViolation(/Only a scheduled class session/));
      }
      // The unchanged real repository must still accept a genuinely due, clean SCHEDULED row.
      assert.equal((await repo.reconcileDue()).processed, 1);
      assert.equal((await client.classSession.findUniqueOrThrow({ where: { id: "invariant-due" } })).status, "NOT_CONDUCTED");
    });
    await t.test("generic SCHEDULED update rejects a new deadline at or before database time and permits future rescheduling", async () => {
      await insert("reschedule", "SCHEDULED", false);
      const before = await client.classSession.findUniqueOrThrow({ where: { id: "reschedule" } });
      for (const end of ["date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC')", "(clock_timestamp() AT TIME ZONE 'UTC')-interval '1 minute'"]) {
        await assert.rejects(execute(`UPDATE class_sessions SET scheduled_end_at=${end} WHERE id='reschedule'`), checkViolation(/future scheduled end/));
      }
      assert.deepEqual(await client.classSession.findUniqueOrThrow({ where: { id: "reschedule" } }), before);
      await execute("UPDATE class_sessions SET scheduled_end_at=(clock_timestamp() AT TIME ZONE 'UTC')+interval '2 hours' WHERE id='reschedule'");
      assert.equal((await client.classSession.findUniqueOrThrow({ where: { id: "reschedule" } })).status, "SCHEDULED");
    });
    await t.test("expired activation, schedule extension and cancellation cannot race the sweep", async () => {
      await insert("lag-scheduled", "SCHEDULED"); await insert("lag-active", "ACTIVE");
      for (const change of ["status='ACTIVE',actual_start_at=clock_timestamp()", "scheduled_end_at=clock_timestamp()+interval '1 hour'", "status='CANCELED'"]) {
        await assert.rejects(execute(`UPDATE class_sessions SET ${change} WHERE id='lag-scheduled'`));
      }
      await assert.rejects(execute("UPDATE class_sessions SET status='CANCELED' WHERE id='lag-active'"));
      await execute("UPDATE class_sessions SET scheduled_end_at=scheduled_end_at+interval '1 hour' WHERE id='future-scheduled'");
    });
    await t.test("database capture deadline rejects lagging ACTIVE and non-conducted, while before-end capture works", async () => {
      const capture = (session: string) => client.$executeRaw`INSERT INTO attendance_records(id,department_id,class_session_id,enrollment_id,student_user_id,status)
        VALUES (${`record-${session}`},'law',${session},'enrollment','student','PRESENT')`;
      await capture("future-active");
      await assert.rejects(capture("lag-active"), /before scheduledEndAt/);
      await assert.rejects(capture("due-scheduled"), /before scheduledEndAt/);
    });
    await repo.reconcileDue();
    await t.test("corrupt ACTIVE evidence is untouched and surfaced", async () => {
      await insert("corrupt", "ACTIVE", true, false);
      assert.equal((await repo.reconcileDue()).conflicts, 1);
      assert.equal((await client.classSession.findUniqueOrThrow({ where: { id: "corrupt" } })).status, "ACTIVE");
      assert.equal(await client.auditLog.count({ where: { targetId: "corrupt" } }), 0);
    });
    await t.test("audit failure rolls back the real database mutation and evidence revision", async () => {
      await insert("audit-failure", "ACTIVE");
      const before = await client.classSession.findUniqueOrThrow({ where: { id: "audit-failure" } });
      await execute("ALTER TABLE audit_logs ADD CONSTRAINT test_audit_failure CHECK (target_id <> 'audit-failure')");
      assert.ok((await repo.reconcileDue()).conflicts >= 1);
      const after = await client.classSession.findUniqueOrThrow({ where: { id: "audit-failure" } });
      assert.equal(after.status, "ACTIVE"); assert.equal(after.actualEndAt, null);
      assert.equal(after.attendanceEvidenceRevision, before.attendanceEvidenceRevision);
      assert.equal(await client.auditLog.count({ where: { targetId: "audit-failure" } }), 0);
      await execute("ALTER TABLE audit_logs DROP CONSTRAINT test_audit_failure");
      assert.equal((await repo.reconcileDue()).processed, 1);
    });
    await t.test("bounded sweep continues with keyset cursor", async () => {
      for (let i = 0; i < 105; i++) await insert(`page-${i}`, "SCHEDULED");
      const first = await repo.reconcileDue(); assert.ok(first.cursor); assert.ok(first.processed <= 100);
      const next = await repo.reconcileDue(first.cursor!); assert.equal(first.processed + next.processed, 105);
    });
    await t.test("contradictory raw evidence prevents non-conducted reconciliation and direct transition", async () => {
      // Exclude the persistent older corrupt fixture using the real repository's existing cursor.
      const [boundary] = await client.$queryRaw<Array<{ cutoff: Date }>>`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS cutoff`;
      const cursor = { scheduledEndAt: boundary!.cutoff, id: "" };
      // One database command keeps the valid capture and corruption setup ahead of a short deadline.
      // No schedule backdating and no disabled/removed guards: model pre-existing contradictory state only.
      await execute(`DO $$ BEGIN
        INSERT INTO class_sessions(id,department_id,course_offering_id,status,scheduled_start_at,scheduled_end_at,actual_start_at)
        VALUES ('contradictory','law','offering','ACTIVE',
          (clock_timestamp() AT TIME ZONE 'UTC')-interval '1 hour',
          (clock_timestamp() AT TIME ZONE 'UTC')+interval '1 second',
          (clock_timestamp() AT TIME ZONE 'UTC')-interval '1 hour');
        INSERT INTO attendance_records(id,department_id,class_session_id,enrollment_id,student_user_id,status)
        VALUES ('contradictory-record','law','contradictory','enrollment','student','PRESENT');
        UPDATE class_sessions SET status='SCHEDULED',actual_start_at=NULL WHERE id='contradictory';
      END; $$;`);
      const before = await client.classSession.findUniqueOrThrow({ where: { id: "contradictory" } });
      const recordBefore = await client.$queryRaw`SELECT * FROM attendance_records WHERE id='contradictory-record'`;
      assert.equal(before.status, "SCHEDULED"); assert.equal(before.actualStartAt, null);
      // Wait only for the remaining deadline (at most ~1 second), measured by the database clock.
      await client.$executeRaw`SELECT pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM
        (scheduled_end_at - (clock_timestamp() AT TIME ZONE 'UTC')))) + 0.02)
        FROM class_sessions WHERE id='contradictory'`;
      const candidates = await client.$queryRaw<Array<{ id: string }>>`SELECT id FROM class_sessions
        WHERE status IN ('SCHEDULED','ACTIVE') AND scheduled_end_at <= (statement_timestamp() AT TIME ZONE 'UTC')
        AND (scheduled_end_at,id) > (${cursor.scheduledEndAt},${cursor.id}) ORDER BY scheduled_end_at,id`;
      assert.deepEqual(candidates, [{ id: "contradictory" }]);
      const result = await repo.reconcileDue(cursor);
      assert.deepEqual(result, { processed: 0, conflicts: 1, cursor: null });
      assert.deepEqual(await client.classSession.findUniqueOrThrow({ where: { id: "contradictory" } }), before);
      assert.deepEqual(await client.$queryRaw`SELECT * FROM attendance_records WHERE id='contradictory-record'`, recordBefore);
      assert.equal(await client.auditLog.count({ where: { targetId: "contradictory" } }), 0);
      await assert.rejects(execute("UPDATE class_sessions SET status='NOT_CONDUCTED',non_conducted_at=scheduled_end_at WHERE id='contradictory'"), checkViolation(/contradictory Attendance evidence/));
      assert.deepEqual(await client.classSession.findUniqueOrThrow({ where: { id: "contradictory" } }), before);
      assert.deepEqual(await client.$queryRaw`SELECT * FROM attendance_records WHERE id='contradictory-record'`, recordBefore);
    });
    await t.test("post-class corrections use the existing protected overlay, not mutable raw override fields", async () => {
      await execute(`INSERT INTO users(id,department_id) VALUES ('coordinator','law'),('wrong-actor','law');
INSERT INTO student_batches(id,department_id) VALUES ('batch','law');
INSERT INTO academic_terms(id,department_id) VALUES ('term','law');
INSERT INTO batch_coordinator_assignments(id,department_id,student_batch_id,academic_term_id,coordinator_user_id) VALUES ('assignment','law','batch','term','coordinator');
INSERT INTO course_offerings(id,department_id,student_batch_id,academic_term_id) VALUES ('correction-offering','law','batch','term');
INSERT INTO enrollments(id,department_id,course_offering_id,student_user_id) VALUES ('correction-enrollment','law','correction-offering','student');
INSERT INTO class_sessions(id,department_id,course_offering_id,status,scheduled_start_at,scheduled_end_at,actual_start_at)
VALUES ('correction-session','law','correction-offering','ACTIVE',now()-interval '1 hour',now()+interval '1 hour',now()-interval '1 hour');
INSERT INTO attendance_records(id,department_id,class_session_id,enrollment_id,student_user_id,status)
VALUES ('correction-record','law','correction-session','correction-enrollment','student','PRESENT');
UPDATE class_sessions SET status='COMPLETED',actual_end_at=actual_start_at+interval '30 minutes',scheduled_end_at=actual_start_at+interval '30 minutes' WHERE id='correction-session';`);
      await assert.rejects(execute("UPDATE attendance_records SET status='ABSENT' WHERE id='correction-record'"), /before scheduledEndAt/);
      await assert.rejects(execute("UPDATE attendance_records SET status='ABSENT',override_by_user_id='coordinator',override_reason='Claimed correction' WHERE id='correction-record'"), /before scheduledEndAt/);
      const version = (id: string, previous: string, revision: number, absent: boolean) => `INSERT INTO formative_attendance_versions
(id,department_id,course_offering_id,enrollment_id,student_user_id,student_batch_id,academic_term_id,revision,previous_id,rule_version_code,calculation_basis,present_count,conducted_count,percentage,mark,status,source_fingerprint,configuration_json,diagnostics_json,actor_user_id,coordinator_assignment_id)
VALUES ('${id}','law','correction-offering','correction-enrollment','student','batch','term',${revision},${previous},'FORMATIVE_ATTENDANCE_5_APPROVED_20260920_V1','PRESENT / VALID_CONDUCTED_CLASSES; EXACT_RATIO_V1',${absent ? 0 : 1},1,${absent ? 0 : 100},${absent ? 0 : 5},'READY','fingerprint','{}','[]','coordinator','assignment')`;
      const item = (id: string, versionId: string, correctionId: string, status: string) => `INSERT INTO formative_attendance_source_items
(id,version_id,department_id,course_offering_id,enrollment_id,class_session_id,attendance_record_id,correction_id,status,basis_fingerprint,evidence_json)
VALUES ('${id}','${versionId}','law','correction-offering','correction-enrollment','correction-session','correction-record',${correctionId},'${status}','basis','{}')`;
      const correction = (actor = "coordinator", department = "law", reason = "Signed register") => `INSERT INTO formative_attendance_corrections
(id,version_id,department_id,course_offering_id,enrollment_id,student_user_id,student_batch_id,academic_term_id,class_session_id,revision,status,reason,basis_fingerprint,original_evidence_json,actor_user_id,coordinator_assignment_id)
VALUES ('correction','v1','${department}','correction-offering','correction-enrollment','student','batch','term','correction-session',1,'ABSENT','${reason}','basis','{}','${actor}','assignment')`;
      await client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(version("v1", "NULL", 1, false));
        await tx.$executeRawUnsafe(item("item1", "v1", "NULL", "PRESENT"));
      });
      for (const sql of [correction("wrong-actor"), correction("coordinator", "other"), correction("coordinator", "law", "  ")]) await assert.rejects(execute(sql));
      await client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(correction());
        await tx.$executeRawUnsafe(version("v2", "'v1'", 2, true));
        await tx.$executeRawUnsafe(item("item2", "v2", "'correction'", "ABSENT"));
        await tx.auditLog.create({ data: { actorUserId: "coordinator", actorType: "USER", departmentId: "law",
          action: "attendance.formative.corrected", targetType: "formative_attendance", targetId: "correction", outcome: "SUCCESS", contextJson: { reason: "Signed register" } } });
      });
      const rows = await client.$queryRawUnsafe<Array<{ status: string }>>("SELECT status FROM attendance_records WHERE id='correction-record'");
      assert.equal(rows[0]!.status, "PRESENT");
      const overlays = await client.$queryRawUnsafe<Array<{
        status: string;
        actor_user_id: string;
        occurred_at: Date;
      }>>("SELECT status, actor_user_id, occurred_at FROM formative_attendance_corrections WHERE id='correction'");
      assert.equal(overlays.length, 1);
      const overlay = overlays[0]!;
      assert.equal(overlay.status, "ABSENT");
      assert.equal(overlay.actor_user_id, "coordinator");
      assert.ok(overlay.occurred_at);
      for (const state of ["VERIFIED", "FINALISED", "LOCKED"]) await execute(`INSERT INTO formative_attendance_transitions
(id,version_id,department_id,course_offering_id,enrollment_id,student_batch_id,academic_term_id,state,actor_user_id,coordinator_assignment_id)
VALUES ('${state}','v2','law','correction-offering','correction-enrollment','batch','term','${state}','coordinator','assignment')`);
      await assert.rejects(execute("UPDATE attendance_records SET status='ABSENT' WHERE id='correction-record'"), /Historical locked/);
      await assert.rejects(execute("UPDATE formative_attendance_corrections SET status='PRESENT' WHERE id='correction'"), /immutable/);
      await assert.rejects(execute(correction().replace("'correction','v1'", "'blocked','v2'").replace(",1,'ABSENT'", ",2,'ABSENT'")), /fresh calculated/);
    });

  } finally {
    await client.$disconnect(); assert.match(schema, /^class_session_test_[a-f0-9]{32}$/);
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect();
  }
});
