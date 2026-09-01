import assert from "node:assert/strict";
import test from "node:test";

import { SummativeExaminerComparisonDecision } from "@prisma/client";

import {
  calculateSummativeExaminerComparison,
  SUMMATIVE_EXAMINER_COMPARISON_RULE,
} from "./summative-examiner-comparison.rule";

const REQUIRED =
  SummativeExaminerComparisonDecision.THIRD_EXAMINATION_REQUIRED;
const NOT_REQUIRED =
  SummativeExaminerComparisonDecision.THIRD_EXAMINATION_NOT_REQUIRED;

function calculate(first: string, second: string, fullMark: string) {
  return calculateSummativeExaminerComparison(first, second, fullMark);
}

test("51 and 49 against authoritative 60 yields exact difference 2, six-decimal variance and no Third", () => {
  const result = calculate("51", "49", "60");
  assert.equal(result.absoluteDifference.toString(), "2");
  assert.equal(result.variancePercentage.toFixed(6), "3.333333");
  assert.equal(result.decision, NOT_REQUIRED);
});

test("difference 9 on full mark 60 is the inclusive exact 15 percent boundary", () => {
  const result = calculate("50", "41", "60");
  assert.equal(result.absoluteDifference.toString(), "9");
  assert.equal(result.variancePercentage.toFixed(6), "15.000000");
  assert.equal(result.decision, REQUIRED);
});

test("a Decimal difference immediately below 9 on full mark 60 does not require Third", () => {
  const result = calculate("50", "41.01", "60");
  assert.equal(result.absoluteDifference.toString(), "8.99");
  assert.equal(result.decision, NOT_REQUIRED);
});

test("a difference above 9 on full mark 60 requires Third", () => {
  const result = calculate("50", "40.99", "60");
  assert.equal(result.absoluteDifference.toString(), "9.01");
  assert.equal(result.decision, REQUIRED);
});

test("non-60 authoritative full mark is used and 12 of 80 is the boundary", () => {
  assert.equal(calculate("70", "58", "80").decision, REQUIRED);
  assert.equal(calculate("70", "58.01", "80").decision, NOT_REQUIRED);
});

test("absolute-value symmetry produces identical evidence", () => {
  const firstHigher = calculate("51", "42", "60");
  const secondHigher = calculate("42", "51", "60");
  assert.equal(
    firstHigher.absoluteDifference.toString(),
    secondHigher.absoluteDifference.toString(),
  );
  assert.equal(
    firstHigher.variancePercentage.toString(),
    secondHigher.variancePercentage.toString(),
  );
  assert.equal(firstHigher.decision, secondHigher.decision);
});

test("equal totals produce zero difference, zero variance and no Third", () => {
  const result = calculate("49", "49", "60");
  assert.equal(result.absoluteDifference.toString(), "0");
  assert.equal(result.variancePercentage.toString(), "0");
  assert.equal(result.decision, NOT_REQUIRED);
});

test("decision uses exact cross multiplication rather than rounded variance", () => {
  const result = calculate("1499.99", "0", "9999.99");
  assert.equal(result.variancePercentage.toFixed(6), "14.999915");
  assert.equal(result.variancePercentage.toFixed(2), "15.00");
  assert.equal(result.decision, NOT_REQUIRED);
});

test("rule identity and threshold are explicit versioned academic evidence", () => {
  const result = calculate("51", "49", "60");
  assert.equal(result.thresholdPercentage.toFixed(2), "15.00");
  assert.equal(
    result.ruleVersionCode,
    "SUMMATIVE_FS_VARIANCE_15_PERCENT_V1",
  );
  assert.deepEqual(SUMMATIVE_EXAMINER_COMPARISON_RULE, {
    versionCode: "SUMMATIVE_FS_VARIANCE_15_PERCENT_V1",
    thresholdPercentage: "15.00",
    varianceScale: 6,
  });
});

test("invalid source totals or nonpositive authoritative full marks fail closed", () => {
  for (const values of [
    ["1", "1", "0"],
    ["1", "1", "-1"],
    ["-1", "0", "60"],
    ["61", "0", "60"],
  ] as const) {
    const [firstTotal, secondTotal, fullMark] = values;
    assert.throws(
      () => calculate(firstTotal, secondTotal, fullMark),
      RangeError,
    );
  }
});
