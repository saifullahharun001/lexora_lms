import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const apiRoot = process.cwd();
const prismaRoot = join(apiRoot, "prisma");
const schema = readFileSync(join(prismaRoot, "schema.prisma"), "utf8");
const migration = readFileSync(
  join(
    prismaRoot,
    "migrations",
    "202608170001_add_course_offering_syllabus_binding_foundation",
    "migration.sql",
  ),
  "utf8",
);
const curriculumBindingMigration = readFileSync(
  join(
    prismaRoot,
    "migrations",
    "202608070001_add_course_offering_curriculum_binding",
    "migration.sql",
  ),
  "utf8",
);
const uniquenessMigration = readFileSync(
  join(
    prismaRoot,
    "migrations",
    "202608100002_redesign_course_offering_uniqueness",
    "migration.sql",
  ),
  "utf8",
);
const dtoRoot = join(
  apiRoot,
  "src",
  "modules",
  "academic",
  "presentation",
  "dto",
);
const createDto = readFileSync(
  join(dtoRoot, "create-course-offering.dto.ts"),
  "utf8",
);
const updateDto = readFileSync(
  join(dtoRoot, "update-course-offering.dto.ts"),
  "utf8",
);
const courseOfferingsController = readFileSync(
  join(
    apiRoot,
    "src",
    "modules",
    "academic",
    "presentation",
    "http",
    "course-offerings.controller.ts",
  ),
  "utf8",
);

function model(name: string) {
  return (
    schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? ""
  );
}

const syllabusVersion = model("SyllabusVersion");
const courseOffering = model("CourseOffering");

test("CourseOffering exposes only a nullable syllabus identity relation", () => {
  assert.match(
    courseOffering,
    /syllabusVersionId\s+String\?\s+@map\("syllabus_version_id"\)/,
  );
  assert.match(
    courseOffering,
    /syllabusVersion\s+SyllabusVersion\?\s+@relation\(fields: \[syllabusVersionId, departmentId, curriculumCourseId\], references: \[id, departmentId, curriculumCourseId\], onDelete: Restrict, onUpdate: Restrict, map: "course_offering_syllabus_identity_fkey"\)/,
  );
  assert.match(syllabusVersion, /courseOfferings\s+CourseOffering\[\]/);
  assert.match(migration, /ADD COLUMN "syllabus_version_id" TEXT;/);
  assert.doesNotMatch(migration, /"syllabus_version_id" TEXT NOT NULL/);
});

test("SyllabusVersion supplies the exact composite candidate identity", () => {
  const candidateKey = "syllabus_version_id_department_curriculum_course_uq";
  assert.ok(candidateKey.length <= 63);
  assert.match(
    syllabusVersion,
    new RegExp(
      `@@unique\\(\\[id, departmentId, curriculumCourseId\\], map: "${candidateKey}"\\)`,
    ),
  );
  assert.match(
    migration,
    new RegExp(
      `CREATE UNIQUE INDEX "${candidateKey}"\\s+ON "syllabus_versions"\\("id", "department_id", "curriculum_course_id"\\);`,
    ),
  );
});

test("CHECK permits unbound history but rejects syllabus identity without curriculum identity", () => {
  const checkName = "course_offering_syllabus_requires_curriculum";
  assert.ok(checkName.length <= 63);
  assert.match(
    migration,
    /CONSTRAINT "course_offering_syllabus_requires_curriculum"\s+CHECK \(\s*"syllabus_version_id" IS NULL\s+OR "curriculum_course_id" IS NOT NULL\s*\);/,
  );

  const checkAccepts = (
    syllabusVersionId: string | null,
    curriculumCourseId: string | null,
  ) => syllabusVersionId === null || curriculumCourseId !== null;

  assert.equal(checkAccepts(null, null), true);
  assert.equal(checkAccepts(null, "curriculum-a"), true);
  assert.equal(checkAccepts("syllabus-a", null), false);
  assert.equal(checkAccepts("syllabus-a", "curriculum-a"), true);
});

