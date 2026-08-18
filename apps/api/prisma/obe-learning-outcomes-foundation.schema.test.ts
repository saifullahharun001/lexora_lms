import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const apiRoot = process.cwd();
const prismaRoot = join(apiRoot, "prisma");
const schema = readFileSync(join(prismaRoot, "schema.prisma"), "utf8");
const migration = readFileSync(
  join(
    prismaRoot,
    "migrations",
    "202608190001_add_obe_learning_outcomes_foundation",
    "migration.sql",
  ),
  "utf8",
);

function model(name: string) {
  return (
    schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? ""
  );
}

const department = model("Department");
const curriculumVersion = model("CurriculumVersion");
const curriculumCourse = model("CurriculumCourse");
const programLearningOutcome = model("ProgramLearningOutcome");
const courseLearningOutcome = model("CourseLearningOutcome");
const mapping = model("CourseLearningOutcomePloMapping");
const syllabusVersion = model("SyllabusVersion");
const courseOffering = model("CourseOffering");
const enrollment = model("Enrollment");

test("the three department-scoped OBE foundation models exist", () => {
  for (const value of [
    programLearningOutcome,
    courseLearningOutcome,
    mapping,
  ]) {
    assert.notEqual(value, "");
    assert.match(
      value,
      /departmentId\s+String\s+@map\("department_id"\)/,
    );
  }

  assert.match(department, /programLearningOutcomes\s+ProgramLearningOutcome\[\]/);
  assert.match(department, /courseLearningOutcomes\s+CourseLearningOutcome\[\]/);
  assert.match(
    department,
    /cloPloMappings\s+CourseLearningOutcomePloMapping\[\]/,
  );
});

