import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
const migration = readFileSync(
  join(
    process.cwd(),
    "prisma",
    "migrations",
    "202608070001_add_course_offering_curriculum_binding",
    "migration.sql",
  ),
  "utf8",
);

test("binding schema remains nullable and migration preserves existing rows", () => {
  assert.match(schema, /curriculumCourseId\s+String\?/);
  assert.match(schema, /curriculumCourse\s+CurriculumCourse\?/);
  assert.match(migration, /ADD COLUMN "curriculum_course_id" TEXT;/);
  assert.doesNotMatch(migration, /curriculum_course_id" TEXT NOT NULL/);
  assert.doesNotMatch(migration, /UPDATE\s+"course_offerings"/i);
});

test("foreign key restriction and mapped index are exact and aligned", () => {
  const indexName = "course_offering_dept_curriculum_course_idx";
  assert.ok(indexName.length <= 63);
  assert.match(
    schema,
    /@@index\(\[departmentId, curriculumCourseId\], map: "course_offering_dept_curriculum_course_idx"\)/,
  );
  assert.match(migration, new RegExp(`CREATE INDEX "${indexName}"`));
  assert.match(
    migration,
    /REFERENCES "curriculum_courses"\("id"\)\s+ON DELETE RESTRICT ON UPDATE CASCADE;/,
  );
});
