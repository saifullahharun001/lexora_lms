import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
    "202608210001_add_course_offering_student_batch_binding_foundation",
    "migration.sql",
  ),
  "utf8",
);
const historicalUniquenessMigration = readFileSync(
  join(
    prismaRoot,
    "migrations",
    "202608100002_redesign_course_offering_uniqueness",
    "migration.sql",
  ),
  "utf8",
);
const historicalSyllabusBindingMigration = readFileSync(
  join(
    prismaRoot,
    "migrations",
    "202608170001_add_course_offering_syllabus_binding_foundation",
    "migration.sql",
  ),
  "utf8",
);
const repositoryPort = readFileSync(
  join(
    apiRoot,
    "src",
    "modules",
    "academic",
    "application",
    "ports",
    "academic.repository.port.ts",
  ),
  "utf8",
);
const createDto = readFileSync(
  join(
    apiRoot,
    "src",
    "modules",
    "academic",
    "presentation",
    "dto",
    "create-course-offering.dto.ts",
  ),
  "utf8",
);
const updateDto = readFileSync(
  join(
    apiRoot,
    "src",
    "modules",
    "academic",
    "presentation",
    "dto",
    "update-course-offering.dto.ts",
  ),
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
const academicRepository = readFileSync(
  join(
    apiRoot,
    "src",
    "modules",
    "academic",
    "infrastructure",
    "repositories",
    "prisma-academic.repository.ts",
  ),
  "utf8",
);
function model(name: string) {
  return (
    schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? ""
  );
}

function interfaceBlock(name: string) {
  return (
    repositoryPort.match(
      new RegExp(`export interface ${name} \\{[\\s\\S]*?\\n\\}`),
    )?.[0] ?? ""
  );
}

function controllerMethod(name: string) {
  return (
    courseOfferingsController.match(
      new RegExp(`\\n  ${name}\\([\\s\\S]*?\\n  \\}`),
    )?.[0] ?? ""
  );
}

const studentBatch = model("StudentBatch");
const courseOffering = model("CourseOffering");
const courseOutlineVersion = model("CourseOutlineVersion");
const curriculumVersion = model("CurriculumVersion");
const studentCurriculumAssignment = model("StudentCurriculumAssignment");
const enrollment = model("Enrollment");

test("CourseOffering exposes only a nullable StudentBatch identity relation", () => {
  assert.match(
    courseOffering,
    /studentBatchId\s+String\?\s+@map\("student_batch_id"\)/,
  );
  assert.match(
    courseOffering,
    /studentBatch\s+StudentBatch\?\s+@relation\(fields: \[studentBatchId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "course_offering_student_batch_identity_fkey"\)/,
  );
  assert.match(studentBatch, /courseOfferings\s+CourseOffering\[\]/);
  assert.match(migration, /ADD COLUMN "student_batch_id" TEXT;/);
  assert.doesNotMatch(migration, /"student_batch_id" TEXT NOT NULL/);
  assert.doesNotMatch(migration, /ADD COLUMN "student_batch_id"[^;]*DEFAULT/i);
});

test("StudentBatch foreign key is department-safe and restrictive", () => {
  assert.match(
    studentBatch,
    /@@unique\(\[id, departmentId\], map: "student_batch_id_department_uq"\)/,
  );
  assert.match(
    migration,
    /CONSTRAINT "course_offering_student_batch_identity_fkey"\s+FOREIGN KEY \("student_batch_id", "department_id"\)\s+REFERENCES "student_batches"\("id", "department_id"\)\s+ON DELETE RESTRICT ON UPDATE RESTRICT;/,
  );
  assert.doesNotMatch(
    migration,
    /CONSTRAINT "course_offering_student_batch_identity_fkey"[\s\S]*?CASCADE/,
  );
});

test("batch binding requires an existing curriculum binding", () => {
  assert.match(
    migration,
    /CONSTRAINT "course_offering_batch_requires_curriculum"\s+CHECK \(\s*"student_batch_id" IS NULL\s+OR "curriculum_course_id" IS NOT NULL\s*\);/,
  );

  const checkAccepts = (
    studentBatchId: string | null,
    curriculumCourseId: string | null,
  ) => studentBatchId === null || curriculumCourseId !== null;

  assert.equal(checkAccepts(null, null), true);
  assert.equal(checkAccepts(null, "curriculum-a"), true);
  assert.equal(checkAccepts("batch-a", null), false);
  assert.equal(checkAccepts("batch-a", "curriculum-a"), true);
});

test("the historical curriculum-unbound CourseOffering identity remains exact", () => {
  assert.match(
    historicalUniquenessMigration,
    /CREATE UNIQUE INDEX "course_offering_unbound_identity_uq"\s+ON "course_offerings"\("department_id", "academic_term_id", "course_id", "section_code"\)\s+WHERE "curriculum_course_id" IS NULL;/,
  );
  assert.doesNotMatch(migration, /course_offering_unbound_identity_uq/);
  assert.equal(
    createHash("sha256")
      .update(historicalUniquenessMigration.replace(/\r\n?/g, "\n"), "utf8")
      .digest("hex")
      .toUpperCase(),
    "C3D1C1A24B0C43E5D64A3B1C4D77541389AEC221482C1590743EC0EA078384CE",
  );
});

test("replacement bound identities are created before the old batch-unaware index is removed", () => {
  const temporaryUnbatchedIndex =
    'CREATE UNIQUE INDEX "course_offering_bound_curriculum_identity_tmp_uq"';
  const batchedIndex =
    'CREATE UNIQUE INDEX "course_offering_bound_batched_curriculum_identity_uq"';
  const oldIndexDrop =
    'DROP INDEX "course_offering_bound_curriculum_identity_uq";';
  const canonicalRename =
    'ALTER INDEX "course_offering_bound_curriculum_identity_tmp_uq"';

  assert.ok(migration.indexOf(temporaryUnbatchedIndex) >= 0);
  assert.ok(migration.indexOf(batchedIndex) >= 0);
  assert.ok(migration.indexOf(oldIndexDrop) >= 0);
  assert.ok(migration.indexOf(canonicalRename) >= 0);
  assert.ok(
    migration.indexOf(temporaryUnbatchedIndex) < migration.indexOf(oldIndexDrop),
  );
  assert.ok(migration.indexOf(batchedIndex) < migration.indexOf(oldIndexDrop));
  assert.ok(migration.indexOf(oldIndexDrop) < migration.indexOf(canonicalRename));
});

test("curriculum-bound batch-unbound uniqueness preserves the canonical final identity", () => {
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "course_offering_bound_curriculum_identity_tmp_uq"\s+ON "course_offerings"\("department_id", "academic_term_id", "curriculum_course_id", "section_code"\)\s+WHERE "curriculum_course_id" IS NOT NULL\s+AND "student_batch_id" IS NULL;/,
  );
  assert.match(
    migration,
    /ALTER INDEX "course_offering_bound_curriculum_identity_tmp_uq"\s+RENAME TO "course_offering_bound_curriculum_identity_uq";/,
  );
  assert.doesNotMatch(
    migration,
    /course_offering_bound_unbatched_curriculum_identity_uq/,
  );
  assert.match(
    academicRepository,
    /target === "course_offering_bound_curriculum_identity_uq"/,
  );
});

test("curriculum-bound batch-bound uniqueness includes exact StudentBatch identity", () => {
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "course_offering_bound_batched_curriculum_identity_uq"\s+ON "course_offerings"\("department_id", "academic_term_id", "student_batch_id", "curriculum_course_id", "section_code"\)\s+WHERE "curriculum_course_id" IS NOT NULL\s+AND "student_batch_id" IS NOT NULL;/,
  );

  const batchBoundIdentity = (studentBatchId: string) =>
    [
      "department-a",
      "term-a",
      studentBatchId,
      "curriculum-a",
      "A",
    ].join("|");

  assert.notEqual(batchBoundIdentity("batch-a"), batchBoundIdentity("batch-b"));
  assert.equal(batchBoundIdentity("batch-a"), batchBoundIdentity("batch-a"));
});

