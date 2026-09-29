import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
const read = (name: string) => readFileSync(path.resolve(`prisma/migrations/${name}/migration.sql`), "utf8");
const migration = read("202609280001_ordinary_attendance_corrections");
const historical = read("202609230001_add_authoritative_formative_attendance");
const schema = readFileSync(path.resolve("prisma/schema.prisma"), "utf8");
test("ordinary overlay is additive; historical relations and immutability remain intact", () => {
  assert.match(schema, /model FormativeAttendanceCorrection[\s\S]*versionId String\?/);
  assert.match(schema, /authorityKind String @default\("LEGACY_COORDINATOR"\)/);
  assert.match(migration, /version_id IS NOT NULL AND coordinator_assignment_id IS NOT NULL/);
  assert.match(migration, /version_id IS NULL AND coordinator_assignment_id IS NULL/);
  assert.match(migration, /WHEN \(NEW.authority_kind = 'LEGACY_COORDINATOR'\) EXECUTE FUNCTION attendance_academic_insert/);
  assert.doesNotMatch(migration, /(?:CREATE OR REPLACE FUNCTION attendance_academic_insert|DROP TABLE|DISABLE TRIGGER|UPDATE formative_attendance_|DELETE FROM)/);
  assert.doesNotMatch(migration, /DROP TRIGGER (?:attendance_.*immutable|attendance_record_write_guard|attendance_session_write_guard|class_session_)/);
});
test("package validator changes only the legacy version-lineage predicate", () => {
  const original = historical.slice(historical.indexOf("CREATE FUNCTION attendance_validate_package("), historical.indexOf("-- Deferred validation"));
  const expected = original.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION")
    .replace("        NOT EXISTS(WITH RECURSIVE lineage AS (", "        (c.authority_kind = 'LEGACY_COORDINATOR' AND NOT EXISTS(WITH RECURSIVE lineage AS (")
    .replace(") SELECT 1 FROM lineage WHERE id = c.version_id) THEN", ") SELECT 1 FROM lineage WHERE id = c.version_id)) THEN");
  assert.ok(migration.includes(expected));
});
test("shared resolver enforces live exact authority, relationships, conducted status and permanent historical freeze", () => {
  for (const predicate of ["UPDATE course_offerings SET id = id", "FOR SHARE OF ur,r,rp,pm", "ur.revoked_at IS NULL",
    "ur.expires_at > clock_timestamp()", "r.archived_at IS NULL", "pm.code = 'attendance.record.correct_department'",
    "pm.resource = 'attendance.record'", "pm.action = 'correct'", "pm.scope::text = 'DEPARTMENT'",
    "rp.id = authority->>'rolePermissionId'", "ur.id = authority->>'userRoleId'", "r.code = 'student'",
    "a.assigned_at <= clock_timestamp()", "a.unassigned_at IS NULL AND a.archived_at IS NULL",
    "en.academic_term_id = o.academic_term_id", "u.department_id = en.department_id", "en.status::text = 'APPROVED'",
    "actual_end_at > actual_start_at", "NEW.revision <> COALESCE(previous.revision,0) + 1", "NEW.occurred_at := clock_timestamp()",
    "NEW.previous_evidence_json := jsonb_build_object", "'teacherCourseAssignmentId',teacher_id"]) assert.ok(migration.includes(predicate), predicate);
  const freeze = migration.slice(migration.indexOf("CREATE FUNCTION attendance_assert_correction_open"), migration.indexOf("-- One authority/object"));
  assert.match(freeze, /t.state = 'LOCKED'/); assert.doesNotMatch(freeze, /REOPENED|previous_id|NOT EXISTS/);
});
test("department insert bootstraps Chairman without appointments, permissions or role resolver exceptions", () => {
  assert.match(migration, /AFTER INSERT ON departments/);
  assert.match(migration, /CURRENT_TIMESTAMP FROM departments/);
  const bootstrap = migration.slice(0, migration.indexOf("ALTER TABLE"));
  assert.doesNotMatch(bootstrap, /INSERT INTO (user_roles|role_permissions)|UPDATE roles/);
  assert.match(bootstrap, /ON CONFLICT \(department_id, code\) DO NOTHING/);
});
