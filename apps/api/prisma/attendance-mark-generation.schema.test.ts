import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AUTHORIZATION_PROVISIONING_DEFINITIONS, ATTENDANCE_MARK_GENERATE_PROVISIONING } from "./authorization/authorization-provisioning.definition";

const sql = readFileSync("prisma/migrations/202609290001_chairman_attendance_generation/migration.sql", "utf8");
test("disposable AuditActorType exactly matches the canonical Prisma enum", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const fixture = readFileSync("prisma/test-fixtures/attendance-generation.sql", "utf8");
  const canonicalEnum = /enum AuditActorType\s*\{([^}]*)\}/.exec(schema);
  const fixtureEnum = /CREATE TYPE "AuditActorType" AS ENUM\s*\(([^)]*)\);/.exec(fixture);
  assert.ok(canonicalEnum);
  assert.ok(fixtureEnum);
  const values = canonicalEnum[1]!.trim().split(/\s+/);
  assert.deepEqual(values, ["USER", "SERVICE", "ANONYMOUS"]);
  assert.deepEqual(fixtureEnum[1]!.split(",").map((value) => value.trim()), values.map((value) => `'${value}'`));
});

test("generation permission provisioning is exact and Teacher-only", () => {
  const entries = AUTHORIZATION_PROVISIONING_DEFINITIONS.filter((d) => d.permission.code === "attendance.mark.generate_department");
  assert.deepEqual(entries, [ATTENDANCE_MARK_GENERATE_PROVISIONING]);
  assert.equal(entries[0]!.targetRoleCode, "teacher");
  assert.deepEqual({ ...entries[0]!.permission, description: undefined }, { code: "attendance.mark.generate_department",
    resource: "attendance.mark", action: "generate", scope: "DEPARTMENT", description: undefined });
});
test("additive generation identity, deferred complete package, immutable parent and exclusive provenance", () => {
  for (const invariant of ["attendance_generation_exam_uq", "attendance_generation_identity_uq", "attendance_generated_parent_fk",
    "attendance_generated_course_fk", "attendance_provenance_mode", "attendance_generation_assignment_fk",
    "attendance_generation_chairman_fk", "DEFERRABLE INITIALLY DEFERRED", "attendance_validate_package(v.id)",
    "BEFORE UPDATE OR DELETE ON formative_attendance_generations", "Generated Attendance is irreversible",
    "Generated Attendance source is frozen", "attendance_assert_correction_open", "attendance.mark.generated"]) assert.ok(sql.includes(invariant), invariant);
  assert.doesNotMatch(sql, /DISABLE TRIGGER|DROP TABLE|DELETE FROM|UPDATE formative_attendance_(versions|transitions|corrections)/i);
  assert.ok(sql.includes("IF NOT generated AND EXISTS"));
  assert.ok(sql.includes("status::text='APPROVED' AND archived_at IS NULL AND dropped_at IS NULL"));
  assert.ok(sql.includes("FOR UPDATE OF c,a,ur FOR SHARE OF x,u,d,r,rp,p"));
  assert.doesNotMatch(sql, /summative_(candidates|calculated_marks)|MEMBER_1|MEMBER_2|EXTERNAL_MEMBER/);
});
test("historical migrations retain canonical checksums", () => {
  const expected: Record<string, string> = {
    // Filled from the clean canonical checkout before edits; history is never regenerated.
    "202609230001_add_authoritative_formative_attendance": "12c981ade6f5f1ed7b4682300e8d52cf873054a475429e3f62818464d09d8b66",
    "202609280001_ordinary_attendance_corrections": "0e9adee6843d6740f1f9473d7a68c71632979abdd38dae0781169c9571513bca",
  };
  for (const [name, checksum] of Object.entries(expected))
    assert.equal(createHash("sha256").update(readFileSync(`prisma/migrations/${name}/migration.sql`)).digest("hex"), checksum);
});

test("generation resolves all offering mutexes before Chairman authority in both database entrypoints", () => {
  for (const name of ["attendance_generation_insert", "attendance_validate_generation"]) {
    const start = sql.indexOf(`CREATE FUNCTION ${name}(`);
    const body = sql.slice(start, sql.indexOf("\n$$;", start));
    assert.ok(body.indexOf("attendance_generation_scope(") >= 0);
    assert.ok(body.indexOf("attendance_generation_scope(") < body.indexOf("attendance_generation_authority("));
  }
  assert.match(sql, /course_count>0 AND result_count>0/);
  assert.match(sql, /IF expected_count=0 OR g.result_count<=0/);
});

test("scope guards protect membership while excluding unrelated Summative workflow columns", () => {
  const course = sql.slice(sql.indexOf("CREATE FUNCTION attendance_generation_course_scope_guard("),
    sql.indexOf("CREATE FUNCTION attendance_generation_enrollment_scope_guard("));
  for (const field of ["department_id", "examination_id", "academic_program_id", "academic_session_id", "academic_term_id",
    "course_offering_id", "student_batch_id", "curriculum_version_id", "curriculum_course_id", "syllabus_version_id", "assessment_template_id", "archived_at"])
    assert.ok(course.includes(`NEW.${field}`) && course.includes(`OLD.${field}`), field);
  assert.match(course, /IS NOT DISTINCT FROM ROW/);
  assert.doesNotMatch(course, /locked_question_configuration_id|summative_full_mark|marking_deadline/);
  assert.match(course, /BEFORE INSERT OR UPDATE OR DELETE ON examination_courses/);
  const enrollment = sql.slice(sql.indexOf("CREATE FUNCTION attendance_generation_enrollment_scope_guard("),
    sql.indexOf("CREATE OR REPLACE FUNCTION attendance_academic_insert("));
  assert.match(enrollment, /NEW.status::text<>'APPROVED' OR NEW.archived_at IS NOT NULL OR NEW.dropped_at IS NOT NULL THEN RETURN NEW/);
  assert.match(enrollment, /UPDATE course_offerings SET id=id/);
  assert.match(enrollment, /c->>'academicTermId'=NEW.academic_term_id/);
  assert.match(enrollment, /BEFORE INSERT OR UPDATE ON enrollments/);
});

test("generation validator keeps the child record distinct from SQL table aliases", () => {
  const start = sql.indexOf("CREATE FUNCTION attendance_validate_generation(");
  const body = sql.slice(start, sql.indexOf("\n$$;", start));
  assert.match(body, /child_row RECORD/);
  assert.match(body, /formative_attendance_versions fv WHERE fv.generation_id=target/);
  assert.match(body, /FOR child_row IN SELECT/);
  assert.match(body, /attendance_validate_package\(child_row.id\)/);
  assert.doesNotMatch(body, /\bv RECORD|formative_attendance_versions v\b|\bv\./);
});

test("deferred success audit validates the complete typed context and canonical UTC timestamps", () => {
  const start = sql.indexOf("CREATE FUNCTION attendance_validate_generation(");
  const body = sql.slice(start, sql.indexOf("\n$$;", start));
  assert.match(body, /actor_type::text='USER' AND target_type='formative_attendance_generation'/);
  assert.match(body, /context_json @> jsonb_build_object/);
  for (const key of ["generationId", "examinationId", "academicTermId", "committeeId", "chairmanAssignmentId", "chairmanUserId",
    "chairmanAssignedAtSnapshot", "ruleVersionCode", "courseCount", "resultCount", "sourceFingerprint", "generatedAt"])
    assert.ok(body.includes(`'${key}'`), key);
  assert.match(body, /to_char\(g.chairman_assigned_at_snapshot,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'\)/);
  assert.match(body, /to_char\(g.generated_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'\)/);
});
