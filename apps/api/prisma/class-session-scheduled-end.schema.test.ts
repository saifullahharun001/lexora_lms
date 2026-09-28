import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const schema = readFileSync(path.resolve("prisma/schema.prisma"), "utf8");
const migration = readFileSync(path.resolve("prisma/migrations/202609270001_class_session_scheduled_end/migration.sql"), "utf8");
test("scheduled-end schema is additive and does not replace historical Attendance guards", () => {
  assert.match(schema, /enum ClassSessionStatus\s*\{[^}]*NOT_CONDUCTED/);
  assert.match(schema, /nonConductedAt\s+DateTime\?\s+@map\("non_conducted_at"\)/);
  assert.match(schema, /@@index\(\[status, scheduledEndAt, id\], map: "class_sessions_due_idx"\)/);
  assert.match(migration, /class_session_non_conducted_check/);
  assert.doesNotMatch(migration, /DROP|DISABLE|CREATE OR REPLACE|Chairman|BatchCoordinator/i);
});

test("deadline applies to raw capture writes; existing post-class correction uses its separate immutable relation", () => {
  assert.match(migration, /BEFORE INSERT OR UPDATE ON attendance_records/);
  assert.doesNotMatch(migration, /(?:CREATE TRIGGER|ALTER TABLE)[^;]*ON formative_attendance_corrections/);
  // Raw override metadata alone is not an authority or audit proof.
  const body = migration.split("CREATE FUNCTION class_session_attendance_deadline_guard()")[1]!;
  assert.doesNotMatch(body, /override_by_user_id|override_reason/);
  for (const table of ["attendance_records", "formative_attendance_source_items", "formative_attendance_corrections"]) {
    assert.ok(migration.includes(`SELECT 1 FROM ${table} WHERE class_session_id = OLD.id`));
  }
});
