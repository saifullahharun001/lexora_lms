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
    "202608200001_add_canonical_syllabus_content_foundation",
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
const syllabusVersion = model("SyllabusVersion");
const syllabusObjective = model("SyllabusObjective");
const syllabusContentTopic = model("SyllabusContentTopic");
const syllabusLearningResource = model("SyllabusLearningResource");
const curriculumCoursePrerequisite = model("CurriculumCoursePrerequisite");
const courseOutlineVersion = model("CourseOutlineVersion");

test("SyllabusVersion stores a nullable version-specific course description", () => {
  assert.match(
    syllabusVersion,
    /courseDescription\s+String\?\s+@map\("course_description"\)/,
  );
  assert.match(
    migration,
    /ALTER TABLE "syllabus_versions"\s+ADD COLUMN "course_description" TEXT;/,
  );
  assert.doesNotMatch(migration, /"course_description" TEXT NOT NULL/);
});

test("SyllabusObjective has ordered approved statements and exact syllabus ownership", () => {
  for (const field of [
    "departmentId",
    "curriculumCourseId",
    "syllabusVersionId",
  ]) {
    assert.match(syllabusObjective, new RegExp(`${field}\\s+String\\s`));
  }
  assert.match(syllabusObjective, /id\s+String\s+@id @default\(cuid\(\)\)/);
  assert.match(syllabusObjective, /statement\s+String/);
  assert.match(
    syllabusObjective,
    /displayOrder\s+Int\s+@map\("display_order"\) @db\.SmallInt/,
  );
  assert.match(
    syllabusObjective,
    /syllabusVersion\s+SyllabusVersion\s+@relation\(fields: \[syllabusVersionId, departmentId, curriculumCourseId\], references: \[id, departmentId, curriculumCourseId\], onDelete: Restrict, onUpdate: Restrict, map: "syllabus_objective_syllabus_identity_fkey"\)/,
  );
  assert.match(
    syllabusObjective,
    /@@unique\(\[departmentId, syllabusVersionId, displayOrder\], map: "syllabus_objective_dept_syllabus_order_uq"\)/,
  );
  assert.doesNotMatch(
    syllabusObjective,
    /syllabus_objective_dept_syllabus_idx/,
  );
  assert.doesNotMatch(migration, /syllabus_objective_dept_syllabus_idx/);
  assert.match(
    migration,
    /CONSTRAINT "syllabus_objectives_positive_display_order" CHECK \("display_order" > 0\)/,
  );
});

test("SyllabusContentTopic remains minimal, ordered, and exactly syllabus-owned", () => {
  assert.match(syllabusContentTopic, /title\s+String/);
  assert.match(syllabusContentTopic, /content\s+String\?/);
  assert.match(
    syllabusContentTopic,
    /displayOrder\s+Int\s+@map\("display_order"\) @db\.SmallInt/,
  );
  assert.match(
    syllabusContentTopic,
    /syllabusVersion\s+SyllabusVersion\s+@relation\(fields: \[syllabusVersionId, departmentId, curriculumCourseId\], references: \[id, departmentId, curriculumCourseId\], onDelete: Restrict, onUpdate: Restrict, map: "syllabus_content_topic_syllabus_identity_fkey"\)/,
  );
  assert.match(
    syllabusContentTopic,
    /@@unique\(\[departmentId, syllabusVersionId, displayOrder\], map: "syllabus_content_topic_dept_syllabus_order_uq"\)/,
  );
  assert.doesNotMatch(
    syllabusContentTopic,
    /syllabus_content_topic_dept_syllabus_idx/,
  );
  assert.doesNotMatch(migration, /syllabus_content_topic_dept_syllabus_idx/);
  assert.match(
    migration,
    /CONSTRAINT "syllabus_content_topics_positive_display_order" CHECK \("display_order" > 0\)/,
  );
  assert.doesNotMatch(
    syllabusContentTopic,
    /lessonDate|teachingMethod|teacherNote|completion|courseOutline|cloId/i,
  );
});