test("PLOs bind to the exact Department and CurriculumVersion identity", () => {
  assert.match(
    curriculumVersion,
    /@@unique\(\[id, departmentId\], map: "curriculum_version_id_department_uq"\)/,
  );
  assert.match(
    programLearningOutcome,
    /curriculumVersion\s+CurriculumVersion\s+@relation\(fields: \[curriculumVersionId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "program_learning_outcome_dept_version_fkey"\)/,
  );
  assert.match(
    migration,
    /CONSTRAINT "program_learning_outcome_dept_version_fkey"[\s\S]*?FOREIGN KEY \("curriculum_version_id", "department_id"\)[\s\S]*?REFERENCES "curriculum_versions"\("id", "department_id"\)[\s\S]*?ON DELETE RESTRICT ON UPDATE RESTRICT;/,
  );
});

test("CLOs bind to the exact Department, CurriculumVersion, and CurriculumCourse identity", () => {
  assert.match(
    curriculumCourse,
    /@@unique\(\[id, departmentId, curriculumVersionId\], map: "curriculum_course_id_department_version_uq"\)/,
  );
  assert.match(
    courseLearningOutcome,
    /curriculumVersion\s+CurriculumVersion\s+@relation\(fields: \[curriculumVersionId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "course_learning_outcome_dept_version_fkey"\)/,
  );
  assert.match(
    courseLearningOutcome,
    /curriculumCourse\s+CurriculumCourse\s+@relation\(fields: \[curriculumCourseId, departmentId, curriculumVersionId\], references: \[id, departmentId, curriculumVersionId\], onDelete: Restrict, onUpdate: Restrict, map: "course_learning_outcome_course_identity_fkey"\)/,
  );
  assert.match(
    migration,
    /CONSTRAINT "course_learning_outcome_course_identity_fkey"[\s\S]*?FOREIGN KEY \("curriculum_course_id", "department_id", "curriculum_version_id"\)[\s\S]*?REFERENCES "curriculum_courses"\("id", "department_id", "curriculum_version_id"\)[\s\S]*?ON DELETE RESTRICT ON UPDATE RESTRICT;/,
  );
});

test("CLO to PLO mappings enforce the same Department and CurriculumVersion", () => {
  assert.match(
    mapping,
    /courseLearningOutcome\s+CourseLearningOutcome\s+@relation\(fields: \[courseLearningOutcomeId, departmentId, curriculumVersionId\], references: \[id, departmentId, curriculumVersionId\], onDelete: Restrict, onUpdate: Restrict, map: "clo_plo_mapping_clo_identity_fkey"\)/,
  );
  assert.match(
    mapping,
    /programLearningOutcome\s+ProgramLearningOutcome\s+@relation\(fields: \[programLearningOutcomeId, departmentId, curriculumVersionId\], references: \[id, departmentId, curriculumVersionId\], onDelete: Restrict, onUpdate: Restrict, map: "clo_plo_mapping_plo_identity_fkey"\)/,
  );
  assert.match(
    migration,
    /CONSTRAINT "clo_plo_mapping_clo_identity_fkey"[\s\S]*?FOREIGN KEY \("course_learning_outcome_id", "department_id", "curriculum_version_id"\)[\s\S]*?ON DELETE RESTRICT ON UPDATE RESTRICT;/,
  );
  assert.match(
    migration,
    /CONSTRAINT "clo_plo_mapping_plo_identity_fkey"[\s\S]*?FOREIGN KEY \("program_learning_outcome_id", "department_id", "curriculum_version_id"\)[\s\S]*?ON DELETE RESTRICT ON UPDATE RESTRICT;/,
  );
});

test("PLO code and display order are unique only within a CurriculumVersion", () => {
  assert.match(
    programLearningOutcome,
    /@@unique\(\[departmentId, curriculumVersionId, code\], map: "program_learning_outcome_dept_version_code_uq"\)/,
  );
  assert.match(
    programLearningOutcome,
    /@@unique\(\[departmentId, curriculumVersionId, displayOrder\], map: "program_learning_outcome_dept_version_order_uq"\)/,
  );
  assert.doesNotMatch(programLearningOutcome, /@@unique\(\[code\]/);
  assert.doesNotMatch(programLearningOutcome, /@@unique\(\[displayOrder\]/);
});

test("CLO code and display order are unique only within a CurriculumCourse", () => {
  assert.match(
    courseLearningOutcome,
    /@@unique\(\[departmentId, curriculumVersionId, curriculumCourseId, code\], map: "course_learning_outcome_dept_version_course_code_uq"\)/,
  );
  assert.match(
    courseLearningOutcome,
    /@@unique\(\[departmentId, curriculumVersionId, curriculumCourseId, displayOrder\], map: "course_learning_outcome_dept_version_course_order_uq"\)/,
  );
  assert.doesNotMatch(courseLearningOutcome, /@@unique\(\[code\]/);
  assert.doesNotMatch(courseLearningOutcome, /@@unique\(\[displayOrder\]/);
});

test("duplicate CLO to PLO pairs are structurally prevented", () => {
  assert.match(
    mapping,
    /@@unique\(\[departmentId, curriculumVersionId, courseLearningOutcomeId, programLearningOutcomeId\], map: "clo_plo_mapping_dept_version_pair_uq"\)/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "clo_plo_mapping_dept_version_pair_uq"\s+ON "course_learning_outcome_plo_mappings"\("department_id", "curriculum_version_id", "course_learning_outcome_id", "program_learning_outcome_id"\);/,
  );
});

test("all new historical academic relationships restrict deletes and updates", () => {
  const foreignKeys = migration.match(
    /ADD CONSTRAINT "(?:program_learning_outcome|course_learning_outcome|clo_plo_mapping)[^"]*_fkey"[\s\S]*?;/g,
  );

  assert.equal(foreignKeys?.length, 9);
  for (const foreignKey of foreignKeys ?? []) {
    assert.match(foreignKey, /ON DELETE RESTRICT ON UPDATE RESTRICT;/);
    assert.doesNotMatch(foreignKey, /CASCADE/);
  }
});

test("positive display-order CHECK constraints exist", () => {
  assert.match(
    migration,
    /CONSTRAINT "program_learning_outcomes_positive_display_order" CHECK \("display_order" > 0\)/,
  );
  assert.match(
    migration,
    /CONSTRAINT "course_learning_outcomes_positive_display_order" CHECK \("display_order" > 0\)/,
  );
});

test("migration is additive and contains no ordinary-data backfill", () => {
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /^COMMIT;/m);
  assert.doesNotMatch(migration, /^\s*(?:INSERT|UPDATE|DELETE)\b/im);
  assert.doesNotMatch(
    migration,
    /DROP\s+(?:TABLE|COLUMN|CONSTRAINT|INDEX|TYPE)/i,
  );
});

test("foundation introduces no later workflow models or invented outcome semantics", () => {
  assert.doesNotMatch(schema, /model (?:CourseOutline|LessonPlan)\b/);
  assert.doesNotMatch(schema, /model \w*(?:Clo|Plo)Attainment\b/i);

  for (const value of [
    programLearningOutcome,
    courseLearningOutcome,
    mapping,
  ]) {
    assert.doesNotMatch(
      value,
      /attainment|threshold|benchmark|weight|contribution|score|bloom|knowledge|skill|attitude|domain|accreditation|approvedBy|approvedAt|archivedAt|status/i,
    );
  }
});

test("existing exact CourseOffering to SyllabusVersion binding remains unchanged", () => {
  assert.match(
    courseOffering,
    /syllabusVersion\s+SyllabusVersion\?\s+@relation\(fields: \[syllabusVersionId, departmentId, curriculumCourseId\], references: \[id, departmentId, curriculumCourseId\], onDelete: Restrict, onUpdate: Restrict, map: "course_offering_syllabus_identity_fkey"\)/,
  );
  assert.match(
    syllabusVersion,
    /@@unique\(\[id, departmentId, curriculumCourseId\], map: "syllabus_version_id_department_curriculum_course_uq"\)/,
  );
  assert.doesNotMatch(migration, /ALTER TABLE "(?:course_offerings|syllabus_versions)"/);
});

test("CourseOffering section and capacity plus Enrollment remain untouched", () => {
  assert.match(
    courseOffering,
    /sectionCode\s+String\s+@map\("section_code"\)/,
  );
  assert.match(courseOffering, /capacity\s+Int\?/);
  assert.notEqual(enrollment, "");
  assert.doesNotMatch(
    migration,
    /"(?:course_offerings|enrollments)"|section_code|capacity/i,
  );
});