test("composite restrictive FK enforces department and CurriculumCourse identity", () => {
  const foreignKey = "course_offering_syllabus_identity_fkey";
  assert.ok(foreignKey.length <= 63);
  assert.match(
    migration,
    /CONSTRAINT "course_offering_syllabus_identity_fkey"\s+FOREIGN KEY \("syllabus_version_id", "department_id", "curriculum_course_id"\)\s+REFERENCES "syllabus_versions"\("id", "department_id", "curriculum_course_id"\)\s+ON DELETE RESTRICT ON UPDATE RESTRICT;/,
  );
  assert.doesNotMatch(
    migration,
    /CONSTRAINT "course_offering_syllabus_identity_fkey"[\s\S]*?ON UPDATE CASCADE;/,
  );

  const identityMatches = (
    offering: {
      syllabusVersionId: string;
      departmentId: string;
      curriculumCourseId: string;
    },
    syllabus: {
      id: string;
      departmentId: string;
      curriculumCourseId: string;
    },
  ) =>
    offering.syllabusVersionId === syllabus.id &&
    offering.departmentId === syllabus.departmentId &&
    offering.curriculumCourseId === syllabus.curriculumCourseId;

  const syllabus = {
    id: "syllabus-a",
    departmentId: "department-a",
    curriculumCourseId: "curriculum-a",
  };
  assert.equal(
    identityMatches(
      {
        syllabusVersionId: "syllabus-a",
        departmentId: "department-b",
        curriculumCourseId: "curriculum-a",
      },
      syllabus,
    ),
    false,
  );
  assert.equal(
    identityMatches(
      {
        syllabusVersionId: "syllabus-a",
        departmentId: "department-a",
        curriculumCourseId: "curriculum-b",
      },
      syllabus,
    ),
    false,
  );
  assert.equal(
    identityMatches(
      {
        syllabusVersionId: "syllabus-a",
        departmentId: "department-a",
        curriculumCourseId: "curriculum-a",
      },
      syllabus,
    ),
    true,
  );
});

test("department-scoped lookup is indexed without making syllabus use unique", () => {
  const indexName = "course_offering_dept_syllabus_version_idx";
  assert.ok(indexName.length <= 63);
  assert.match(
    courseOffering,
    new RegExp(
      `@@index\\(\\[departmentId, syllabusVersionId\\], map: "${indexName}"\\)`,
    ),
  );
  assert.match(
    migration,
    new RegExp(
      `CREATE INDEX "${indexName}"\\s+ON "course_offerings"\\("department_id", "syllabus_version_id"\\);`,
    ),
  );
  const syllabusCandidateKeys = [
    ...courseOffering.matchAll(
      /@@unique\(\[([^\]]*syllabusVersionId[^\]]*)\], map: "[^"]+"\)/g,
    ),
  ].map((match) => match[1]);
  assert.deepEqual(syllabusCandidateKeys, [
    "id, departmentId, curriculumCourseId, syllabusVersionId",
  ]);
  assert.doesNotMatch(
    migration,
    /CREATE UNIQUE INDEX "course_offering[^"]*syllabus/i,
  );

  const validReferences = [
    ["offering-a", "syllabus-a"],
    ["offering-b", "syllabus-a"],
  ];
  assert.equal(validReferences.length, 2);
  assert.equal(new Set(validReferences.map((row) => row[1])).size, 1);
});

test("existing CourseOffering curriculum relation and partial uniqueness remain intact", () => {
  assert.match(
    courseOffering,
    /curriculumCourseId\s+String\?\s+@map\("curriculum_course_id"\)/,
  );
  assert.match(
    courseOffering,
    /curriculumCourse\s+CurriculumCourse\?\s+@relation\(fields: \[curriculumCourseId\], references: \[id\], onDelete: Restrict\)/,
  );
  assert.match(
    courseOffering,
    /@@index\(\[departmentId, curriculumCourseId\], map: "course_offering_dept_curriculum_course_idx"\)/,
  );
  assert.match(
    curriculumBindingMigration,
    /CONSTRAINT "course_offerings_curriculum_course_id_fkey"[\s\S]*?ON DELETE RESTRICT ON UPDATE CASCADE;/,
  );
  assert.match(
    uniquenessMigration,
    /CREATE UNIQUE INDEX "course_offering_unbound_identity_uq"/,
  );
  assert.match(
    uniquenessMigration,
    /CREATE UNIQUE INDEX "course_offering_bound_curriculum_identity_uq"/,
  );
  assert.doesNotMatch(
    migration,
    /DROP INDEX "course_offering_(?:unbound_identity_uq|bound_curriculum_identity_uq)"/,
  );
});

test("migration is additive, status-neutral, and contains no historical backfill", () => {
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /^COMMIT;/m);
  assert.doesNotMatch(migration, /^\s*(?:UPDATE|DELETE|INSERT)\b/im);
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|CONSTRAINT|INDEX)/i);
  assert.doesNotMatch(
    migration,
    /\b(?:DRAFT|APPROVED|ACTIVE|RETIRED|ARCHIVED)\b/,
  );
  assert.doesNotMatch(
    migration,
    /"(?:enrollments|result_records|transcript_course_lines|curriculum_courses)"/,
  );
});

test("generic CourseOffering DTOs remain closed while the dedicated binding surface exists", () => {
  assert.doesNotMatch(createDto, /syllabusVersionId/);
  assert.doesNotMatch(updateDto, /syllabusVersionId/);
  assert.equal(
    existsSync(join(dtoRoot, "bind-course-offering-syllabus.dto.ts")),
    true,
  );
  assert.match(
    courseOfferingsController,
    /@Put\(":id\/syllabus-binding"\)[\s\S]*bindCourseOfferingSyllabus/,
  );
});
