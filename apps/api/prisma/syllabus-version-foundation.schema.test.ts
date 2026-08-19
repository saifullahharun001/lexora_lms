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
    "202608140001_add_syllabus_version_foundation",
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
const curriculumCourse = model("CurriculumCourse");
const syllabusVersion = model("SyllabusVersion");
const courseOffering = model("CourseOffering");

test("SyllabusVersion is an additive versioned lifecycle foundation", () => {
  assert.match(syllabusVersion, /id\s+String\s+@id @default\(cuid\(\)\)/);
  assert.match(
    syllabusVersion,
    /departmentId\s+String\s+@map\("department_id"\)/,
  );
  assert.match(
    syllabusVersion,
    /curriculumCourseId\s+String\s+@map\("curriculum_course_id"\)/,
  );
  assert.match(syllabusVersion, /code\s+String\s+@db\.VarChar\(64\)/);
  assert.match(
    syllabusVersion,
    /versionNumber\s+Int\s+@map\("version_number"\) @db\.SmallInt/,
  );
  assert.match(
    syllabusVersion,
    /status\s+AcademicVersionStatus\s+@default\(DRAFT\)/,
  );
  for (const field of [
    "effectiveFrom",
    "effectiveTo",
    "approvedAt",
    "archivedAt",
  ]) {
    assert.match(syllabusVersion, new RegExp(`${field}\\s+DateTime\\?`));
  }
  assert.match(syllabusVersion, /createdAt\s+DateTime\s+@default\(now\(\)\)/);
  assert.match(syllabusVersion, /updatedAt\s+DateTime\s+@updatedAt/);
  assert.match(syllabusVersion, /@@map\("syllabus_versions"\)/);
  assert.match(department, /syllabusVersions\s+SyllabusVersion\[\]/);
  assert.match(curriculumCourse, /syllabusVersions\s+SyllabusVersion\[\]/);
});

test("same-department curriculum ownership is enforced by a composite restrictive foreign key", () => {
  const candidateKey = "curriculum_course_id_department_uq";
  const foreignKey = "syllabus_version_dept_curriculum_course_fkey";
  for (const name of [candidateKey, foreignKey]) assert.ok(name.length <= 63);

  assert.match(
    curriculumCourse,
    new RegExp(`@@unique\\(\\[id, departmentId\\], map: "${candidateKey}"\\)`),
  );
  assert.match(
    syllabusVersion,
    new RegExp(
      `curriculumCourse\\s+CurriculumCourse\\s+@relation\\(fields: \\[curriculumCourseId, departmentId\\], references: \\[id, departmentId\\], onDelete: Restrict, map: "${foreignKey}"\\)`,
    ),
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "curriculum_course_id_department_uq"\s+ON "curriculum_courses"\("id", "department_id"\);/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \("curriculum_course_id", "department_id"\)\s+REFERENCES "curriculum_courses"\("id", "department_id"\)\s+ON DELETE RESTRICT ON UPDATE CASCADE;/,
  );

  const relationIsValid = (
    syllabusDepartmentId: string,
    curriculumCourseDepartmentId: string,
  ) => syllabusDepartmentId === curriculumCourseDepartmentId;
  assert.equal(relationIsValid("department-a", "department-a"), true);
  assert.equal(relationIsValid("department-a", "department-b"), false);
});

test("version code and number uniqueness preserve historical coexistence", () => {
  const codeKey = "syllabus_version_dept_curriculum_course_code_uq";
  const numberKey = "syllabus_version_dept_curriculum_course_number_uq";
  for (const name of [codeKey, numberKey]) assert.ok(name.length <= 63);

  assert.match(
    syllabusVersion,
    new RegExp(
      `@@unique\\(\\[departmentId, curriculumCourseId, code\\], map: "${codeKey}"\\)`,
    ),
  );
  assert.match(
    syllabusVersion,
    new RegExp(
      `@@unique\\(\\[departmentId, curriculumCourseId, versionNumber\\], map: "${numberKey}"\\)`,
    ),
  );
  assert.match(migration, new RegExp(`CREATE UNIQUE INDEX "${codeKey}"`));
  assert.match(migration, new RegExp(`CREATE UNIQUE INDEX "${numberKey}"`));

  const identities = [
    ["department-a", "curriculum-course-a", "SYL-1", 1],
    ["department-a", "curriculum-course-a", "SYL-2", 2],
  ] as const;
  assert.equal(
    new Set(identities.map((row) => row.slice(0, 3).join("|"))).size,
    2,
  );
  assert.equal(
    new Set(identities.map((row) => [row[0], row[1], row[3]].join("|"))).size,
    2,
  );
});

