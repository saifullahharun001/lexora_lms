import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const prismaRoot = join(process.cwd(), "prisma");
const schemaBytes = readFileSync(join(prismaRoot, "schema.prisma"));
const migrationBytes = readFileSync(
  join(
    prismaRoot,
    "migrations",
    "202609020002_add_summative_calculated_committee_approval",
    "migration.sql",
  ),
);
const schema = schemaBytes.toString("utf8");
const migration = migrationBytes.toString("utf8");
const attributes = readFileSync(
  join(prismaRoot, "..", "..", "..", ".gitattributes"),
  "utf8",
);
const calculated =
  schema.match(/model SummativeCalculatedMark \{[\s\S]*?\n\}/)?.[0] ?? "";
const review =
  schema.match(/model SummativeCommitteeMemberReview \{[\s\S]*?\n\}/)?.[0] ?? "";
const approval =
  schema.match(/model SummativeChairmanApproval \{[\s\S]*?\n\}/)?.[0] ?? "";

test("schema adds one common calculated evidence boundary for both paths", () => {
  assert.match(schema, /enum SummativeCalculatedMarkPath \{[\s\S]*FIRST_SECOND_AVERAGE[\s\S]*THREE_TOTAL_NEAREST_PAIR/);
  for (const field of [
    "comparisonId",
    "comparisonVersionSnapshot",
    "threeTotalCalculationId",
    "threeTotalCalculationVersionSnapshot",
    "questionConfigurationId",
    "firstSubmissionId",
    "secondSubmissionId",
    "thirdSubmissionId",
    "summativeFullMarkSnapshot",
    "calculatedMarkVersion",
    "ruleVersionCode",
    "derivedSummativeValue",
    "calculatedAt",
  ]) {
    assert.match(calculated, new RegExp(`\\b${field}\\b`));
  }
  assert.match(calculated, /derivedSummativeValue\s+Decimal[\s\S]*@db\.Decimal\(7, 3\)/);
  assert.doesNotMatch(calculated, /published|resultEngine|handoff/i);
});

test("calculated evidence is candidate-versioned and exact-source unique", () => {
  assert.match(calculated, /@@unique\(\[comparisonId\], map: "sum_calc_mark_comparison_uq"\)/);
  assert.match(
    calculated,
    /threeTotalCalculationId\s+String\?\s+@unique\(map: "sum_calc_mark_three_calc_uq"\)/,
  );
  assert.match(calculated, /@@unique\(\[departmentId, examinationCourseId, candidateId, calculatedMarkVersion\], map: "sum_calc_mark_candidate_version_uq"\)/);
  assert.match(migration, /CREATE UNIQUE INDEX "sum_calc_mark_candidate_version_uq"/);
});

test("member review snapshots the live appointment instance without blocking reactivation", () => {
  assert.match(schema, /enum SummativeCommitteeMemberReviewOutcome \{[\s\S]*VERIFIED[\s\S]*CORRECTION_REQUIRED/);
  for (const field of [
    "calculatedMarkVersionSnapshot",
    "committeeAssignmentId",
    "reviewerUserId",
    "reviewerSeat",
    "assignmentAssignedAtSnapshot",
    "reviewVersion",
    "outcome",
    "reviewComment",
    "reviewedAt",
  ]) {
    assert.match(review, new RegExp(`\\b${field}\\b`));
  }
  assert.match(review, /reviewComment\s+String\?[\s\S]*@db\.VarChar\(1000\)/);
  assert.match(review, /@@unique\(\[calculatedMarkId, committeeAssignmentId, assignmentAssignedAtSnapshot\]/);
  assert.match(
    review,
    /committeeAssignmentId, departmentId, committeeId\], references: \[id, departmentId, committeeId\]/,
  );
  assert.doesNotMatch(
    review,
    /committeeAssignmentId[\s\S]*?references: \[[^\]]*assignedAt/,
  );
});

test("Chairman evidence binds two exact reviews and immutable server snapshots", () => {
  for (const field of [
    "chairmanAssignmentId",
    "chairmanUserId",
    "chairmanAssignedAtSnapshot",
    "member1ReviewId",
    "member2ReviewId",
    "approvedSummativeValueSnapshot",
    "summativeFullMarkSnapshot",
    "approvalVersion",
    "approvedAt",
    "lockedAt",
  ]) {
    assert.match(approval, new RegExp(`\\b${field}\\b`));
  }
  assert.match(
    approval,
    /calculatedMarkId\s+String\s+@unique\(map: "sum_chair_approval_calc_mark_uq"\)/,
  );
  assert.match(migration, /"approved_at" = "locked_at"/);
});

test("database validates source arithmetic, current seats, formal completeness and exact reviews", () => {
  for (const contract of [
    /comparison_row\."decision" <> 'THIRD_EXAMINATION_NOT_REQUIRED'/,
    /expected_value := \(first_source\."total_mark" \+ second_source\."total_mark"\) \/ 2/,
    /expected_value := three_calc\."derived_summative_value"/,
    /NEW\."derived_summative_value" IS DISTINCT FROM expected_value/,
    /SUMMATIVE_FIRST_SECOND_AVERAGE_V1/,
    /SUMMATIVE_THREE_TOTAL_NEAREST_PAIR_V1/,
    /NEW\."reviewer_seat" NOT IN \('MEMBER_1', 'MEMBER_2'\)/,
    /"assigned_at" = NEW\."assignment_assigned_at_snapshot"/,
    /chair_row\."assigned_at" > NEW\."approved_at"/,
    /formal_seat_count <> 4/,
    /review_1\."outcome" <> 'VERIFIED'/,
    /review_2\."outcome" <> 'VERIFIED'/,
    /MEMBER_1 review is stale/,
    /MEMBER_2 review is stale/,
  ]) {
    assert.match(migration, contract);
  }
});

test("database rejects impossible calculated, review and approval chronology", () => {
  for (const chronologyRule of [
    /NEW\."calculated_at" > statement_timestamp\(\)/,
    /NEW\."created_at" < NEW\."calculated_at"/,
    /NEW\."created_at" > statement_timestamp\(\)/,
    /NEW\."calculated_at" < comparison_row\."calculated_at"/,
    /NEW\."calculated_at" < first_source\."locked_at"/,
    /NEW\."calculated_at" < second_source\."locked_at"/,
    /NEW\."calculated_at" < three_calc\."calculated_at"/,
    /NEW\."calculated_at" < third_source\."locked_at"/,
    /NEW\."reviewed_at" < calc_row\."calculated_at"/,
    /assignment_row\."assigned_at" > NEW\."reviewed_at"/,
    /NEW\."reviewed_at" > statement_timestamp\(\)/,
    /NEW\."created_at" < NEW\."reviewed_at"/,
    /NEW\."approved_at" < calc_row\."calculated_at"/,
    /NEW\."approved_at" < review_1\."reviewed_at"/,
    /NEW\."approved_at" < review_2\."reviewed_at"/,
    /chair_row\."assigned_at" > NEW\."approved_at"/,
    /NEW\."approved_at" > statement_timestamp\(\)/,
    /NEW\."approved_at" IS DISTINCT FROM NEW\."locked_at"/,
    /NEW\."created_at" < NEW\."approved_at"/,
  ]) {
    assert.match(migration, chronologyRule);
  }
  assert.match(
    calculated,
    /calculatedAt\s+DateTime\s+@default\(dbgenerated\("statement_timestamp\(\)"\)\)/,
  );
});

test("all three academic evidence tables reject direct UPDATE and DELETE", () => {
  for (const message of [
    "Summative calculated-mark evidence is immutable",
    "Summative Committee Member review evidence is immutable",
    "Summative Chairman approval/final-lock evidence is immutable",
  ]) {
    assert.match(
      migration,
      new RegExp(`IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN[\\s\\S]*?${message.replace(/[/-]/g, "\\$&")}`),
    );
  }
  assert.equal((migration.match(/BEFORE INSERT OR UPDATE OR DELETE/g) ?? []).length, 3);
});

test("migration is additive, restrictive, portable and explicitly tracked", () => {
  assert.doesNotMatch(migration, /ON (?:DELETE|UPDATE) CASCADE/i);
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|CONSTRAINT|INDEX|TYPE)/i);
  const identifiers = Array.from(
    migration.matchAll(/(?:INDEX|CONSTRAINT|TRIGGER|FUNCTION) "([^"]+)"/g),
  ).map((match) => match[1]!);
  assert.ok(identifiers.length > 0);
  for (const identifier of identifiers) {
    assert.ok(Buffer.byteLength(identifier, "utf8") <= 63, identifier);
  }
  assert.equal(migrationBytes.includes(Buffer.from("\r\n")), false);
  assert.equal(schemaBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
  assert.match(
    attributes,
    /202609020002_add_summative_calculated_committee_approval\/migration\.sql -text/,
  );
});
