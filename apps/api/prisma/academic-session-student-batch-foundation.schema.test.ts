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
    "202608200003_add_academic_session_student_batch_foundation",
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
const academicProgram = model("AcademicProgram");
const academicSession = model("AcademicSession");
const studentBatch = model("StudentBatch");
const curriculumVersion = model("CurriculumVersion");
const studentCurriculumAssignment = model("StudentCurriculumAssignment");
const courseOffering = model("CourseOffering");

test("AcademicSession has the minimal durable department-scoped identity", () => {
  assert.notEqual(academicSession, "");
  assert.match(academicSession, /id\s+String\s+@id @default\(cuid\(\)\)/);
  assert.match(academicSession, /departmentId\s+String\s+@map\("department_id"\)/);
  assert.match(academicSession, /code\s+String\s+@db\.VarChar\(64\)/);
  assert.match(academicSession, /name\s+String\b/);
  assert.match(academicSession, /archivedAt\s+DateTime\?\s+@map\("archived_at"\)/);
  assert.match(
    academicSession,
    /createdAt\s+DateTime\s+@default\(now\(\)\) @map\("created_at"\)/,
  );
  assert.match(
    academicSession,
    /updatedAt\s+DateTime\s+@updatedAt @map\("updated_at"\)/,
  );
  assert.match(academicSession, /@@map\("academic_sessions"\)/);
  assert.doesNotMatch(academicSession, /\b(?:status|startDate|endDate)\b/);
});

