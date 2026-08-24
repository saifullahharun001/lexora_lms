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
  "202608240002_add_batch_coordinator_assignment_foundation",
    "migration.sql",
  ),
  "utf8",
);

function model(name: string) {
  return (
    schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ??
    ""
  );
}

function enumValues(name: string) {
  const block =
    schema.match(new RegExp(`enum ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1] ??
    "";
  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

const department = model("Department");
const user = model("User");
const studentBatch = model("StudentBatch");
const academicTerm = model("AcademicTerm");
const assignment = model("BatchCoordinatorAssignment");

test("BatchCoordinatorAssignmentStatus is dedicated and exact", () => {
  assert.deepEqual(enumValues("BatchCoordinatorAssignmentStatus"), [
    "ACTIVE",
    "INACTIVE",
    "ARCHIVED",
  ]);
});

test("all tenant-scoped parents expose the required candidate identities", () => {
  assert.match(
    user,
    /@@unique\(\[id, departmentId\], map: "user_id_department_uq"\)/,
  );
  assert.match(
    academicTerm,
    /@@unique\(\[id, departmentId\], map: "academic_term_id_department_uq"\)/,
  );
  assert.match(
    studentBatch,
    /@@unique\(\[id, departmentId\], map: "student_batch_id_department_uq"\)/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "user_id_department_uq"\s+ON "users"\("id", "department_id"\);/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "academic_term_id_department_uq"\s+ON "academic_terms"\("id", "department_id"\);/,
  );
});

test("BatchCoordinatorAssignment has the exact scalar and lifecycle foundation", () => {
  assert.notEqual(assignment, "");
  const requiredFields = [
    /id\s+String\s+@id @default\(cuid\(\)\)/,
    /departmentId\s+String\s+@map\("department_id"\)/,
    /studentBatchId\s+String\s+@map\("student_batch_id"\)/,
    /academicTermId\s+String\s+@map\("academic_term_id"\)/,
    /coordinatorUserId\s+String\s+@map\("coordinator_user_id"\)/,
    /assignedByUserId\s+String\s+@map\("assigned_by_user_id"\)/,
    /status\s+BatchCoordinatorAssignmentStatus\s+@default\(ACTIVE\)/,
    /assignedAt\s+DateTime\s+@default\(now\(\)\) @map\("assigned_at"\)/,
    /expiresAt\s+DateTime\?\s+@map\("expires_at"\)/,
    /unassignedAt\s+DateTime\?\s+@map\("unassigned_at"\)/,
    /archivedAt\s+DateTime\?\s+@map\("archived_at"\)/,
    /createdAt\s+DateTime\s+@default\(now\(\)\) @map\("created_at"\)/,
    /updatedAt\s+DateTime\s+@updatedAt @map\("updated_at"\)/,
  ];
  for (const field of requiredFields) assert.match(assignment, field);
  assert.match(assignment, /@@map\("batch_coordinator_assignments"\)/);
  assert.match(migration, /CREATE TABLE "batch_coordinator_assignments"/);
});

test("every assignment parent relation uses exact restrictive department identity", () => {
  const relations = [
    /department\s+Department\s+@relation\(fields: \[departmentId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict, map: "batch_coordinator_assignment_department_fkey"\)/,
    /studentBatch\s+StudentBatch\s+@relation\(fields: \[studentBatchId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "batch_coordinator_assignment_batch_identity_fkey"\)/,
    /academicTerm\s+AcademicTerm\s+@relation\(fields: \[academicTermId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "batch_coordinator_assignment_term_identity_fkey"\)/,
    /coordinatorUser\s+User\s+@relation\("BatchCoordinatorUser", fields: \[coordinatorUserId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "batch_coordinator_assignment_user_identity_fkey"\)/,
    /assignedByUser\s+User\s+@relation\("BatchCoordinatorAssignedBy", fields: \[assignedByUserId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "batch_coordinator_assignment_assigner_identity_fkey"\)/,
  ];
  for (const relation of relations) assert.match(assignment, relation);

  const foreignKeys = Array.from(
    migration.matchAll(
      /ADD CONSTRAINT "batch_coordinator_assignment_[^"]+_fkey"[\s\S]*?;/g,
    ),
  ).map((match) => match[0]);
  assert.equal(foreignKeys.length, 5);
  for (const foreignKey of foreignKeys) {
    assert.match(foreignKey, /ON DELETE RESTRICT ON UPDATE RESTRICT;/);
    assert.doesNotMatch(foreignKey, /CASCADE/i);
  }

  assert.match(
    migration,
    /FOREIGN KEY \("student_batch_id", "department_id"\)\s+REFERENCES "student_batches"\("id", "department_id"\)/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \("academic_term_id", "department_id"\)\s+REFERENCES "academic_terms"\("id", "department_id"\)/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \("coordinator_user_id", "department_id"\)\s+REFERENCES "users"\("id", "department_id"\)/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \("assigned_by_user_id", "department_id"\)\s+REFERENCES "users"\("id", "department_id"\)/,
  );
});

test("reverse relations are present and User roles remain unambiguous", () => {
  assert.match(
    department,
    /batchCoordinatorAssignments\s+BatchCoordinatorAssignment\[\]/,
  );
  assert.match(
    studentBatch,
    /coordinatorDuties\s+BatchCoordinatorAssignment\[\]/,
  );
  assert.match(
    academicTerm,
    /coordinatorDuties\s+BatchCoordinatorAssignment\[\]/,
  );
  assert.match(
    user,
    /batchCoordinatorAssignments\s+BatchCoordinatorAssignment\[\]\s+@relation\("BatchCoordinatorUser"\)/,
  );
  assert.match(
    user,
    /batchCoordinatorAssignedBy\s+BatchCoordinatorAssignment\[\]\s+@relation\("BatchCoordinatorAssignedBy"\)/,
  );
});

test("assignment identity and lookup indexes preserve exact Batch plus Term scope", () => {
  const schemaIndexes = [
    /@@unique\(\[id, departmentId\], map: "batch_coordinator_assignment_id_department_uq"\)/,
    /@@unique\(\[departmentId, studentBatchId, academicTermId, coordinatorUserId\], map: "batch_coord_assign_scope_user_uq"\)/,
    /@@index\(\[departmentId, studentBatchId, academicTermId, status\], map: "batch_coord_assign_scope_status_idx"\)/,
    /@@index\(\[departmentId, coordinatorUserId, status\], map: "batch_coord_assign_user_status_idx"\)/,
    /@@index\(\[departmentId, assignedByUserId\], map: "batch_coord_assign_assigner_idx"\)/,
  ];
  for (const index of schemaIndexes) assert.match(assignment, index);
  assert.doesNotMatch(
    assignment,
    /@@unique\(\[departmentId, studentBatchId, academicTermId\]/,
  );

  for (const identifier of [
    "batch_coordinator_assignment_id_department_uq",
    "batch_coord_assign_scope_user_uq",
    "batch_coord_assign_scope_status_idx",
    "batch_coord_assign_user_status_idx",
    "batch_coord_assign_assigner_idx",
  ]) {
    assert.match(migration, new RegExp(`CREATE (?:UNIQUE )?INDEX "${identifier}"`));
    assert.ok(Buffer.byteLength(identifier, "utf8") <= 63);
  }
});

test("migration adds only the approved temporal validity checks", () => {
  assert.match(
    migration,
    /CONSTRAINT "batch_coord_assign_expiry_after_assignment_ck"\s+CHECK \("expires_at" IS NULL OR "expires_at" > "assigned_at"\);/,
  );
  assert.match(
    migration,
    /CONSTRAINT "batch_coord_assign_unassigned_after_assignment_ck"\s+CHECK \("unassigned_at" IS NULL OR "unassigned_at" >= "assigned_at"\);/,
  );
  assert.equal(
    Array.from(migration.matchAll(/ADD CONSTRAINT "[^"]+"\s+CHECK/g)).length,
    2,
  );
});

test("alternative coordinator scopes and unresolved governance are absent", () => {
  for (const field of [
    "academicProgramId",
    "academicSessionId",
    "courseOfferingId",
    "curriculumVersionId",
    "effectiveAcademicSessionCode",
    "batchCode",
    "roleCode",
    "programmeCoordinatorId",
  ]) {
    assert.doesNotMatch(assignment, new RegExp(`\\b${field}\\b`));
  }
  assert.doesNotMatch(schema, /model ProgrammeCoordinatorAssignment \{/);
  assert.doesNotMatch(migration, /programme.?coordinator/i);
  assert.doesNotMatch(migration, /course_outline|policy|permission|role/i);
  assert.doesNotMatch(assignment, /CourseOutline|courseOutline/);
});

test("migration is additive, non-seeding, non-cascading, and non-destructive", () => {
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /^COMMIT;/m);
  assert.doesNotMatch(
    migration,
    /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/im,
  );
  assert.doesNotMatch(migration, /\b(?:BACKFILL|SEED|GRANT|REVOKE)\b/i);
  assert.doesNotMatch(migration, /\bCASCADE\b/i);
  assert.doesNotMatch(migration, /\bDROP\b/i);
  assert.deepEqual(
    Array.from(migration.matchAll(/CREATE TABLE "([^"]+)"/g)).map(
      (match) => match[1],
    ),
    ["batch_coordinator_assignments"],
  );
});