test("SyllabusLearningResource uses an open compact code and approved citation text", () => {
  assert.match(
    syllabusLearningResource,
    /resourceTypeCode\s+String\s+@map\("resource_type_code"\) @db\.VarChar\(64\)/,
  );
  assert.match(
    syllabusLearningResource,
    /citationText\s+String\s+@map\("citation_text"\)/,
  );
  assert.match(
    syllabusLearningResource,
    /displayOrder\s+Int\s+@map\("display_order"\) @db\.SmallInt/,
  );
  assert.match(
    syllabusLearningResource,
    /syllabusVersion\s+SyllabusVersion\s+@relation\(fields: \[syllabusVersionId, departmentId, curriculumCourseId\], references: \[id, departmentId, curriculumCourseId\], onDelete: Restrict, onUpdate: Restrict, map: "syllabus_learning_resource_syllabus_identity_fkey"\)/,
  );
  assert.match(
    syllabusLearningResource,
    /@@unique\(\[departmentId, syllabusVersionId, displayOrder\], map: "syllabus_learning_resource_dept_syllabus_order_uq"\)/,
  );
  assert.doesNotMatch(
    syllabusLearningResource,
    /syllabus_learning_resource_dept_syllabus_idx/,
  );
  assert.doesNotMatch(
    migration,
    /syllabus_learning_resource_dept_syllabus_idx/,
  );
  assert.match(
    migration,
    /CONSTRAINT "syllabus_learning_resources_positive_display_order" CHECK \("display_order" > 0\)/,
  );
  assert.doesNotMatch(schema, /enum SyllabusLearningResourceType/);
  assert.doesNotMatch(migration, /CREATE TYPE "SyllabusLearningResourceType"/);
});

test("all syllabus content children use the exact composite SyllabusVersion FK", () => {
  const foreignKeys = [
    "syllabus_objective_syllabus_identity_fkey",
    "syllabus_content_topic_syllabus_identity_fkey",
    "syllabus_learning_resource_syllabus_identity_fkey",
  ];

  for (const foreignKey of foreignKeys) {
    assert.match(
      migration,
      new RegExp(
        `CONSTRAINT "${foreignKey}"\\s+FOREIGN KEY \\(\"syllabus_version_id\", \"department_id\", \"curriculum_course_id\"\\)\\s+REFERENCES \"syllabus_versions\"\\(\"id\", \"department_id\", \"curriculum_course_id\"\\)\\s+ON DELETE RESTRICT ON UPDATE RESTRICT;`,
      ),
    );
  }

  assert.match(syllabusVersion, /objectives\s+SyllabusObjective\[\]/);
  assert.match(syllabusVersion, /contentTopics\s+SyllabusContentTopic\[\]/);
  assert.match(
    syllabusVersion,
    /learningResources\s+SyllabusLearningResource\[\]/,
  );
});

