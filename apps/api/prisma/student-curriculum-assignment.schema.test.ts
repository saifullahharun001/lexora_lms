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
    "202608090001_add_student_curriculum_assignment",
    "migration.sql",
  ),
  "utf8",
);

const model = schema.match(/model StudentCurriculumAssignment \{[\s\S]*?\n\}/)?.[0] ?? "";

test("immutable assignment model has the required mapped scalar fields", () => {
  assert.match(model, /id\s+String\s+@id @default\(cuid\(\)\)/);
  for (const field of [
    "departmentId",
    "studentUserId",
    "academicProgramId",
    "curriculumVersionId",
    "assignedByUserId",
  ]) {
    assert.match(model, new RegExp(`${field}\\s+String\\s+@map\\("[a-z_]+"\\)`));
  }
  assert.match(model, /assignedAt\s+DateTime\s+@default\(now\(\)\) @map\("assigned_at"\)/);
  assert.match(model, /createdAt\s+DateTime\s+@default\(now\(\)\) @map\("created_at"\)/);
  assert.doesNotMatch(model, /updatedAt|updated_at/);
  assert.match(model, /@@map\("student_curriculum_assignments"\)/);
  assert.match(migration, /CREATE TABLE "student_curriculum_assignments"/);
  assert.doesNotMatch(migration, /"updated_at"/);
});

test("one immutable assignment per department, student, and programme is enforced", () => {
  const name = "student_curriculum_assignment_dept_student_program_uq";
  assert.ok(name.length <= 63);
  assert.match(
    model,
    new RegExp(`@@unique\\(\\[departmentId, studentUserId, academicProgramId\\], map: "${name}"\\)`),
  );
  assert.match(
    migration,
    new RegExp(`CREATE UNIQUE INDEX "${name}"\\s+ON "student_curriculum_assignments"\\("department_id", "student_user_id", "academic_program_id"\\)`),
  );
});

test("all academic-history dependencies are restrictive and mapped names are exact", () => {
  const foreignKeys = [
    ["department_id", "departments"],
    ["student_user_id", "users"],
    ["academic_program_id", "academic_programs"],
    ["curriculum_version_id", "curriculum_versions"],
    ["assigned_by_user_id", "users"],
  ] as const;

  for (const [column, table] of foreignKeys) {
    const name = `student_curriculum_assignments_${column}_fkey`;
    assert.ok(name.length <= 63);
    assert.match(
      migration,
      new RegExp(
        `ADD CONSTRAINT "${name}"\\s+FOREIGN KEY \\(\\"${column}\\"\\) REFERENCES "${table}"\\("id"\\)\\s+ON DELETE RESTRICT ON UPDATE CASCADE;`,
      ),
    );
  }

  assert.equal((model.match(/onDelete: Restrict/g) ?? []).length, 5);
  for (const name of [
    "student_curriculum_assignment_dept_version_idx",
    "student_curriculum_assignment_dept_assigner_idx",
  ]) {
    assert.ok(name.length <= 63);
    assert.match(model, new RegExp(`map: "${name}"`));
    assert.match(migration, new RegExp(`CREATE INDEX "${name}"`));
  }
});

test("assignment foundation does not alter enrollment or offering behavior", () => {
  assert.doesNotMatch(migration, /enrollments|course_offerings/i);
  assert.match(schema, /curriculumCourseId\s+String\?/);
  assert.match(schema, /curriculumCourse\s+CurriculumCourse\?/);
  assert.match(
    schema,
    /@@unique\(\[departmentId, academicTermId, courseId, sectionCode\]\)/,
  );
  assert.match(
    schema,
    /@@index\(\[departmentId, curriculumCourseId\], map: "course_offering_dept_curriculum_course_idx"\)/,
  );
});

test("schema records required future assignment authorization and lifecycle validation", () => {
  assert.match(schema, /active department-scoped Student role/);
  assert.match(schema, /matching CurriculumVersion\.academicProgramId/);
  assert.match(schema, /APPROVED\/ACTIVE lifecycle/);
  assert.match(schema, /actor authority/);
});