test("future department-term-batch authorization lookup has a non-unique supporting index", () => {
  const indexName = "course_offering_department_term_student_batch_idx";
  assert.match(
    courseOffering,
    new RegExp(
      `@@index\\(\\[departmentId, academicTermId, studentBatchId\\], map: "${indexName}"\\)`,
    ),
  );
  assert.match(
    migration,
    new RegExp(
      `CREATE INDEX "${indexName}"\\s+ON "course_offerings"\\("department_id", "academic_term_id", "student_batch_id"\\);`,
    ),
  );
  assert.doesNotMatch(migration, new RegExp(`CREATE UNIQUE INDEX "${indexName}"`));
});

test("migration performs no data mutation and drops only the superseded bound index", () => {
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /^COMMIT;/m);
  assert.doesNotMatch(
    migration,
    /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/im,
  );
  assert.doesNotMatch(migration, /\bBACKFILL\b/i);
  assert.doesNotMatch(migration, /\bDROP\s+(?:TABLE|COLUMN|CONSTRAINT)\b/i);
  assert.deepEqual(migration.match(/\bDROP INDEX\s+"[^"]+";/g), [
    'DROP INDEX "course_offering_bound_curriculum_identity_uq";',
  ]);
  assert.match(
    historicalUniquenessMigration,
    /CREATE UNIQUE INDEX "course_offering_bound_curriculum_identity_uq"/,
  );
  assert.doesNotMatch(
    historicalUniquenessMigration,
    /DROP INDEX "course_offering_bound_curriculum_identity_uq"/,
  );
  assert.doesNotMatch(migration, /\bCASCADE\b/i);
});

