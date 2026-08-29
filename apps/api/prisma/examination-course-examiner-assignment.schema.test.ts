import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const prismaRoot = join(process.cwd(), "prisma");
const schema = readFileSync(join(prismaRoot, "schema.prisma"), "utf8");
const migration = readFileSync(
  join(
    prismaRoot,
    "migrations",
    "202608290002_add_examination_course_examiner_assignment",
    "migration.sql",
  ),
  "utf8",
);

function model(name: string) {
  return schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";
}

const assignment = model("ExaminationCourseExaminerAssignment");

test("schema adds only independent First and Second Examiner seats with history-preserving lifecycle", () => {
  assert.match(
    schema,
    /enum ExaminationCourseExaminerSeat \{[\s\S]*?FIRST_EXAMINER[\s\S]*?SECOND_EXAMINER[\s\S]*?\}/,
  );
  const seatEnum =
    schema.match(/enum ExaminationCourseExaminerSeat \{[\s\S]*?\}/)?.[0] ?? "";
  assert.doesNotMatch(seatEnum, /THIRD_EXAMINER/);
  assert.match(
    schema,
    /enum ExaminationCourseExaminerAssignmentStatus \{[\s\S]*?ACTIVE[\s\S]*?INACTIVE[\s\S]*?ARCHIVED[\s\S]*?\}/,
  );
  for (const field of [
    "departmentId",
    "examinationId",
    "examinationCourseId",
    "assignedUserId",
    "assignedByUserId",
    "assignedAt",
    "expiresAt",
    "unassignedAt",
    "archivedAt",
    "createdAt",
    "updatedAt",
  ]) {
    assert.match(assignment, new RegExp(`\\b${field}\\b`));
  }
});

test("assignment relations use exact department-qualified identities and restrictive governance semantics", () => {
  assert.match(
    assignment,
    /examination\s+Examination\s+@relation\(fields: \[examinationId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict/,
  );
  assert.match(
    assignment,
    /examinationCourse\s+ExaminationCourse\s+@relation\(fields: \[examinationCourseId, departmentId, examinationId\], references: \[id, departmentId, examinationId\], onDelete: Restrict, onUpdate: Restrict/,
  );
  assert.match(
    assignment,
    /assignedUser\s+User\s+@relation\("ExaminationCourseExaminerAssignee", fields: \[assignedUserId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict/,
  );
  assert.match(
    assignment,
    /assignedByUser\s+User\s+@relation\("ExaminationCourseExaminerAssignedBy", fields: \[assignedByUserId, departmentId\], references: \[id, departmentId\], onDelete: Restrict, onUpdate: Restrict/,
  );
  assert.match(
    assignment,
    /@@unique\(\[id, departmentId, examinationId, examinationCourseId\], map: "exam_course_examiner_assignment_scope_identity_uq"\)/,
  );
});

test("migration enforces active seat and active user independence while retaining historical rows", () => {
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "exam_course_examiner_assignment_active_seat_uq"[\s\S]*?"seat"[\s\S]*?WHERE "status" = 'ACTIVE';/,
  );
  assert.match(
    migration,
    /CREATE UNIQUE INDEX "exam_course_examiner_assignment_active_user_uq"[\s\S]*?"assigned_user_id"[\s\S]*?WHERE "status" = 'ACTIVE';/,
  );
  assert.doesNotMatch(migration, /^\s*(?:DELETE|UPDATE|TRUNCATE|DROP)\b/im);
});

test("migration enforces expiry ordering and coherent lifecycle timestamps", () => {
  assert.match(
    migration,
    /CONSTRAINT "exam_course_examiner_assignment_expiry_order_ck"[\s\S]*?"expires_at" IS NULL OR "expires_at" > "assigned_at"/,
  );
  assert.match(
    migration,
    /CONSTRAINT "exam_course_examiner_assignment_lifecycle_ck"[\s\S]*?"status" = 'ACTIVE'[\s\S]*?"status" = 'INACTIVE'[\s\S]*?"status" = 'ARCHIVED'/,
  );
});

test("migration foreign keys are exact, restrictive, additive, and PostgreSQL-safe", () => {
  assert.match(
    migration,
    /FOREIGN KEY \(\s*"examination_course_id",\s*"department_id",\s*"examination_id"\s*\)[\s\S]*?REFERENCES "examination_courses"\(\s*"id",\s*"department_id",\s*"examination_id"\s*\)[\s\S]*?ON DELETE RESTRICT ON UPDATE RESTRICT/,
  );
  assert.equal((migration.match(/ON DELETE RESTRICT ON UPDATE RESTRICT/g) ?? []).length, 5);
  for (const identifier of Array.from(
    migration.matchAll(/(?:INDEX|CONSTRAINT) "([^"]+)"/g),
  ).map((match) => match[1]!)) {
    assert.ok(Buffer.byteLength(identifier, "utf8") <= 63, identifier);
  }
  assert.doesNotMatch(migration, /^\s*(?:GRANT|REVOKE|CREATE\s+TRIGGER)\b/im);
});

test("committed Summative migrations remain byte-for-byte unchanged", () => {
  const expected = new Map([
    [
      "202608280001_add_summative_examination_committee_foundation",
      "d406d01c03c7bec36da9d2cac25fbb505a6a39a27a02f18239b78e3dc6ffd019",
    ],
    [
      "202608290001_add_external_examination_committee_member",
      "54e1b3e73a8ead0aaa7b492094286c7769806db001799526485172bbf40c62ef",
    ],
  ]);
  for (const [directory, checksum] of expected) {
    const historical = readFileSync(
      join(prismaRoot, "migrations", directory, "migration.sql"),
    );
    assert.equal(createHash("sha256").update(historical).digest("hex"), checksum);
  }
});

test("checkpoint introduces no marks, question, script, variance, or handoff model", () => {
  assert.doesNotMatch(
    schema,
    /model\s+(?:ExaminerMark|SummativeQuestion|QuestionPaper|AnswerScript|ThirdExaminerReferral|SummativeResultHandoff)\b/,
  );
});