test("migration rejects invalid version, date, and lifecycle metadata", () => {
  assert.match(
    migration,
    /CONSTRAINT "syllabus_versions_positive_version" CHECK \("version_number" > 0\)/,
  );
  assert.match(
    migration,
    /CONSTRAINT "syllabus_versions_effective_date_order" CHECK \("effective_from" IS NULL OR "effective_to" IS NULL OR "effective_to" > "effective_from"\)/,
  );
  assert.match(
    migration,
    /"status" = 'DRAFT' AND "approved_at" IS NULL AND "archived_at" IS NULL/,
  );
  assert.match(
    migration,
    /"status" IN \('APPROVED', 'ACTIVE', 'RETIRED'\) AND "approved_at" IS NOT NULL AND "archived_at" IS NULL/,
  );
  assert.match(
    migration,
    /"status" = 'ARCHIVED' AND "approved_at" IS NOT NULL AND "archived_at" IS NOT NULL/,
  );

  const lifecycleIsValid = (
    status: string,
    approvedAt: Date | null,
    archivedAt: Date | null,
  ) =>
    (status === "DRAFT" && approvedAt === null && archivedAt === null) ||
    (["APPROVED", "ACTIVE", "RETIRED"].includes(status) &&
      approvedAt !== null &&
      archivedAt === null) ||
    (status === "ARCHIVED" && approvedAt !== null && archivedAt !== null);

  assert.equal(lifecycleIsValid("DRAFT", null, null), true);
  assert.equal(lifecycleIsValid("APPROVED", new Date(), null), true);
  assert.equal(lifecycleIsValid("ACTIVE", null, null), false);
  assert.equal(lifecycleIsValid("ARCHIVED", new Date(), null), false);
  assert.equal(lifecycleIsValid("UNKNOWN", new Date(), null), false);
});

test("migration is non-destructive and leaves CourseOffering curriculum binding unchanged", () => {
  assert.match(migration, /CREATE TABLE "syllabus_versions"/);
  assert.doesNotMatch(migration, /^\s*(?:UPDATE|DELETE|INSERT)\b/im);
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|CONSTRAINT)/i);
  assert.doesNotMatch(migration, /ALTER TABLE "course_offerings"/i);
  assert.match(
    courseOffering,
    /curriculumCourseId\s+String\?\s+@map\("curriculum_course_id"\)/,
  );
  assert.match(
    courseOffering,
    /curriculumCourse\s+CurriculumCourse\?\s+@relation\(fields: \[curriculumCourseId\], references: \[id\], onDelete: Restrict\)/,
  );
  assert.doesNotMatch(migration, /ADD COLUMN "syllabus_version_id"/);
});

test("original foundation migration exposes immutable syllabus identity without adding academic content", () => {
  assert.match(
    migration,
    /CONSTRAINT "syllabus_versions_pkey" PRIMARY KEY \("id"\)/,
  );
  assert.match(
    migration,
    /CONSTRAINT "syllabus_versions_department_id_fkey"[\s\S]*?ON DELETE RESTRICT ON UPDATE CASCADE;/,
  );
  assert.match(
    syllabusVersion,
    /^\s*courseOutlineVersions\s+CourseOutlineVersion\[\]\s*$/m,
  );
  assert.doesNotMatch(
    migration,
    /course_outlines|lesson_plans|course_content|course_objectives|clo|plo/i,
  );
});