test("CurriculumCoursePrerequisite binds both sides to one exact department and CurriculumVersion", () => {
  assert.match(
    curriculumVersion,
    /@@unique\(\[id, departmentId\], map: "curriculum_version_id_department_uq"\)/,
  );
  assert.match(
    curriculumCourse,
    /@@unique\(\[id, departmentId, curriculumVersionId\], map: "curriculum_course_id_department_version_uq"\)/,
  );
  assert.match(
    curriculumCoursePrerequisite,
    /curriculumVersion\s+CurriculumVersion\s+@relation\(fields: \[curriculumVersionId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "curriculum_course_prerequisite_dept_version_fkey"\)/,
  );
  assert.match(
    curriculumCoursePrerequisite,
    /curriculumCourse\s+CurriculumCourse\s+@relation\("CurriculumCoursePrerequisites", fields: \[curriculumCourseId, departmentId, curriculumVersionId\], references: \[id, departmentId, curriculumVersionId\], onDelete: Restrict, onUpdate: Restrict, map: "curriculum_course_prerequisite_course_identity_fkey"\)/,
  );
  assert.match(
    curriculumCoursePrerequisite,
    /prerequisiteCurriculumCourse\s+CurriculumCourse\s+@relation\("PrerequisiteCurriculumCourses", fields: \[prerequisiteCurriculumCourseId, departmentId, curriculumVersionId\], references: \[id, departmentId, curriculumVersionId\], onDelete: Restrict, onUpdate: Restrict, map: "curriculum_course_prerequisite_required_course_fkey"\)/,
  );

  const exactIdentityMatches = (
    prerequisite: { departmentId: string; curriculumVersionId: string },
    course: { departmentId: string; curriculumVersionId: string },
  ) =>
    prerequisite.departmentId === course.departmentId &&
    prerequisite.curriculumVersionId === course.curriculumVersionId;

  const prerequisite = {
    departmentId: "department-a",
    curriculumVersionId: "curriculum-version-a",
  };
  assert.equal(exactIdentityMatches(prerequisite, prerequisite), true);
  assert.equal(
    exactIdentityMatches(prerequisite, {
      ...prerequisite,
      departmentId: "department-b",
    }),
    false,
  );
  assert.equal(
    exactIdentityMatches(prerequisite, {
      ...prerequisite,
      curriculumVersionId: "curriculum-version-b",
    }),
    false,
  );
});

test("prerequisite duplicates and self-references are structurally rejected", () => {
  assert.match(
    curriculumCoursePrerequisite,
    /@@unique\(\[departmentId, curriculumVersionId, curriculumCourseId, prerequisiteCurriculumCourseId\], map: "curriculum_course_prerequisite_pair_uq"\)/,
  );
  assert.match(
    migration,
    /CONSTRAINT "curriculum_course_prerequisites_not_self" CHECK \("curriculum_course_id" <> "prerequisite_curriculum_course_id"\)/,
  );
  assert.doesNotMatch(
    curriculumCoursePrerequisite,
    /curriculum_course_prerequisite_course_idx/,
  );
  assert.doesNotMatch(
    migration,
    /curriculum_course_prerequisite_course_idx/,
  );
  assert.match(
    curriculumCoursePrerequisite,
    /@@index\(\[departmentId, curriculumVersionId, prerequisiteCurriculumCourseId\], map: "curriculum_course_prerequisite_required_idx"\)/,
  );
});

test("every new academic relation restricts both deletes and updates", () => {
  const foreignKeys = migration.match(
    /ADD CONSTRAINT "(?:syllabus_(?:objective|content_topic|learning_resource)|curriculum_course_prerequisite)[^"]*_fkey"[\s\S]*?;/g,
  );

  assert.equal(foreignKeys?.length, 10);
  for (const foreignKey of foreignKeys ?? []) {
    assert.match(foreignKey, /ON DELETE RESTRICT ON UPDATE RESTRICT;/);
    assert.doesNotMatch(foreignKey, /CASCADE/);
  }
});

test("required reverse relations exist without changing canonical CLO, PLO, or outline ownership", () => {
  assert.match(department, /syllabusObjectives\s+SyllabusObjective\[\]/);
  assert.match(department, /syllabusContentTopics\s+SyllabusContentTopic\[\]/);
  assert.match(
    department,
    /syllabusLearningResources\s+SyllabusLearningResource\[\]/,
  );
  assert.match(
    curriculumCourse,
    /prerequisites\s+CurriculumCoursePrerequisite\[\]\s+@relation\("CurriculumCoursePrerequisites"\)/,
  );
  assert.match(
    curriculumCourse,
    /prerequisiteFor\s+CurriculumCoursePrerequisite\[\]\s+@relation\("PrerequisiteCurriculumCourses"\)/,
  );
  assert.doesNotMatch(
    courseOutlineVersion,
    /courseDescription|objective|contentTopic|learningResource|prerequisite/i,
  );
  for (const contentModel of [
    syllabusObjective,
    syllabusContentTopic,
    syllabusLearningResource,
  ]) {
    assert.doesNotMatch(contentModel, /clo|plo|assessmentTemplate/i);
  }
});

test("migration is additive and contains no academic-data backfill", () => {
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /^COMMIT;/m);
  assert.doesNotMatch(migration, /^\s*(?:INSERT|UPDATE|DELETE)\b/im);
  assert.doesNotMatch(
    migration,
    /DROP\s+(?:TABLE|COLUMN|CONSTRAINT|INDEX|TYPE)/i,
  );
  assert.doesNotMatch(
    migration,
    /ALTER TABLE "(?:courses|curriculum_courses|course_offerings|course_outline_versions)"/,
  );
  assert.doesNotMatch(migration, /"course_description"\s*=|SELECT\s+.*description/i);
  assert.doesNotMatch(migration, /CASCADE/);
});

test("all new explicit PostgreSQL names remain within the identifier limit", () => {
  const names = [
    ...migration.matchAll(/(?:CONSTRAINT|INDEX) "([^"]+)"/g),
  ].map((match) => match[1] ?? "");

  for (const name of names) {
    assert.notEqual(name, "");
    assert.ok(name.length <= 63, name);
  }
});
