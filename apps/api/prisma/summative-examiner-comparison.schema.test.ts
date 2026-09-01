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
    "202609010001_add_summative_examiner_comparisons",
    "migration.sql",
  ),
  "utf8",
);
const marksMigration = readFileSync(
  join(
    prismaRoot,
    "migrations",
    "202608290004_add_summative_examiner_marks",
    "migration.sql",
  ),
  "utf8",
);

function model(name: string) {
  return schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";
}

const comparison = model("SummativeExaminerComparison");

test("comparison evidence binds exact First and Second source submissions and future versions", () => {
  assert.match(
    comparison,
    /firstSubmission\s+SummativeExaminerMarkSubmission\s+@relation\("SummativeComparisonFirstSource", fields: \[firstSubmissionId, departmentId, examinationId, examinationCourseId, candidateId\]/,
  );
  assert.match(
    comparison,
    /secondSubmission\s+SummativeExaminerMarkSubmission\s+@relation\("SummativeComparisonSecondSource", fields: \[secondSubmissionId, departmentId, examinationId, examinationCourseId, candidateId\]/,
  );
  assert.match(
    comparison,
    /@@unique\(\[firstSubmissionId, secondSubmissionId\], map: "summative_comparison_source_pair_uq"\)/,
  );
  assert.match(
    comparison,
    /@@unique\(\[departmentId, examinationCourseId, candidateId, comparisonVersion\], map: "summative_comparison_candidate_version_uq"\)/,
  );
});

test("all academic numeric evidence uses explicit PostgreSQL numeric scales", () => {
  for (const field of [
    "firstTotalSnapshot",
    "secondTotalSnapshot",
    "summativeFullMarkSnapshot",
    "absoluteDifference",
  ]) {
    assert.match(comparison, new RegExp(`${field}\\s+Decimal[\\s\\S]*?@db\\.Decimal\\(6, 2\\)`));
  }
  assert.match(
    comparison,
    /variancePercentage\s+Decimal[\s\S]*?@db\.Decimal\(9, 6\)/,
  );
  assert.match(
    comparison,
    /thresholdPercentageSnapshot\s+Decimal[\s\S]*?@db\.Decimal\(5, 2\)/,
  );
});

test("migration is additive, restrictive and protects exact scope with FKs", () => {
  for (const constraint of [
    "summative_comparison_department_fkey",
    "summative_comparison_examination_fkey",
    "summative_comparison_exam_course_fkey",
    "summative_comparison_candidate_fkey",
    "summative_comparison_first_source_fkey",
    "summative_comparison_second_source_fkey",
  ]) {
    assert.match(migration, new RegExp(`ADD CONSTRAINT "${constraint}"`));
  }
  assert.doesNotMatch(
    migration,
    /DROP\s+(?:TABLE|COLUMN|CONSTRAINT|INDEX|TYPE)|ON DELETE CASCADE|ON UPDATE CASCADE/i,
  );
  assert.doesNotMatch(
    migration,
    /INSERT\s+INTO\s+"summative_examiner_comparisons"/i,
  );
  assert.match(migration, /ON DELETE RESTRICT ON UPDATE RESTRICT/g);
});

test("database validation re-derives sources, full mark, difference, variance, rule and exact decision", () => {
  for (const evidence of [
    /first_source\."examiner_seat" <> 'FIRST_EXAMINER'/,
    /second_source\."examiner_seat" <> 'SECOND_EXAMINER'/,
    /first_source\."status" <> 'LOCKED'/,
    /second_source\."status" <> 'LOCKED'/,
    /source versions are ambiguous/,
    /summative_full_mark/,
    /ABS\(first_source\."total_mark" - second_source\."total_mark"\)/,
    /ROUND\(\(expected_difference \* 100\) \/ authoritative_full_mark, 6\)/,
    /expected_difference \* 100[\s\S]*?>= authoritative_full_mark \* NEW\."threshold_percentage_snapshot"/,
    /SUMMATIVE_FS_VARIANCE_15_PERCENT_V1/,
    /15\.00::DECIMAL\(5,2\)/,
  ]) {
    assert.match(migration, evidence);
  }
});

test("comparison row update and delete are rejected by an always-enabled protection trigger", () => {
  assert.match(
    migration,
    /IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN[\s\S]*?comparison evidence is immutable/,
  );
  assert.match(
    migration,
    /CREATE TRIGGER "summative_examiner_comparison_validate_trg"[\s\S]*?BEFORE INSERT OR UPDATE OR DELETE/,
  );
});

test("direct invalid inserts cannot choose source snapshots, derived values, rule or version", () => {
  for (const evidence of [
    /source snapshots are invalid/,
    /full-mark snapshot is invalid/,
    /source totals are invalid/,
    /rule evidence is invalid/,
    /derived evidence is invalid/,
    /comparison version is invalid/,
    /FOR UPDATE/,
  ]) {
    assert.match(migration, evidence);
  }
});

test("all pre-existing Summative database protection triggers remain in the migration chain", () => {
  for (const trigger of [
    "summative_candidate_identity_immutable_trg",
    "summative_locked_submission_immutable_trg",
    "summative_submission_lock_validate_trg",
    "summative_question_mark_validate_trg",
  ]) {
    assert.match(marksMigration, new RegExp(`CREATE TRIGGER "${trigger}"`));
    assert.doesNotMatch(migration, new RegExp(`DROP TRIGGER "${trigger}"`));
  }
});

test("PostgreSQL identifiers are bounded to 63 bytes", () => {
  const identifiers = Array.from(
    migration.matchAll(/(?:INDEX|CONSTRAINT|TRIGGER|FUNCTION) "([^"]+)"/g),
  ).map((match) => match[1]!);
  for (const identifier of identifiers) {
    assert.ok(Buffer.byteLength(identifier, "utf8") <= 63, identifier);
  }
});