test("existing Course Outline and syllabus identities remain unchanged", () => {
  assert.doesNotMatch(courseOutlineVersion, /\bstudentBatchId\b/);
  assert.match(
    courseOffering,
    /@@unique\(\[id, departmentId, curriculumCourseId, syllabusVersionId\], map: "course_offering_outline_identity_uq"\)/,
  );
  assert.match(
    courseOutlineVersion,
    /courseOffering\s+CourseOffering\s+@relation\(fields: \[courseOfferingId, departmentId, curriculumCourseId, syllabusVersionId\], references: \[id, departmentId, curriculumCourseId, syllabusVersionId\], onDelete: Restrict, onUpdate: Restrict, map: "course_outline_version_offering_identity_fkey"\)/,
  );
  assert.match(
    historicalSyllabusBindingMigration,
    /CONSTRAINT "course_offering_syllabus_requires_curriculum"[\s\S]*?CONSTRAINT "course_offering_syllabus_identity_fkey"/,
  );
  assert.doesNotMatch(
    migration,
    /course_offering_(?:outline_identity_uq|syllabus_requires_curriculum|syllabus_identity_fkey)|course_outline_versions/,
  );
});

test("generic CourseOffering create and update boundaries remain closed to StudentBatch", () => {
  assert.doesNotMatch(createDto, /studentBatchId/);
  assert.doesNotMatch(updateDto, /studentBatchId/);
  assert.doesNotMatch(interfaceBlock("CreateCourseOfferingInput"), /studentBatchId/);
  assert.doesNotMatch(interfaceBlock("UpdateCourseOfferingInput"), /studentBatchId/);
  assert.doesNotMatch(controllerMethod("create"), /studentBatchId/);
  assert.doesNotMatch(controllerMethod("update"), /studentBatchId/);
});

test("no adjacent academic model or loose session identity is repurposed", () => {
  assert.doesNotMatch(courseOffering, /\b(?:academicProgramId|academicSessionId)\b/);
  assert.doesNotMatch(studentCurriculumAssignment, /\bstudentBatchId\b/);
  assert.doesNotMatch(enrollment, /\bstudentBatchId\b/);
  assert.match(
    curriculumVersion,
    /effectiveAcademicSessionCode\s+String\s+@map\("effective_academic_session_code"\) @db\.VarChar\(64\)/,
  );
});

test("StudentBatch-binding foundation migration introduces no Coordinator authority artifact", () => {
  assert.doesNotMatch(migration, /coordinator|policy|permission|role|audit/i);
});

test("all explicit PostgreSQL identifiers fit the 63-byte identifier limit", () => {
  const identifiers = Array.from(
    migration.matchAll(/\b(?:CONSTRAINT|INDEX)\s+"([^"]+)"/g),
  ).map((match) => match[1] ?? "");

  assert.ok(identifiers.length >= 5);
  for (const identifier of identifiers) {
    assert.ok(
      Buffer.byteLength(identifier, "utf8") <= 63,
      `${identifier} exceeds PostgreSQL's identifier limit`,
    );
  }
});
