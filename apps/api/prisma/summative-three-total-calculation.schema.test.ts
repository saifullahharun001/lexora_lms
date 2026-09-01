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
    "202609010004_add_summative_three_total_calculations",
    "migration.sql",
  ),
);
const schema = schemaBytes.toString("utf8");
const migration = migrationBytes.toString("utf8");
const repositoryAttributes = readFileSync(
  join(prismaRoot, "..", "..", "..", ".gitattributes"),
  "utf8",
);
const calculation =
  schema.match(/model SummativeThreeTotalCalculation \{[\s\S]*?\n\}/)?.[0] ?? "";

test("schema models immutable calculation evidence rather than approval", () => {
  assert.ok(calculation.length > 0);
  for (const field of [
    "comparisonId",
    "thirdReferralId",
    "firstSubmissionId",
    "secondSubmissionId",
    "thirdSubmissionId",
    "comparisonVersionSnapshot",
    "thirdReferralAssignmentVersionSnapshot",
    "questionConfigurationId",
    "selectedPair",
    "selectionReason",
    "derivedSummativeValue",
  ]) {
    assert.match(calculation, new RegExp(`\\b${field}\\b`));
  }
  assert.doesNotMatch(calculation, /approved|chairman|published|resultHandoff/i);
});

test("numeric precision preserves two-decimal sources and exact three-decimal averages", () => {
  for (const field of [
    "firstTotalSnapshot",
    "secondTotalSnapshot",
    "thirdTotalSnapshot",
    "summativeFullMarkSnapshot",
    "firstSecondDistance",
    "firstThirdDistance",
    "secondThirdDistance",
  ]) {
    assert.match(
      calculation,
      new RegExp(`${field}\\s+Decimal[\\s\\S]*?@db\\.Decimal\\(6, 2\\)`),
    );
  }
  assert.match(
    calculation,
    /derivedSummativeValue\s+Decimal[\s\S]*?@db\.Decimal\(7, 3\)/,
  );
  assert.match(migration, /"derived_summative_value" DECIMAL\(7,3\) NOT NULL/);
});

test("source triplet and candidate version identities are unique", () => {
  assert.match(
    calculation,
    /@@unique\(\[firstSubmissionId, secondSubmissionId, thirdSubmissionId\], map: "sum_three_calc_source_triplet_uq"\)/,
  );
  assert.match(
    calculation,
    /@@unique\(\[departmentId, examinationCourseId, candidateId, calculationVersion\], map: "sum_three_calc_candidate_version_uq"\)/,
  );
  assert.match(migration, /CREATE UNIQUE INDEX "sum_three_calc_source_triplet_uq"/);
  assert.match(migration, /CREATE UNIQUE INDEX "sum_three_calc_candidate_version_uq"/);
});

test("all academic relationships are restrictive composite identities with no cascade", () => {
  for (const constraint of [
    "sum_three_calc_department_fkey",
    "sum_three_calc_examination_fkey",
    "sum_three_calc_exam_course_fkey",
    "sum_three_calc_candidate_fkey",
    "sum_three_calc_comparison_fkey",
    "sum_three_calc_referral_fkey",
    "sum_three_calc_first_source_fkey",
    "sum_three_calc_second_source_fkey",
    "sum_three_calc_third_source_fkey",
    "sum_three_calc_config_fkey",
  ]) {
    assert.match(migration, new RegExp(`ADD CONSTRAINT "${constraint}"`));
  }
  assert.doesNotMatch(migration, /ON (?:DELETE|UPDATE) CASCADE/i);
  assert.doesNotMatch(migration, /DROP\s+(?:TABLE|COLUMN|CONSTRAINT|INDEX|TYPE)/i);
});

test("database trigger rejects mutation and revalidates exact source state and snapshots", () => {
  assert.match(
    migration,
    /IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN[\s\S]*?calculation evidence is immutable/,
  );
  for (const contract of [
    /decision" <> 'THIRD_EXAMINATION_REQUIRED'/,
    /comparison_row\."first_submission_id" <> first_source\."id"/,
    /first_source\."status" <> 'LOCKED'/,
    /second_source\."status" <> 'LOCKED'/,
    /third_source\."status" <> 'LOCKED'/,
    /comparison_row\."first_total_snapshot" IS DISTINCT FROM first_source\."total_mark"/,
    /persisted_third_total IS DISTINCT FROM third_source\."total_mark"/,
    /question configuration is invalid/,
    /calculation source snapshots are invalid/,
    /referral_row\."rule_version_code" IS DISTINCT FROM comparison_row\."rule_version_code"/,
  ]) {
    assert.match(migration, contract);
  }
});

test("database trigger independently derives distances, higher-pair tie result and exact average", () => {
  for (const contract of [
    /expected_fs := ABS\(first_source\."total_mark" - second_source\."total_mark"\)/,
    /minimum_distance := LEAST\(expected_fs, expected_ft, expected_st\)/,
    /ORDER BY p\.high_value DESC, p\.low_value DESC/,
    /expected_reason := CASE WHEN minimum_count = 1/,
    /expected_derived := CASE expected_pair/,
    /SUMMATIVE_THREE_TOTAL_NEAREST_PAIR_V1/,
    /ALL_EQUAL_CANONICAL/,
  ]) {
    assert.match(migration, contract);
  }
});

test("all explicit PostgreSQL identifiers fit the 63-byte limit", () => {
  const identifiers = Array.from(
    migration.matchAll(/(?:INDEX|CONSTRAINT|TRIGGER|FUNCTION) "([^"]+)"/g),
  ).map((match) => match[1]!);
  assert.ok(identifiers.length > 0);
  for (const identifier of identifiers) {
    assert.ok(Buffer.byteLength(identifier, "utf8") <= 63, identifier);
  }
});

test("new migration and schema are UTF-8 without BOM and migration is LF", () => {
  for (const bytes of [schemaBytes, migrationBytes]) {
    assert.equal(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
    assert.equal(Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes), true);
  }
  assert.doesNotMatch(migrationBytes.toString("utf8"), /\r\n/);
  assert.match(
    repositoryAttributes,
    /202609010004_add_summative_three_total_calculations\/migration\.sql -text/,
  );
});