test("AcademicSession uniqueness is department-scoped and exposes a tenant candidate identity", () => {
  assert.match(
    academicSession,
    /@@unique\(\[departmentId, code\], map: "academic_session_department_code_uq"\)/,
  );
  assert.match(
    academicSession,
    /@@unique\(\[id, departmentId\], map: "academic_session_id_department_uq"\)/,
  );
  assert.doesNotMatch(academicSession, /^\s+code\s+String[^\n]*\s@unique\b/m);
  assert.doesNotMatch(academicSession, /@@unique\(\[code\]/);

  assert.match(
    migration,
    /CREATE UNIQUE INDEX "academic_session_department_code_uq"\s+ON "academic_sessions"\("department_id", "code"\);/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "academic_session_id_department_uq"\s+ON "academic_sessions"\("id", "department_id"\);/,
  );
});

test("StudentBatch has only the intended programme and academic-session cohort identity", () => {
  assert.notEqual(studentBatch, "");
  assert.match(studentBatch, /id\s+String\s+@id @default\(cuid\(\)\)/);
  for (const [field, column] of [
    ["departmentId", "department_id"],
    ["academicProgramId", "academic_program_id"],
    ["academicSessionId", "academic_session_id"],
  ]) {
    assert.match(
      studentBatch,
      new RegExp(`${field}\\s+String\\s+@map\\("${column}"\\)`),
    );
  }
  assert.match(studentBatch, /code\s+String\s+@db\.VarChar\(64\)/);
  assert.match(studentBatch, /name\s+String\b/);
  assert.match(studentBatch, /archivedAt\s+DateTime\?\s+@map\("archived_at"\)/);
  assert.match(
    studentBatch,
    /createdAt\s+DateTime\s+@default\(now\(\)\) @map\("created_at"\)/,
  );
  assert.match(
    studentBatch,
    /updatedAt\s+DateTime\s+@updatedAt @map\("updated_at"\)/,
  );
  assert.match(studentBatch, /@@map\("student_batches"\)/);
});

test("StudentBatch business uniqueness preserves multiple coded cohorts in one programme/session", () => {
  assert.match(
    studentBatch,
    /@@unique\(\[departmentId, academicProgramId, academicSessionId, code\], map: "student_batch_department_program_session_code_uq"\)/,
  );
  assert.match(
    studentBatch,
    /@@unique\(\[id, departmentId\], map: "student_batch_id_department_uq"\)/,
  );
  assert.doesNotMatch(studentBatch, /^\s+code\s+String[^\n]*\s@unique\b/m);
  assert.doesNotMatch(studentBatch, /@@unique\(\[code\]/);
  assert.doesNotMatch(
    studentBatch,
    /@@unique\(\[departmentId, academicProgramId, academicSessionId\]\)/,
  );

  assert.match(
    migration,
    /CREATE UNIQUE INDEX "student_batch_department_program_session_code_uq"\s+ON "student_batches"\("department_id", "academic_program_id", "academic_session_id", "code"\);/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "student_batch_id_department_uq"\s+ON "student_batches"\("id", "department_id"\);/,
  );
});

test("StudentBatch programme and session relations enforce exact department identity", () => {
  assert.match(
    academicProgram,
    /@@unique\(\[id, departmentId\], map: "academic_program_id_department_uq"\)/,
  );
  assert.match(
    studentBatch,
    /academicProgram\s+AcademicProgram\s+@relation\(fields: \[academicProgramId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "student_batch_program_identity_fkey"\)/,
  );
  assert.match(
    studentBatch,
    /academicSession\s+AcademicSession\s+@relation\(fields: \[academicSessionId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "student_batch_session_identity_fkey"\)/,
  );

  assert.match(
    migration,
    /CONSTRAINT "student_batch_program_identity_fkey"\s+FOREIGN KEY \("academic_program_id", "department_id"\)\s+REFERENCES "academic_programs"\("id", "department_id"\)\s+ON DELETE RESTRICT ON UPDATE RESTRICT;/,
  );
  assert.match(
    migration,
    /CONSTRAINT "student_batch_session_identity_fkey"\s+FOREIGN KEY \("academic_session_id", "department_id"\)\s+REFERENCES "academic_sessions"\("id", "department_id"\)\s+ON DELETE RESTRICT ON UPDATE RESTRICT;/,
  );
});

test("all new department and academic relationships are restrictive", () => {
  for (const relation of [
    /department\s+Department\s+@relation\(fields: \[departmentId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict, map: "academic_session_department_fkey"\)/,
    /department\s+Department\s+@relation\(fields: \[departmentId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict, map: "student_batch_department_fkey"\)/,
  ]) {
    assert.match(schema, relation);
  }

  const newForeignKeys = Array.from(
    migration.matchAll(/ADD CONSTRAINT "(?:academic_session|student_batch)_[^"]+_fkey"[\s\S]*?;/g),
  ).map((match) => match[0]);
  assert.equal(newForeignKeys.length, 4);
  for (const foreignKey of newForeignKeys) {
    assert.match(foreignKey, /ON DELETE RESTRICT ON UPDATE RESTRICT;/);
    assert.doesNotMatch(foreignKey, /CASCADE/i);
  }
});

test("the required back-relations are present without unrelated aliases", () => {
  assert.match(department, /academicSessions\s+AcademicSession\[\]/);
  assert.match(department, /studentBatches\s+StudentBatch\[\]/);
  assert.match(academicProgram, /studentBatches\s+StudentBatch\[\]/);
  assert.match(academicSession, /studentBatches\s+StudentBatch\[\]/);
});

test("StudentBatch remains separate from term, offering, coordinator, and result batch concepts", () => {
  for (const forbiddenField of [
    "academicTermId",
    "courseOfferingId",
    "sectionCode",
    "coordinatorUserId",
    "assignedByUserId",
    "teacherUserId",
    "batchCode",
  ]) {
    assert.doesNotMatch(studentBatch, new RegExp(`\\b${forbiddenField}\\b`));
  }
  assert.doesNotMatch(studentBatch, /\bJson\b/);
  assert.match(schema, /model ResultPublicationBatch \{/);
  assert.match(schema, /model AttendanceImportBatch \{/);
  assert.match(schema, /model Session \{/);
});

test("existing curriculum, student, and offering bindings are not rewritten", () => {
  assert.match(
    curriculumVersion,
    /effectiveAcademicSessionCode\s+String\s+@map\("effective_academic_session_code"\) @db\.VarChar\(64\)/,
  );
  assert.doesNotMatch(curriculumVersion, /\bacademicSessionId\b/);
  assert.doesNotMatch(courseOffering, /\b(?:studentBatchId|academicSessionId)\b/);
  assert.doesNotMatch(studentCurriculumAssignment, /\bstudentBatchId\b/);
});

test("migration creates only the two new academic identity tables and their required candidate key", () => {
  assert.deepEqual(
    Array.from(migration.matchAll(/CREATE TABLE "([^"]+)"/g)).map(
      (match) => match[1],
    ),
    ["academic_sessions", "student_batches"],
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "academic_program_id_department_uq"\s+ON "academic_programs"\("id", "department_id"\);/,
  );
  assert.doesNotMatch(migration, /course_offerings/i);
  assert.doesNotMatch(migration, /student_curriculum_assignments/i);
  assert.doesNotMatch(migration, /curriculum_versions/i);
});

test("migration is additive and contains no data mutation, destructive DDL, or runtime authority", () => {
  assert.doesNotMatch(
    migration,
    /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/im,
  );
  assert.doesNotMatch(
    migration,
    /\bDROP\s+(?:TABLE|COLUMN|CONSTRAINT|INDEX|TYPE)\b/i,
  );
  assert.doesNotMatch(migration, /\b(?:BACKFILL|GRANT|REVOKE)\b/i);
  assert.doesNotMatch(migration, /\bCASCADE\b/i);
  assert.doesNotMatch(
    `${schema}\n${migration}`,
    /model (?:BatchCoordinatorAssignment|ProgrammeCoordinatorAssignment) \{/,
  );
  assert.doesNotMatch(
    migration,
    /course_outline|coordinator|authorization|permission|policy|role/i,
  );
});
