import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const schema = readFileSync(
  join(process.cwd(), "prisma", "schema.prisma"),
  "utf8",
);
const migration = readFileSync(
  join(
    process.cwd(),
    "prisma",
    "migrations",
    "202608100001_harden_enrollment_course_offering_delete",
    "migration.sql",
  ),
  "utf8",
);

function model(name: string) {
  return (
    schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? ""
  );
}

const enrollment = model("Enrollment");
const courseOffering = model("CourseOffering");

test("current schema restricts CourseOffering deletion while preserving Enrollment identity", () => {
  assert.match(
    enrollment,
    /courseOfferingId\s+String\s+@map\("course_offering_id"\)/,
  );
  assert.match(
    enrollment,
    /courseOffering\s+CourseOffering\s+@relation\(fields: \[courseOfferingId\], references: \[id\], onDelete: Restrict\)/,
  );
  assert.match(enrollment, /@@unique\(\[courseOfferingId, studentUserId\]\)/);
  assert.doesNotMatch(
    courseOffering,
    /@@unique\(\[departmentId, academicTermId, courseId, sectionCode\]\)/,
  );
  assert.match(courseOffering, /PostgreSQL partial unique indexes/);
  assert.match(
    enrollment,
    /studentCurriculumAssignment\s+StudentCurriculumAssignment\?\s+@relation\([^\n]+onDelete: Restrict/,
  );
  assert.match(
    enrollment,
    /curriculumCourse\s+CurriculumCourse\?\s+@relation\([^\n]+onDelete: Restrict/,
  );
});

test("migration replaces only the Enrollment CourseOffering foreign key", () => {
  assert.match(
    migration,
    /ALTER TABLE "enrollments" DROP CONSTRAINT "enrollments_course_offering_id_fkey";/,
  );
  assert.match(
    migration,
    /ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_course_offering_id_fkey" FOREIGN KEY \("course_offering_id"\) REFERENCES "course_offerings"\("id"\) ON DELETE RESTRICT ON UPDATE CASCADE;/,
  );

  const statements = migration
    .replace(/^--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  assert.equal(statements.length, 2);
  assert.ok(
    statements.every((statement) =>
      /^ALTER TABLE "enrollments"/.test(statement),
    ),
  );
  assert.equal((migration.match(/DROP CONSTRAINT/g) ?? []).length, 1);
  assert.equal((migration.match(/ADD CONSTRAINT/g) ?? []).length, 1);
});

test("migration contains no data mutation or unrelated schema change", () => {
  assert.doesNotMatch(migration, /^\s*DELETE\b/im);
  assert.doesNotMatch(migration, /^\s*UPDATE\b/im);
  assert.doesNotMatch(migration, /(?:ADD|DROP)\s+COLUMN/i);
  assert.doesNotMatch(migration, /(?:CREATE|DROP)\s+(?:UNIQUE\s+)?INDEX/i);
  assert.doesNotMatch(migration, /student_curriculum_assignment/i);
  assert.doesNotMatch(migration, /curriculum_course_id/i);
  assert.doesNotMatch(migration, /DROP\s+TABLE|CREATE\s+TABLE/i);
});
