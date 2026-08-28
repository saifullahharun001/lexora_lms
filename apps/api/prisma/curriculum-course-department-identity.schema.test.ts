import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const prismaRoot = join(process.cwd(), "prisma");
const schema = readFileSync(join(prismaRoot, "schema.prisma"), "utf8");
const migration = readFileSync(
  join(
    prismaRoot,
    "migrations",
    "202608240001_harden_curriculum_course_department_identity",
    "migration.sql",
  ),
  "utf8",
);

function model(name: string) {
  return (
    schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? ""
  );
}

const course = model("Course");
const curriculumVersion = model("CurriculumVersion");
const assessmentTemplate = model("CourseAssessmentTemplate");
const curriculumCourse = model("CurriculumCourse");

test("all CurriculumCourse parents expose department-scoped candidate identities", () => {
  assert.match(
    course,
    /@@unique\(\[id, departmentId\], map: "course_id_department_uq"\)/,
  );
  assert.match(
    curriculumVersion,
    /@@unique\(\[id, departmentId\], map: "curriculum_version_id_department_uq"\)/,
  );
  assert.match(
    assessmentTemplate,
    /@@unique\(\[id, departmentId\], map: "assessment_template_id_department_uq"\)/,
  );

  assert.match(
    migration,
    /CREATE UNIQUE INDEX "course_id_department_uq"\s+ON "courses"\("id", "department_id"\);/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "assessment_template_id_department_uq"\s+ON "course_assessment_templates"\("id", "department_id"\);/,
  );
  assert.doesNotMatch(migration, /curriculum_version_id_department_uq/);
});

test("all three CurriculumCourse parent relations use the exact department identity", () => {
  assert.match(
    curriculumCourse,
    /course\s+Course\s+@relation\(fields: \[courseId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "curriculum_course_dept_course_fkey"\)/,
  );
  assert.match(
    curriculumCourse,
    /curriculumVersion\s+CurriculumVersion\s+@relation\(fields: \[curriculumVersionId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "curriculum_course_dept_version_fkey"\)/,
  );
  assert.match(
    curriculumCourse,
    /assessmentTemplate\s+CourseAssessmentTemplate\s+@relation\(fields: \[assessmentTemplateId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "curriculum_course_dept_template_fkey"\)/,
  );
});

test("migration creates the exact composite parent foreign keys with restrictive actions", () => {
  const expectedForeignKeys = [
    ["curriculum_course_dept_course_fkey", "course_id", "courses"],
    [
      "curriculum_course_dept_version_fkey",
      "curriculum_version_id",
      "curriculum_versions",
    ],
    [
      "curriculum_course_dept_template_fkey",
      "assessment_template_id",
      "course_assessment_templates",
    ],
  ] as const;

  for (const [constraint, childId, parentTable] of expectedForeignKeys) {
    assert.match(
      migration,
      new RegExp(
        `ADD CONSTRAINT "${constraint}"\\s+` +
          `FOREIGN KEY \\(\\"${childId}\\", \\"department_id\\"\\)\\s+` +
          `REFERENCES \\"${parentTable}\\"\\(\\"id\\", \\"department_id\\"\\)\\s+` +
          "ON DELETE RESTRICT ON UPDATE RESTRICT;",
      ),
    );
  }

  const newForeignKeys = migration.match(
    /ADD CONSTRAINT "curriculum_course_dept_[^"]+_fkey"[\s\S]*?;/g,
  );
  assert.equal(newForeignKeys?.length, 3);
  for (const foreignKey of newForeignKeys ?? []) {
    assert.match(foreignKey, /ON DELETE RESTRICT ON UPDATE RESTRICT;/);
    assert.doesNotMatch(foreignKey, /CASCADE/);
  }
});

test("direct CurriculumCourse Department identity remains intact", () => {
  assert.match(
    curriculumCourse,
    /department\s+Department\s+@relation\(fields: \[departmentId\], references: \[id\], onDelete: Restrict\)/,
  );
  assert.doesNotMatch(migration, /curriculum_courses_department_id_fkey/);
});

test("migration replaces only the three superseded single-column parent foreign keys", () => {
  const supersededConstraints = [
    "curriculum_courses_course_id_fkey",
    "curriculum_courses_curriculum_version_id_fkey",
    "curriculum_courses_assessment_template_id_fkey",
  ];

  for (const constraint of supersededConstraints) {
    assert.match(migration, new RegExp(`DROP CONSTRAINT "${constraint}";`));
    assert.doesNotMatch(
      migration,
      new RegExp(`ADD CONSTRAINT "${constraint}"`),
    );
  }

  const droppedConstraints = Array.from(
    migration.matchAll(/DROP CONSTRAINT "([^"]+)";/g),
    (match) => match[1],
  );
  assert.deepEqual(droppedConstraints, supersededConstraints);
});

test("existing CurriculumCourse uniqueness and indexes remain with the examination candidate identity", () => {
  const declarations = curriculumCourse
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) => line.startsWith("@@unique") || line.startsWith("@@index"),
    );

  assert.deepEqual(declarations, [
    '@@unique([id, departmentId], map: "curriculum_course_id_department_uq")',
    '@@unique([id, departmentId, curriculumVersionId], map: "curriculum_course_id_department_version_uq")',
    '@@unique([id, departmentId, curriculumVersionId, assessmentTemplateId], map: "curriculum_course_exam_identity_uq")',
    '@@unique([curriculumVersionId, courseId], map: "curriculum_course_version_course_uq")',
    '@@unique([curriculumVersionId, academicYearNumber, semesterNumber, displayOrder], map: "curriculum_course_version_term_order_uq")',
    '@@index([departmentId, curriculumVersionId], map: "curriculum_course_dept_version_idx")',
    '@@index([departmentId, curriculumVersionId, academicYearNumber, semesterNumber, displayOrder], map: "curriculum_course_dept_version_term_order_idx")',
    '@@index([departmentId, courseId], map: "curriculum_course_dept_course_idx")',
    '@@index([departmentId, assessmentTemplateId], map: "curriculum_course_dept_template_idx")',
  ]);
});

test("migration performs no data mutation, backfill, correction, or rewrite", () => {
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /^COMMIT;/m);
  assert.doesNotMatch(
    migration,
    /^\s*(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|COPY)\b/im,
  );
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|INDEX|TYPE)\b/i);
  assert.doesNotMatch(
    migration,
    /ADD\s+COLUMN|ALTER\s+COLUMN|SET\s+"?department_id"?/i,
  );
  assert.doesNotMatch(migration, /CASCADE/);
});
