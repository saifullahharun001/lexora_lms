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
    "202608260001_add_course_outline_correction_request_foundation",
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

const correctionRequest = model("CourseOutlineCorrectionRequest");

test("CourseOutlineCorrectionRequest has the exact scalar foundation", () => {
  assert.notEqual(correctionRequest, "");
  const requiredFields = [
    /id\s+String\s+@id @default\(cuid\(\)\)/,
    /departmentId\s+String\s+@map\("department_id"\)/,
    /courseOfferingId\s+String\s+@map\("course_offering_id"\)/,
    /courseOutlineVersionId\s+String\s+@map\("course_outline_version_id"\)/,
    /batchCoordinatorAssignmentId\s+String\s+@map\("batch_coordinator_assignment_id"\)/,
    /actorUserId\s+String\s+@map\("actor_user_id"\)/,
    /reason\s+String/,
    /returnedAt\s+DateTime\s+@map\("returned_at"\)/,
    /createdAt\s+DateTime\s+@default\(now\(\)\) @map\("created_at"\)/,
  ];
  for (const field of requiredFields) assert.match(correctionRequest, field);
  assert.match(correctionRequest, /@@map\("course_outline_correction_requests"\)/);

  // Migration checks
  assert.match(migration, /CREATE TABLE "course_outline_correction_requests"/);
  assert.match(migration, /"reason" TEXT NOT NULL/);
  assert.match(migration, /CONSTRAINT "course_outline_correction_req_reason_length_check" CHECK \(length\(regexp_replace\(reason, '\^\[\[:space:\]\]\+\|\[\[:space:\]\]\+\$', '', 'g'\)\) BETWEEN 1 AND 1000\)/);
  assert.doesNotMatch(migration, /CASCADE/i);
});

test("every relation uses exact restrictive department identity", () => {
  const relations = [
    /department\s+Department\s+@relation\(fields: \[departmentId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict, map: "course_outline_correction_request_department_fkey"\)/,
    /courseOutlineVersion\s+CourseOutlineVersion\s+@relation\(fields: \[courseOutlineVersionId, departmentId, courseOfferingId\], references: \[id, departmentId, courseOfferingId\], onDelete: Restrict, onUpdate: Restrict, map: "course_outline_correction_request_outline_identity_fkey"\)/,
    /batchCoordinatorAssignment\s+BatchCoordinatorAssignment\s+@relation\(fields: \[batchCoordinatorAssignmentId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "course_outline_correction_request_coordinator_identity_fkey"\)/,
    /actorUser\s+User\s+@relation\("CourseOutlineCorrectionRequestActor", fields: \[actorUserId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict, map: "course_outline_correction_request_actor_identity_fkey"\)/,
  ];
  for (const relation of relations) assert.match(correctionRequest, relation);

  const fks = [
    /ALTER TABLE "course_outline_correction_requests" ADD CONSTRAINT "course_outline_correction_request_department_fkey" FOREIGN KEY \("department_id"\) REFERENCES "departments"\("id"\) ON DELETE RESTRICT ON UPDATE RESTRICT;/,
    /ALTER TABLE "course_outline_correction_requests" ADD CONSTRAINT "course_outline_correction_request_outline_identity_fkey" FOREIGN KEY \("course_outline_version_id", "department_id", "course_offering_id"\) REFERENCES "course_outline_versions"\("id", "department_id", "course_offering_id"\) ON DELETE RESTRICT ON UPDATE RESTRICT;/,
    /ALTER TABLE "course_outline_correction_requests" ADD CONSTRAINT "course_outline_correction_request_coordinator_identity_fkey" FOREIGN KEY \("batch_coordinator_assignment_id", "department_id"\) REFERENCES "batch_coordinator_assignments"\("id", "department_id"\) ON DELETE RESTRICT ON UPDATE RESTRICT;/,
    /ALTER TABLE "course_outline_correction_requests" ADD CONSTRAINT "course_outline_correction_request_actor_identity_fkey" FOREIGN KEY \("actor_user_id", "department_id"\) REFERENCES "users"\("id", "department_id"\) ON DELETE RESTRICT ON UPDATE RESTRICT;/,
  ];
  for (const fk of fks) assert.match(migration, fk);
});

test("indexes exist as required", () => {
  const indexes = [
    /@@index\(\[departmentId, courseOutlineVersionId\], map: "course_outline_correction_request_dept_outline_idx"\)/,
    /@@index\(\[departmentId, courseOfferingId\], map: "course_outline_correction_request_dept_offering_idx"\)/,
    /@@index\(\[departmentId, batchCoordinatorAssignmentId\], map: "course_outline_correction_request_dept_assignment_idx"\)/,
  ];
  for (const index of indexes) assert.match(correctionRequest, index);

  const migrationIndexes = [
    /CREATE INDEX "course_outline_correction_request_dept_outline_idx" ON "course_outline_correction_requests"\("department_id", "course_outline_version_id"\);/,
    /CREATE INDEX "course_outline_correction_request_dept_offering_idx" ON "course_outline_correction_requests"\("department_id", "course_offering_id"\);/,
    /CREATE INDEX "course_outline_correction_request_dept_assignment_idx" ON "course_outline_correction_requests"\("department_id", "batch_coordinator_assignment_id"\);/,
  ];
  for (const mi of migrationIndexes) assert.match(migration, mi);
});
