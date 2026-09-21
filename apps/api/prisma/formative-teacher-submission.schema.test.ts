import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const schema = readFileSync(path.resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const migration = readFileSync(path.resolve(process.cwd(), "prisma/migrations/202609210001_add_formative_teacher_submission/migration.sql"), "utf8");

test("Teacher submission schema has no verifier/finaliser state or cascade deletion", () => {
  assert.match(schema, /enum FormativeTeacherSubmissionState\s*\{\s*MARKS_SUBMITTED\s*\}/);
  assert.doesNotMatch(migration, /ON DELETE (CASCADE|SET NULL)/);
  assert.match(migration, /formative_submission_enrollment_uq/);
  assert.match(migration, /FOREIGN KEY\(mark_evidence_id, department_id, course_offering_id, enrollment_id, activity_id\)/);
  assert.match(migration, /FOREIGN KEY\(teacher_assignment_id, department_id, course_offering_id, actor_user_id\)/);
});

test("database protects append-only history, complete exact sources and submitted immutability", () => {
  for (const table of ["formative_mark_evidence", "formative_teacher_submissions", "formative_submission_items"]) {
    assert.ok(migration.includes(`BEFORE UPDATE OR DELETE ON ${table}`));
  }
  assert.match(migration, /DEFERRABLE INITIALLY DEFERRED/);
  assert.match(migration, /weight IS DISTINCT FROM 30/);
  assert.match(migration, /item_count <> activity_count/);
  assert.match(migration, /previous\.raw_mark IS DISTINCT FROM NEW\.raw_mark/);
  assert.match(migration, /weighted_mark = round\(raw_mark \/ raw_maximum \* assigned_weight, 2\)/);
});
