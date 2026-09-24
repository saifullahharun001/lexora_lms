import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const schema = readFileSync(path.resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(path.resolve(process.cwd(), "prisma/migrations/202609230001_add_authoritative_formative_attendance/migration.sql"), "utf8");

test("Attendance uses immutable versions, relational source references and restricted scoped identity", () => {
  for (const table of ["versions", "source_items", "transitions", "corrections"]) {
    assert.ok(migration.includes(`BEFORE UPDATE OR DELETE ON formative_attendance_${table}`));
  }
  assert.doesNotMatch(migration, /ON DELETE (CASCADE|SET NULL)|DROP TYPE|DROP TABLE|ALTER TYPE/);
  assert.match(migration, /attendance_revision_uq/);
  assert.match(migration, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(migration, /previous_id IS DISTINCT FROM prior.id/);
  assert.match(migration, /NEW.coordinator_assignment_id/);
  assert.match(migration, /a.expires_at > clock_timestamp\(\)/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OR DELETE ON attendance_records/);
  assert.match(migration, /BEFORE INSERT OR UPDATE OR DELETE ON class_sessions/);
});
test("shared enum compatibility remains while authoritative values and arithmetic reject legacy statuses", () => {
  assert.match(schema, /enum AttendanceRecordStatus\s*\{\s*PRESENT\s*ABSENT\s*LATE\s*EXCUSED\s*\}/);
  assert.match(migration, /status IN \('PRESENT','ABSENT'\)/);
  assert.match(migration, /present_count::bigint \* 100 >= conducted_count::bigint \* 90/);
  assert.doesNotMatch(migration, /eligibility_snapshot|ELIGIBILITY_FINALISED|TEACHER_SUBMITTED/);
});

test("packages and transitions validate the exact conducted set and effective relational evidence", () => {
  assert.match(migration, /CREATE FUNCTION attendance_validate_package/);
  assert.equal((migration.match(/EXCEPT SELECT/g) ?? []).length, 2);
  assert.match(migration, /actual_end_at > actual_start_at/);
  assert.match(migration, /r.resolution_status = 'RESOLVED'/);
  assert.match(migration, /r.archived_at IS NULL/);
  assert.match(migration, /i.status IS DISTINCT FROM expected_status/);
  assert.match(migration, /i.correction_id IS DISTINCT FROM c.id/);
  assert.match(migration, /WITH RECURSIVE lineage/);
  assert.match(migration, /ORDER BY revision DESC LIMIT 1/);
  assert.match(migration, /attendance_validate_package\(v.id\)/);
  assert.match(migration, /attendance_transition_current AFTER INSERT/);
});

test("database-owned revision stamps invalidate changed or replaced evidence without trusting JSON", () => {
  assert.match(migration, /NEW.attendance_evidence_revision := nextval/);
  assert.match(migration, /INTO NEW.session_evidence_revision/);
  assert.match(migration, /INTO NEW.record_evidence_revision/);
  assert.match(migration, /i.record_evidence_revision IS DISTINCT FROM r.attendance_evidence_revision/);
  assert.match(migration, /c.record_evidence_revision IS NOT DISTINCT FROM r.attendance_evidence_revision/);
  assert.match(migration, /UPDATE course_offerings SET id = id/);
  assert.doesNotMatch(migration, /CREATE EXTENSION|evidence_json\s*->/);
});

test("closure and historical locks survive direct writes and reopening", () => {
  assert.match(migration, /NEW.state IN \('FINALISED','LOCKED'\)[\s\S]*ATTENDANCE_PERIOD_OPEN/);
  assert.match(migration, /status::text IN \('SCHEDULED','ACTIVE'\) AND canceled_at IS NULL/);
  const historical = migration.slice(migration.indexOf("IF TG_TABLE_NAME = 'attendance_records' AND EXISTS"), migration.indexOf("IF EXISTS(SELECT 1 FROM formative_attendance_versions v", migration.indexOf("Historical locked class")));
  assert.match(historical, /t.state = 'LOCKED'/);
  assert.doesNotMatch(historical, /previous_id|REOPENED/);
  assert.match(historical, /i.class_session_id = OLD.id/);
  assert.match(migration, /e.course_offering_id = offering AND e.student_user_id = NEW.student_user_id/);
  assert.match(migration, /e.status::text = 'APPROVED' AND e.archived_at IS NULL AND e.dropped_at IS NULL FOR SHARE/);
});

test("every academic insert revalidates current offering and enrollment with version-derived student identity", () => {
  const guard = migration.slice(migration.indexOf("CREATE FUNCTION attendance_academic_insert"), migration.indexOf("CREATE TRIGGER attendance_version_insert"));
  for (const predicate of ["id = NEW.course_offering_id AND department_id = NEW.department_id",
    "student_batch_id = NEW.student_batch_id AND academic_term_id = NEW.academic_term_id",
    "student_batch_id IS NOT NULL AND archived_at IS NULL AND status::text NOT IN ('CANCELED','ARCHIVED')",
    "e.id = NEW.enrollment_id AND e.department_id = NEW.department_id",
    "e.course_offering_id = NEW.course_offering_id AND e.student_user_id = student_identity",
    "e.academic_term_id = NEW.academic_term_id AND e.status::text = 'APPROVED'",
    "e.archived_at IS NULL AND e.dropped_at IS NULL FOR SHARE OF e"]) assert.ok(guard.includes(predicate), predicate);
  assert.match(guard, /IF NOT FOUND THEN RAISE EXCEPTION 'Attendance academic offering scope/);
  assert.match(guard, /IF NOT FOUND THEN RAISE EXCEPTION 'Attendance academic enrollment scope/);
  assert.match(guard, /IF TG_TABLE_NAME = 'formative_attendance_versions' THEN\s+student_identity := NEW.student_user_id;\s+ELSE[\s\S]*student_identity := v.student_user_id;/);
  assert.match(guard, /v.id IS DISTINCT FROM prior.id/);
  for (const table of ["versions", "transitions", "corrections"]) {
    assert.ok(migration.includes(`BEFORE INSERT ON formative_attendance_${table} FOR EACH ROW EXECUTE FUNCTION attendance_academic_insert()`));
  }
});

test("new class insertion checks all historical offering locks without treating reopening as permission", () => {
  const start = migration.indexOf("IF TG_TABLE_NAME = 'class_sessions' AND TG_OP = 'INSERT' AND EXISTS(");
  assert.ok(start >= 0);
  const guard = migration.slice(start, migration.indexOf("END IF;", start));
  assert.match(guard, /v.course_offering_id = offering AND v.department_id = dept AND t.state = 'LOCKED'/);
  assert.match(guard, /RAISE EXCEPTION 'Historical locked class set cannot be extended/);
  assert.doesNotMatch(guard, /previous_id|REOPENED|NOT EXISTS/);
  assert.ok(migration.lastIndexOf("UPDATE course_offerings SET id = id WHERE id = offering", start) >= 0);
});
