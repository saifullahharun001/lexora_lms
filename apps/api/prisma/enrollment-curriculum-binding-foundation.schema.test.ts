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
    "202608090002_add_enrollment_curriculum_binding_foundation",
    "migration.sql",
  ),
  "utf8",
);

function model(name: string) {
  return schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";
}

const enrollment = model("Enrollment");
const assignment = model("StudentCurriculumAssignment");
const curriculumCourse = model("CurriculumCourse");
const courseOffering = model("CourseOffering");

test("Enrollment has nullable mapped curriculum identity and restrictive relations", () => {
  assert.match(
    enrollment,
    /studentCurriculumAssignmentId\s+String\?\s+@map\("student_curriculum_assignment_id"\)/,
  );
  assert.match(
    enrollment,
    /curriculumCourseId\s+String\?\s+@map\("curriculum_course_id"\)/,
  );
  assert.match(
    enrollment,
    /studentCurriculumAssignment\s+StudentCurriculumAssignment\?\s+@relation\(fields: \[studentCurriculumAssignmentId\], references: \[id\], onDelete: Restrict, map: "enrollment_student_curriculum_assignment_fk"\)/,
  );
  assert.match(
    enrollment,
    /curriculumCourse\s+CurriculumCourse\?\s+@relation\(fields: \[curriculumCourseId\], references: \[id\], onDelete: Restrict, map: "enrollment_curriculum_course_fk"\)/,
  );
  assert.match(assignment, /enrollments\s+Enrollment\[\]/);
  assert.match(curriculumCourse, /enrollments\s+Enrollment\[\]/);
  assert.doesNotMatch(enrollment, /curriculumVersionId/);
});

test("mapped department indexes are exact and existing uniqueness is preserved", () => {
  const indexes = [
    [
      "studentCurriculumAssignmentId",
      "enrollment_dept_student_curriculum_idx",
    ],
    ["curriculumCourseId", "enrollment_dept_curriculum_course_idx"],
  ] as const;

  for (const [field, name] of indexes) {
    assert.ok(name.length <= 63);
    assert.match(
      enrollment,
      new RegExp(`@@index\\(\\[departmentId, ${field}\\], map: "${name}"\\)`),
    );
    assert.match(migration, new RegExp(`CREATE INDEX "${name}"`));
  }

  assert.match(enrollment, /@@unique\(\[courseOfferingId, studentUserId\]\)/);
  assert.match(
    enrollment,
    /courseOffering\s+CourseOffering\s+@relation\(fields: \[courseOfferingId\], references: \[id\], onDelete: Cascade\)/,
  );
  assert.match(
    courseOffering,
    /@@unique\(\[departmentId, academicTermId, courseId, sectionCode\]\)/,
  );
});

test("migration adds only nullable paired curriculum columns", () => {
  assert.match(
    migration,
    /ADD COLUMN "student_curriculum_assignment_id" TEXT,/,
  );
  assert.match(migration, /ADD COLUMN "curriculum_course_id" TEXT,/);
  assert.doesNotMatch(
    migration,
    /(?:student_curriculum_assignment_id|curriculum_course_id)" TEXT NOT NULL/,
  );
  assert.doesNotMatch(migration, /^\s*UPDATE\b/im);
  assert.doesNotMatch(migration, /^\s*DELETE\b/im);
  assert.doesNotMatch(migration, /DROP\s+TABLE/i);
  assert.doesNotMatch(migration, /course_offerings/i);
});

test("migration creates exactly two restrictive curriculum foreign keys", () => {
  const foreignKeys = [
    [
      "enrollment_student_curriculum_assignment_fk",
      "student_curriculum_assignment_id",
      "student_curriculum_assignments",
    ],
    [
      "enrollment_curriculum_course_fk",
      "curriculum_course_id",
      "curriculum_courses",
    ],
  ] as const;

  assert.equal((migration.match(/ADD CONSTRAINT "enrollment_[^"]+_fk"/g) ?? []).length, 2);
  for (const [name, column, target] of foreignKeys) {
    assert.ok(name.length <= 63);
    assert.match(
      migration,
      new RegExp(
        `ADD CONSTRAINT "${name}"\\s+FOREIGN KEY \\(\\"${column}\\"\\)\\s+REFERENCES "${target}"\\("id"\\)\\s+ON DELETE RESTRICT ON UPDATE CASCADE;`,
      ),
    );
  }
});

test("pair-completeness check requires both curriculum values together", () => {
  const name = "enrollment_curriculum_pair_ck";
  assert.ok(name.length <= 63);
  assert.match(
    migration,
    new RegExp(
      `ADD CONSTRAINT "${name}"\\s+CHECK \\(\\("student_curriculum_assignment_id" IS NULL\\) = \\(\\"curriculum_course_id\\" IS NULL\\)\\);`,
    ),
  );

  const valid = (assignmentId: string | null, courseId: string | null) =>
    (assignmentId === null) === (courseId === null);
  assert.equal(valid(null, null), true);
  assert.equal(valid("assignment-a", "course-a"), true);
  assert.equal(valid("assignment-a", null), false);
  assert.equal(valid(null, "course-a"), false);
});
