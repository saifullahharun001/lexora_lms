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
    "202608190002_add_course_outline_version_foundation",
    "migration.sql",
  ),
  "utf8",
);

function model(name: string) {
  return (
    schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? ""
  );
}

function enumBlock(name: string) {
  return (
    schema.match(new RegExp(`enum ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? ""
  );
}

const courseOutlineStatus = enumBlock("CourseOutlineStatus");
const department = model("Department");
const courseOffering = model("CourseOffering");
const curriculumCourse = model("CurriculumCourse");
const syllabusVersion = model("SyllabusVersion");
const courseOutlineVersion = model("CourseOutlineVersion");
const exactOutlineIdentity = {
  courseOfferingId: "offering-a",
  departmentId: "department-a",
  curriculumCourseId: "curriculum-a",
  syllabusVersionId: "syllabus-a",
};
const exactOfferingIdentity = {
  id: "offering-a",
  departmentId: "department-a",
  curriculumCourseId: "curriculum-a" as string | null,
  syllabusVersionId: "syllabus-a" as string | null,
};

function offeringIdentityMatches(
  outline: {
    courseOfferingId: string;
    departmentId: string;
    curriculumCourseId: string;
    syllabusVersionId: string;
  },
  offering: {
    id: string;
    departmentId: string;
    curriculumCourseId: string | null;
    syllabusVersionId: string | null;
  },
) {
  return (
    outline.courseOfferingId === offering.id &&
    outline.departmentId === offering.departmentId &&
    outline.curriculumCourseId === offering.curriculumCourseId &&
    outline.syllabusVersionId === offering.syllabusVersionId
  );
}

test("CourseOutlineStatus has the exact dedicated workflow values", () => {
  const values = courseOutlineStatus
    .split("\n")
    .slice(1, -1)
    .map((line) => line.trim())
    .filter(Boolean);

  assert.deepEqual(values, [
    "DRAFT",
    "SUBMITTED_BY_TEACHER",
    "COORDINATOR_REVIEW",
    "RETURNED_FOR_CORRECTION",
    "APPROVED",
    "ACTIVE",
    "ARCHIVED",
  ]);
  assert.match(migration, /CREATE TYPE "CourseOutlineStatus" AS ENUM/);
});

test("CourseOutlineVersion contains only the required identity and lifecycle foundation", () => {
  const fields = courseOutlineVersion
    .split("\n")
    .slice(1, -1)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("@@"))
    .map((line) => line.split(/\s+/, 1)[0]);

  assert.deepEqual(fields, [
    "id",
    "departmentId",
    "courseOfferingId",
    "curriculumCourseId",
    "syllabusVersionId",
    "versionNumber",
    "status",
    "submittedAt",
    "approvedAt",
    "activatedAt",
    "archivedAt",
    "createdAt",
    "updatedAt",
    "department",
    "courseOffering",
    "curriculumCourse",
    "syllabusVersion",
  ]);
  assert.match(courseOutlineVersion, /id\s+String\s+@id @default\(cuid\(\)\)/);
  for (const field of [
    "departmentId",
    "courseOfferingId",
    "curriculumCourseId",
    "syllabusVersionId",
  ]) {
    assert.match(courseOutlineVersion, new RegExp(`${field}\\s+String\\s`));
  }
  assert.match(
    courseOutlineVersion,
    /versionNumber\s+Int\s+@map\("version_number"\) @db\.SmallInt/,
  );
  assert.match(
    courseOutlineVersion,
    /status\s+CourseOutlineStatus\s+@default\(DRAFT\)/,
  );
  for (const field of [
    "submittedAt",
    "approvedAt",
    "activatedAt",
    "archivedAt",
  ]) {
    assert.match(courseOutlineVersion, new RegExp(`${field}\\s+DateTime\\?`));
  }
  assert.match(
    courseOutlineVersion,
    /createdAt\s+DateTime\s+@default\(now\(\)\)/,
  );
  assert.match(courseOutlineVersion, /updatedAt\s+DateTime\s+@updatedAt/);
  assert.match(courseOutlineVersion, /@@map\("course_outline_versions"\)/);
});

test("CourseOutlineVersion binds to the exact fully bound CourseOffering identity", () => {
  assert.match(
    courseOffering,
    /@@unique\(\[id, departmentId, curriculumCourseId, syllabusVersionId\], map: "course_offering_outline_identity_uq"\)/,
  );
  assert.match(
    courseOutlineVersion,
    /courseOffering\s+CourseOffering\s+@relation\(fields: \[courseOfferingId, departmentId, curriculumCourseId, syllabusVersionId\], references: \[id, departmentId, curriculumCourseId, syllabusVersionId\], onDelete: Restrict, onUpdate: Restrict, map: "course_outline_version_offering_identity_fkey"\)/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "course_offering_outline_identity_uq"\s+ON "course_offerings"\("id", "department_id", "curriculum_course_id", "syllabus_version_id"\);/,
  );
  assert.match(
    migration,
    /CONSTRAINT "course_outline_version_offering_identity_fkey"\s+FOREIGN KEY \("course_offering_id", "department_id", "curriculum_course_id", "syllabus_version_id"\)\s+REFERENCES "course_offerings"\("id", "department_id", "curriculum_course_id", "syllabus_version_id"\)\s+ON DELETE RESTRICT ON UPDATE RESTRICT;/,
  );
});

test("CourseOffering remains nullable while CourseOutlineVersion requires complete binding", () => {
  assert.match(
    courseOffering,
    /curriculumCourseId\s+String\?\s+@map\("curriculum_course_id"\)/,
  );
  assert.match(
    courseOffering,
    /syllabusVersionId\s+String\?\s+@map\("syllabus_version_id"\)/,
  );
});

test("fully matching exact offering identity is structurally allowed", () => {
  assert.equal(
    offeringIdentityMatches(exactOutlineIdentity, exactOfferingIdentity),
    true,
  );
});

test("exact identity rejects the correct offering with the wrong CurriculumCourse", () => {
  assert.equal(
    offeringIdentityMatches(
      { ...exactOutlineIdentity, curriculumCourseId: "curriculum-b" },
      exactOfferingIdentity,
    ),
    false,
  );
});

test("exact identity rejects the correct offering with the wrong SyllabusVersion", () => {
  assert.equal(
    offeringIdentityMatches(
      { ...exactOutlineIdentity, syllabusVersionId: "syllabus-b" },
      exactOfferingIdentity,
    ),
    false,
  );
});

test("exact identity rejects a different valid same-department academic chain", () => {
  assert.equal(
    offeringIdentityMatches(
      {
        ...exactOutlineIdentity,
        curriculumCourseId: "curriculum-b",
        syllabusVersionId: "syllabus-b",
      },
      exactOfferingIdentity,
    ),
    false,
  );
});

test("exact identity rejects a cross-department academic chain", () => {
  assert.equal(
    offeringIdentityMatches(
      {
        ...exactOutlineIdentity,
        departmentId: "department-b",
        curriculumCourseId: "curriculum-b",
        syllabusVersionId: "syllabus-b",
      },
      exactOfferingIdentity,
    ),
    false,
  );
});

test("exact identity rejects a CourseOffering without curriculum binding", () => {
  assert.equal(
    offeringIdentityMatches(exactOutlineIdentity, {
      ...exactOfferingIdentity,
      curriculumCourseId: null,
      syllabusVersionId: null,
    }),
    false,
  );
});

test("exact identity rejects a CourseOffering without syllabus binding", () => {
  assert.equal(
    offeringIdentityMatches(exactOutlineIdentity, {
      ...exactOfferingIdentity,
      syllabusVersionId: null,
    }),
    false,
  );
});

test("CourseOutlineVersion retains the exact department-scoped CurriculumCourse", () => {
  assert.match(
    curriculumCourse,
    /@@unique\(\[id, departmentId\], map: "curriculum_course_id_department_uq"\)/,
  );
  assert.match(
    courseOutlineVersion,
    /curriculumCourse\s+CurriculumCourse\s+@relation\(fields: \[curriculumCourseId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "course_outline_version_curriculum_course_fkey"\)/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \("curriculum_course_id", "department_id"\)\s+REFERENCES "curriculum_courses"\("id", "department_id"\)\s+ON DELETE RESTRICT ON UPDATE RESTRICT;/,
  );
});

test("CourseOutlineVersion retains the exact SyllabusVersion and CurriculumCourse scope", () => {
  assert.match(
    syllabusVersion,
    /@@unique\(\[id, departmentId, curriculumCourseId\], map: "syllabus_version_id_department_curriculum_course_uq"\)/,
  );
  assert.match(
    courseOutlineVersion,
    /syllabusVersion\s+SyllabusVersion\s+@relation\(fields: \[syllabusVersionId, departmentId, curriculumCourseId\], references: \[id, departmentId, curriculumCourseId\], onDelete: Restrict, onUpdate: Restrict, map: "course_outline_version_syllabus_identity_fkey"\)/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \("syllabus_version_id", "department_id", "curriculum_course_id"\)\s+REFERENCES "syllabus_versions"\("id", "department_id", "curriculum_course_id"\)\s+ON DELETE RESTRICT ON UPDATE RESTRICT;/,
  );
});

test("all new academic identity relationships restrict deletes and updates", () => {
  const foreignKeys = migration.match(
    /ADD CONSTRAINT "course_outline_version_[^"]*_fkey"[\s\S]*?;/g,
  );

  assert.equal(foreignKeys?.length, 4);
  for (const foreignKey of foreignKeys ?? []) {
    assert.match(foreignKey, /ON DELETE RESTRICT ON UPDATE RESTRICT;/);
    assert.doesNotMatch(foreignKey, /CASCADE/);
  }
});

test("version identity is offering-scoped and ready for a future exact binding", () => {
  assert.match(
    courseOutlineVersion,
    /@@unique\(\[departmentId, courseOfferingId, versionNumber\], map: "course_outline_version_dept_offering_number_uq"\)/,
  );
  assert.match(
    courseOutlineVersion,
    /@@unique\(\[id, departmentId, courseOfferingId\], map: "course_outline_version_id_dept_offering_uq"\)/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "course_outline_version_dept_offering_number_uq"\s+ON "course_outline_versions"\("department_id", "course_offering_id", "version_number"\);/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "course_outline_version_id_dept_offering_uq"\s+ON "course_outline_versions"\("id", "department_id", "course_offering_id"\);/,
  );
});

test("required back-relations are present without an active-outline pointer", () => {
  assert.match(department, /courseOutlineVersions\s+CourseOutlineVersion\[\]/);
  assert.match(
    courseOffering,
    /courseOutlineVersions\s+CourseOutlineVersion\[\]/,
  );
  assert.match(
    curriculumCourse,
    /courseOutlineVersions\s+CourseOutlineVersion\[\]/,
  );
  assert.match(
    syllabusVersion,
    /courseOutlineVersions\s+CourseOutlineVersion\[\]/,
  );
  assert.doesNotMatch(courseOffering, /courseOutlineVersionId/);
});

test("migration enforces positive SMALLINT version numbers", () => {
  assert.match(migration, /"version_number" SMALLINT NOT NULL/);
  assert.match(
    migration,
    /CONSTRAINT "course_outline_versions_positive_version" CHECK \("version_number" > 0\)/,
  );
});

test("migration creates only the required table, constraints, and lookup indexes", () => {
  const names = [
    "course_outline_versions_pkey",
    "course_outline_versions_positive_version",
    "course_offering_outline_identity_uq",
    "course_outline_version_dept_offering_number_uq",
    "course_outline_version_id_dept_offering_uq",
    "course_outline_version_dept_offering_status_idx",
    "course_outline_version_dept_syllabus_idx",
    "course_outline_version_department_fkey",
    "course_outline_version_offering_identity_fkey",
    "course_outline_version_curriculum_course_fkey",
    "course_outline_version_syllabus_identity_fkey",
  ];

  assert.match(migration, /CREATE TABLE "course_outline_versions"/);
  for (const name of names) {
    assert.ok(name.length <= 63);
    assert.match(migration, new RegExp(`"${name}"`));
  }
  assert.match(
    migration,
    /CREATE INDEX "course_outline_version_dept_offering_status_idx"\s+ON "course_outline_versions"\("department_id", "course_offering_id", "status"\);/,
  );
  assert.match(
    migration,
    /CREATE INDEX "course_outline_version_dept_syllabus_idx"\s+ON "course_outline_versions"\("department_id", "syllabus_version_id"\);/,
  );
});

test("migration is additive and contains no destructive SQL or data backfill", () => {
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /^COMMIT;/m);
  assert.doesNotMatch(migration, /^\s*(?:INSERT|UPDATE|DELETE)\b/im);
  assert.doesNotMatch(
    migration,
    /DROP\s+(?:TABLE|COLUMN|CONSTRAINT|INDEX|TYPE)/i,
  );
  assert.doesNotMatch(migration, /ALTER TABLE "(?:syllabus_versions|curriculum_courses)"/);
  assert.doesNotMatch(migration, /CASCADE/);
});

test("foundation adds no LessonPlan or duplicated outline and CLO/PLO content", () => {
  assert.doesNotMatch(schema, /model LessonPlan\b/);
  assert.doesNotMatch(courseOutlineVersion, /\bJson\??\b|jsonb/i);
  assert.doesNotMatch(
    courseOutlineVersion,
    /\b(?:content|courseObjective|objective|prerequisite|textbook|reference|resource|weeklyPlan|lessonPlan|cloId|ploId|cloText|ploText|cloPloMapping)\b/i,
  );
  assert.doesNotMatch(migration, /lesson_plans|course_outline_content|jsonb/i);
});
